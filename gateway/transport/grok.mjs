import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { request as createHTTPSRequest } from "node:https";
import { Transform, pipeline } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import {
  readGrokAccessToken,
  refreshGrokOAuthSession,
  sanitizeGrokChildEnvironment,
} from "../core/grok-credentials.mjs";


const LOOPBACK_HOST = "127.0.0.1";
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_INTERNAL_CAPABILITY_BYTES = 1_024;
const MAX_PROMPT_CACHE_KEY_BYTES = 256;
const MAX_UPSTREAM_RESPONSE_BYTES = 64 * 1024 * 1024;
const UPSTREAM_HOST = "cli-chat-proxy.grok.com";
const UPSTREAM_PATH = "/v1/responses";
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

class InvalidRequestError extends Error {}

function sendJson(response, status, body, headers = {}) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "content-length": String(payload.length),
    "content-type": "application/json",
    ...headers,
  });
  response.end(payload);
}

function promptCacheSessionID(body) {
  if (!Object.hasOwn(body, "prompt_cache_key")) return randomUUID();
  const value = body.prompt_cache_key;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > MAX_PROMPT_CACHE_KEY_BYTES
  ) {
    throw new InvalidRequestError(
      `prompt_cache_key must be a non-empty string of at most ${MAX_PROMPT_CACHE_KEY_BYTES} UTF-8 bytes.`,
    );
  }
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

function matchesInternalCapability(received, expected) {
  if (typeof received !== "string") return false;
  const receivedBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes);
}

function jsonArguments(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function customInput(argumentsText) {
  try {
    const parsed = JSON.parse(argumentsText || "{}");
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 1 &&
      typeof parsed.input === "string"
    ) {
      return parsed.input;
    }
  } catch {}
  return argumentsText || "";
}

function qualify(namespace, name) {
  if (!namespace || !name || name.startsWith("mcp__")) return name;
  const prefix = namespace.endsWith("__") ? namespace : `${namespace}__`;
  return name.startsWith(prefix) ? name : `${prefix}${name}`;
}

function normalizeTool(tool, maps, namespace = "", loaded = false) {
  if (!tool || typeof tool !== "object" || Array.isArray(tool)) return null;
  if (maps.searchName && tool.defer_loading === true && !loaded) return null;
  if (tool.type === "namespace") {
    const nested = Array.isArray(tool.tools)
      ? tool.tools
      : Array.isArray(tool.children)
        ? tool.children
        : [];
    return nested
      .map((child) => normalizeTool(child, maps, tool.name || tool.namespace || "", loaded))
      .flat()
      .filter(Boolean);
  }
  if (tool.type === 'tool_search' && maps.searchName) {
    if (tool.execution !== 'client' || tool.parameters?.type !== 'object') throw new InvalidRequestError('Tool search requires a client-executed object schema.');
    return {type:'function',name:maps.searchName,description:tool.description ?? 'Search for and load tools available to this Codex task.',parameters:tool.parameters};
  }
  if (tool.type === "tool_search" || tool.type === "image_generation" || (tool.type === "web_search" && tool.external_web_access === false)) {
    maps.unavailable.add(tool.type === 'web_search' ? 'cached-only web search' : tool.type);
    return null;
  }

  const normalized = { ...tool };
  delete normalized.defer_loading;
  if (tool.type === 'web_search') delete normalized.external_web_access;
  if (tool.type === "custom") {
    maps.customNames.add(qualify(namespace, tool.name));
    normalized.type = "function";
    delete normalized.format;
    if (tool.format?.type === 'grammar' && typeof tool.format.definition === 'string') {
      normalized.description = `${tool.description ?? ''}\nThe input string must match this ${tool.format.syntax ?? ''} grammar:\n${tool.format.definition}`;
    }
    normalized.parameters = tool.parameters ?? {
      type: "object",
      properties: { input: { type: "string" } },
      required: ["input"],
      additionalProperties: false,
    };
  }
  if (normalized.type === "function" && !normalized.parameters) {
    normalized.parameters = { type: "object", properties: {} };
  }
  if (namespace && normalized.type === "function" && normalized.name) {
    const qualified = qualify(namespace, normalized.name);
    const previous=maps.namespaces.get(qualified);
    if (previous && (previous.namespace !== namespace || previous.name !== normalized.name)) throw new InvalidRequestError('Conflicting namespaced tool identities.');
    maps.namespaces.set(qualified, { namespace, name: normalized.name });
    normalized.name = qualified;
  }
  if (maps.searchName && normalized.name === maps.searchName) throw new InvalidRequestError('A tool conflicts with the reserved search adapter name.');
  return normalized;
}

function normalizeInputItem(item, maps) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  if (maps.searchName && ['tool_search_call','tool_search_output'].includes(item.type)) {
    if (item.execution !== 'client' || typeof item.call_id !== 'string') throw new InvalidRequestError('Tool search history requires client execution and a call ID.');
    if (item.type === 'tool_search_call') return {type:'function_call',call_id:item.call_id,name:maps.searchName,arguments:JSON.stringify(searchArguments(item.arguments))};
    if (!Array.isArray(item.tools)) throw new InvalidRequestError('Tool search output requires tool definitions.');
    return {type:'function_call_output',call_id:item.call_id,output:JSON.stringify(item.tools)};
  }
  if (item.type === "custom_tool_call") {
    const name = qualify(item.namespace, item.name);
    if (item.namespace && name) {
      maps.namespaces.set(name, {
        namespace: item.namespace,
        name: item.name,
      });
    }
    return {
      type: "function_call",
      call_id: item.call_id,
      name,
      arguments: jsonArguments(
        typeof item.input === "string" ? { input: item.input } : item.input,
      ),
    };
  }
  if (item.type === "custom_tool_call_output") {
    return {
      type: "function_call_output",
      call_id: item.call_id,
      output:
        typeof item.output === "string"
          ? item.output
          : JSON.stringify(item.output ?? ""),
    };
  }
  if (item.type === "function_call" && item.namespace) {
    return {
      ...item,
      name: qualify(item.namespace, item.name),
      namespace: undefined,
    };
  }
  return item;
}

export function prepareGrokResponsesRequest(body) {
  const maps = { customNames: new Set(), namespaces: new Map(), unavailable: new Set() };
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { body, maps };
  }

  const sourceInput = Array.isArray(body.input) ? body.input : [];
  const declarations = [...(Array.isArray(body.tools) ? body.tools : []), ...sourceInput.filter(i=>i?.type==='additional_tools').flatMap(i=>i.tools??[])];
  if (body.model === 'grok-4.6' && (declarations.some(t=>t?.type==='tool_search') || sourceInput.some(i=>i?.type==='tool_search_call'))) maps.searchName='switchboard_tool_search';
  const input = [];
  const promotedTools = [];
  const loadedTools = [];
  for (const item of Array.isArray(body.input) ? body.input : []) {
    if (item?.type === "additional_tools" && Array.isArray(item.tools)) {
      promotedTools.push(...item.tools);
    } else if (maps.searchName && item?.type === 'tool_search_output') {
      input.push(normalizeInputItem(item,maps));
      loadedTools.push(...item.tools);
    } else if (item?.type === "reasoning") {
      // Reasoning and compaction state is encrypted by the originating
      // provider. It is not portable across Responses implementations, so
      // retain the visible transcript and tool history but omit it.
      continue;
    } else {
      input.push(normalizeInputItem(item, maps));
    }
  }
  const originalTools = [
    ...(Array.isArray(body.tools) ? body.tools : []),
    ...promotedTools,
  ];
  const tools = originalTools
    .flatMap((tool) => normalizeTool(tool, maps) ?? [])
    .filter(Boolean);
  tools.push(...loadedTools.flatMap(tool=>normalizeTool(tool,maps,'',true)??[]));
  const uniqueTools = new Map();
  for (const tool of tools) {
    const key=JSON.stringify([tool.type,tool.name]);
    if (uniqueTools.has(key) && JSON.stringify(uniqueTools.get(key))!==JSON.stringify(tool)) throw new InvalidRequestError('Conflicting definitions for a loaded tool.');
    uniqueTools.set(key,tool);
  }

  const prepared = {
    ...body,
    stream: true,
    ...(Array.isArray(body.input) ? { input } : {}),
  };
  if (body.tool_choice && typeof body.tool_choice === 'object' && ['function', 'custom'].includes(body.tool_choice.type)) {
    prepared.tool_choice = {type:'function', name:qualify(body.tool_choice.namespace, body.tool_choice.name)};
  }
  if (body.tool_choice?.type === 'tool_search' && maps.searchName) {
    if (!tools.some(tool=>tool.name===maps.searchName)) throw new InvalidRequestError('The selected tool search is not registered in this request.');
    prepared.tool_choice={type:'function',name:maps.searchName};
  }
  if (maps.unavailable.size) {
    // Cached-only must never become live search. Explain the unavailable
    // provider built-ins in the model's instructions while retaining coding
    // tools and already supplied MCP definitions.
    prepared.instructions = `${prepared.instructions ?? ''}\nProvider capability notice: ${[...maps.unavailable].join(', ')} unavailable on this subscription transport. Do not claim to use them. Cached-only search does not authorize live web access.`;
    if (body.tool_choice && typeof body.tool_choice === 'object' && !tools.some(tool => tool.type === prepared.tool_choice.type && (!prepared.tool_choice.name || tool.name === prepared.tool_choice.name))) throw new InvalidRequestError('The explicitly selected tool is unavailable on this subscription transport.');
  }
  delete prepared.previous_response_id;
  delete prepared.prompt_cache_retention;
  delete prepared.safety_identifier;
  delete prepared.stream_options;
  if (originalTools.length > 0 || loadedTools.length > 0) {
    if (tools.length > 0) prepared.tools = [...uniqueTools.values()];
    else delete prepared.tools;
  }
  if (!prepared.tools?.length) {
    delete prepared.tool_choice;
    delete prepared.parallel_tool_calls;
  }
  return { body: prepared, maps };
}

// Preserve JSON strings and large integer lexemes exactly. Codex integer fields
// reject 15.0 even though it has the same mathematical value as 15.
export function normalizeIntegralArguments(value) {
  if (typeof value !== "string") return value;
  try { JSON.parse(value); } catch { return value; }
  return value.replace(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token => {
    if (!/^-?\d+\.0+$/.test(token)) return token;
    const number = Number(token);
    return Number.isSafeInteger(number) ? token.slice(0, token.indexOf('.')) : token;
  });
}

function searchArguments(value) {
  let parsed=value;
  if (typeof value === 'string') { try { parsed=JSON.parse(value || '{}'); } catch { throw new InvalidRequestError('Tool search returned invalid JSON arguments.'); } }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new InvalidRequestError('Tool search arguments must be an object.');
  return parsed;
}

function restoreToolItem(item, maps) {
  if (!item || typeof item !== "object" || item.type !== "function_call") {
    return item;
  }
  if (maps.searchName && item.name === maps.searchName) {
    const restored={...item,type:'tool_search_call',execution:'client',arguments:searchArguments(item.arguments ?? '{}')};
    delete restored.name;delete restored.namespace;
    return restored;
  }
  const namespace = maps.namespaces.get(item.name);
  const base = namespace
    ? { ...item, name: namespace.name, namespace: namespace.namespace }
    : item;
  if (!maps.customNames.has(item.name)) return { ...base, ...(base.arguments !== undefined ? { arguments: normalizeIntegralArguments(base.arguments) } : {}) };
  const restored = {
    ...base,
    type: "custom_tool_call",
    input: customInput(base.arguments),
  };
  delete restored.arguments;
  return restored;
}

export function restoreGrokResponsesEvent(event, maps) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return event;
  let restored = { ...event };
  if (restored.item) restored.item = restoreToolItem(restored.item, maps);
  if (restored.response?.output) {
    restored.response = {
      ...restored.response,
      output: restored.response.output.map((item) => restoreToolItem(item, maps)),
    };
  }
  const isCustom = restored.item?.type === "custom_tool_call";
  if (isCustom) {
    if (restored.type === "response.function_call_arguments.delta") {
      restored.type = "response.custom_tool_call_input.delta";
      restored.delta = customInput(restored.delta);
    } else if (restored.type === "response.function_call_arguments.done") {
      restored.type = "response.custom_tool_call_input.done";
      restored.input = customInput(restored.arguments);
      delete restored.arguments;
    }
  }
  return restored;
}

export function createSSETransform(maps) {
  let pending = "";
  const decoder = new StringDecoder("utf8");
  const customIDs = new Set();
  const searchIDs = new Set();
  const emitted = new Set();
  function record(value) {
    const lines = value.split(/\r?\n/);
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
    if (!data || data === '[DONE]') return `${value}\n\n`;
    let event;
    try { event = JSON.parse(data); } catch { throw new Error('Invalid upstream SSE JSON'); }
    const restored = restoreGrokResponsesEvent(event, maps);
    const id = event.item_id ?? event.item?.id ?? event.item?.call_id;
    if (restored.item?.type === 'tool_search_call') searchIDs.add(id);
    if (searchIDs.has(id) && ['response.function_call_arguments.delta','response.function_call_arguments.done'].includes(event.type)) return '';
    if (restored.item?.type === 'custom_tool_call') customIDs.add(id);
    // Custom arguments are JSON on xAI's wire. Emit their decoded input once
    // complete, never JSON fragments disguised as raw patch/code deltas.
    if (customIDs.has(id)) {
      if (event.type === 'response.function_call_arguments.delta') return '';
      if (event.type === 'response.function_call_arguments.done') {
        const input = customInput(event.arguments);
        restored.type = 'response.custom_tool_call_input.done';
        restored.input = input; delete restored.arguments;
        const delta = emitted.has(id) ? '' : `data: ${JSON.stringify({ type: 'response.custom_tool_call_input.delta', item_id: id, output_index: event.output_index, delta: input })}\n\n`;
        emitted.add(id);
        return delta + `data: ${JSON.stringify(restored)}\n\n`;
      }
    }
    if (restored.type === 'response.function_call_arguments.done') restored.arguments = normalizeIntegralArguments(restored.arguments);
    return `data: ${JSON.stringify(restored)}\n\n`;
  }
  return new Transform({
    transform(chunk, _encoding, callback) {
      try {
        pending += decoder.write(chunk);
        if (Buffer.byteLength(pending) > MAX_BODY_BYTES) throw new Error('Upstream SSE record exceeded the bridge limit');
        const records = pending.split(/\r?\n\r?\n/);
        pending = records.pop() ?? '';
        for (const value of records) this.push(record(value));
        callback();
      } catch (error) { callback(error); }
    },
    flush(callback) {
      try { pending += decoder.end(); if (pending) this.push(record(pending)); callback(); }
      catch (error) { callback(error); }
    },
  });
}

function forwardedUpstreamHeaders(headers) {
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value == null || HOP_BY_HOP_HEADERS.has(name.toLowerCase())) continue;
    if (name.toLowerCase() === "content-length") continue;
    result[name] = value;
  }
  return result;
}

function collectResponse(response, maximumBytes = MAX_UPSTREAM_RESPONSE_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    response.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maximumBytes) {
        response.destroy();
        reject(new Error("xAI response exceeded the bridge limit"));
        return;
      }
      chunks.push(chunk);
    });
    response.once("end", () => resolve(Buffer.concat(chunks)));
    response.once("error", reject);
  });
}

function parsedResponseFromSSE(payload, maps) {
  let completed = null;
  let error = null;
  for (const line of payload.toString("utf8").split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    try {
      const event = restoreGrokResponsesEvent(
        JSON.parse(line.slice(5).trim()),
        maps,
      );
      if (
        event?.type === "response.completed" ||
        event?.type === "response.incomplete"
      ) {
        completed = event.response;
      }
      if (event?.type === "response.failed" || event?.type === "error") {
        error = event.error ?? event.response?.error ?? {
          type: "api_error",
          message: "xAI request failed",
        };
      }
    } catch {}
  }
  return { completed, error };
}

function createByteLimitTransform(maximumBytes = MAX_UPSTREAM_RESPONSE_BYTES) {
  let bytes = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maximumBytes) {
        callback(new Error("xAI response exceeded the bridge limit"));
        return;
      }
      callback(null, chunk);
    },
  });
}

function upstreamRequest({
  payload,
  token,
  sessionID,
  cliVersion,
  requestImpl,
  onResponse,
}) {
  const request = requestImpl(
    {
      protocol: "https:",
      hostname: UPSTREAM_HOST,
      port: 443,
      method: "POST",
      path: UPSTREAM_PATH,
      headers: {
        accept: "text/event-stream",
        authorization: `Bearer ${token}`,
        "content-length": String(payload.length),
        "content-type": "application/json",
        "user-agent": `xai-grok-workspace/${cliVersion}`,
        "x-grok-client-version": cliVersion,
        "x-xai-token-auth": "xai-grok-cli",
        ...(sessionID ? { "x-grok-conv-id": sessionID } : {}),
      },
    },
    onResponse,
  );
  request.end(payload);
  return request;
}

function openUpstreamRequest(options, onError) {
  try {
    const request = upstreamRequest(options);
    request.once("error", onError);
    return request;
  } catch (error) {
    onError(error);
    return null;
  }
}

export function createGrokTransport({
  credentialPath, cliPath, cliVersion = "0.2.111", tokenProvider = readGrokAccessToken,
  refresh = refreshGrokOAuthSession, requestImpl = createHTTPSRequest,
  cliEnvironment = process.env, internalCapability,
  maximumUpstreamResponseBytes = MAX_UPSTREAM_RESPONSE_BYTES,
}) {
  if (typeof internalCapability !== "string" || internalCapability.length < 16 || Buffer.byteLength(internalCapability) > MAX_INTERNAL_CAPABILITY_BYTES || /[^\x21-\x7e]/.test(internalCapability)) throw new Error("Invalid internal Grok capability");
  const childEnvironment = sanitizeGrokChildEnvironment(cliEnvironment);
  let refreshInFlight = null;
  const refreshSession = () => {
    refreshInFlight ||= Promise.resolve().then(() => refresh({cliPath, env:childEnvironment})).finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  };
  return createServer((request, response) => {
    if (!matchesInternalCapability(request.headers["x-api-key"], internalCapability)) { sendJson(response, 401, {error:{type:"authentication_error",message:"Internal transport authentication failed."}}); return; }
    if (request.method !== "POST" || request.url !== "/v1/responses") { sendJson(response,404,{error:{type:"not_found",message:"Internal route not found."}}); return; }
    const chunks=[]; let bytes=0, rejected=false;
    request.on("data",chunk => {
      if(rejected)return;
      bytes+=chunk.length;
      if(bytes>MAX_BODY_BYTES){rejected=true;sendJson(response,413,{error:{type:"request_too_large",message:"Request exceeds 10 MiB."}});return;}
      chunks.push(chunk);
    });
    request.on("end",()=>{
      if(rejected)return;
      let parsed, prepared, payload, sessionID;
      try {
        parsed=JSON.parse(Buffer.concat(chunks));
        if(!parsed || typeof parsed!=="object" || Array.isArray(parsed))throw new Error();
        prepared=prepareGrokResponsesRequest(parsed);
        payload=Buffer.from(JSON.stringify(prepared.body));sessionID=promptCacheSessionID(parsed);
        if(payload.length>MAX_BODY_BYTES)throw new Error();
      } catch (error) {sendJson(response,400,{error:{type:"invalid_request",message:error instanceof InvalidRequestError ? error.message : "The request could not be processed."}});return;}
      let activeUpstream=null,retried=false;
      const fail=()=>{if(!response.destroyed&&!response.writableEnded)sendJson(response,502,{error:{type:"upstream_unavailable",message:"The xAI subscription transport is unavailable."}});};
      const send=()=>{
        let token;try{token=tokenProvider(credentialPath);}catch{fail();return;}
        activeUpstream=openUpstreamRequest({payload,token,sessionID,cliVersion,requestImpl,onResponse:async upstream=>{
          if(upstream.statusCode===401&&!retried){retried=true;upstream.resume();try{await refreshSession();}catch{fail();return;}if(!response.destroyed&&!response.writableEnded)send();return;}
          if((upstream.statusCode??500)>=300){upstream.resume();sendJson(response,upstream.statusCode??502,{error:{type:upstream.statusCode===429?"rate_limit_error":"provider_rejected",message:"The xAI subscription request was rejected. No fallback was used."}});return;}
          if(parsed.stream===true){response.writeHead(upstream.statusCode||200,{...forwardedUpstreamHeaders(upstream.headers),"content-type":"text/event-stream"});pipeline(upstream,createByteLimitTransform(maximumUpstreamResponseBytes),createSSETransform(prepared.maps),response,error=>{if(error&&!response.destroyed)response.destroy();});return;}
          try{const body=await collectResponse(upstream,maximumUpstreamResponseBytes);const {completed,error}=parsedResponseFromSSE(body,prepared.maps);if(error||!completed){fail();return;}sendJson(response,200,completed);}catch{fail();}
        }},fail);
        activeUpstream?.setTimeout?.(120000,()=>activeUpstream.destroy());
      };
      const abort=()=>{if(!response.writableFinished)activeUpstream?.destroy();};
      request.once("aborted",abort);response.once("close",abort);send();
    });
  });
}
export function startGrokTransport({host=LOOPBACK_HOST,port,...options}) {
  if(host!==LOOPBACK_HOST)throw new Error("Internal Grok transport must bind to loopback");
  const server=createGrokTransport(options);
  return new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,host,()=>resolve(server));});
}
