import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Transform, pipeline } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import * as zlib from 'node:zlib';
import { BoardError, safeError } from '../core/errors.mjs';
import { resolveRoute } from '../core/routes.mjs';
import { HistoryOwnership, normalizeHistory, prepareExternal } from './compatibility.mjs';

export const MAX_BODY = 10 * 1024 * 1024;
export const SENTINEL = 'codex-switchboard-local-only';
const hop = new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade','host']);
const externalAllowed = new Set(['accept','content-type','openai-beta','user-agent','x-openai-subagent']);
export function externalHeaders(headers, capability, length) {
  const result = {};
  for (const [key,value] of Object.entries(headers)) if (externalAllowed.has(key.toLowerCase()) && value != null) result[key.toLowerCase()] = value;
  result['x-api-key'] = capability; result['content-length'] = String(length); result['content-type'] = 'application/json';
  return result;
}
export function nativeHeaders(headers, length, normalized) {
  const result = {}, extra = new Set(String(headers.connection ?? '').toLowerCase().split(',').map(v => v.trim()));
  for (const [key,value] of Object.entries(headers)) {
    if (value == null || hop.has(key) || extra.has(key) || key.startsWith('sec-fetch-') || key === 'origin' || key === 'content-length' || key === 'x-api-key' || key === 'cookie' || key === 'cookie2') continue;
    if (normalized && key === 'content-encoding') continue;
    result[key] = value;
  }
  if (length) result['content-length'] = String(length);
  return result;
}
export function decodeBody(raw, encoding) {
  if (raw.length > MAX_BODY) throw new BoardError('request_too_large', 'Request or image exceeds the 10 MiB limit.', 413);
  const kind = String(encoding ?? 'identity').toLowerCase().trim();
  let decoded;
  try {
    const options = { maxOutputLength: MAX_BODY };
    if (kind === 'identity' || kind === '') decoded = raw;
    else if (kind === 'gzip') decoded = zlib.gunzipSync(raw, options);
    else if (kind === 'deflate') decoded = zlib.inflateSync(raw, options);
    else if (kind === 'br') decoded = zlib.brotliDecompressSync(raw, options);
    else if (kind === 'zstd' && zlib.zstdDecompressSync) decoded = zlib.zstdDecompressSync(raw, options);
    else throw new BoardError('unsupported_encoding', 'This request compression is unsupported.', 415);
  } catch (error) {
    if (error instanceof BoardError) throw error;
    if (error.code === 'ERR_BUFFER_TOO_LARGE' || /larger than|size|length/i.test(error.message)) throw new BoardError('request_too_large', 'Decompressed request or image exceeds the 10 MiB limit.', 413);
    throw new BoardError('invalid_compression', 'The compressed request could not be decoded.');
  }
  if (decoded.length > MAX_BODY) throw new BoardError('request_too_large', 'Decompressed request or image exceeds the 10 MiB limit.', 413);
  return decoded;
}
export function parseBody(bytes) {
  if (!bytes.length) return null;
  let parsed;
  try { parsed = JSON.parse(bytes); } catch { throw new BoardError('invalid_json', 'The request body must be valid JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BoardError('invalid_json', 'The request body must be a JSON object.');
  const stack = [[parsed, 1]];
  while (stack.length) {
    const [value, depth] = stack.pop();
    if (depth > 100) throw new BoardError('request_too_deep', 'The request exceeds the nesting limit of 100.');
    for (const child of Object.values(value)) if (child !== null && typeof child === 'object') stack.push([child, depth + 1]);
  }
  return parsed;
}
export function normalizePath(rawURL) {
  if (!rawURL?.startsWith('/') || rawURL.startsWith('//')) throw new BoardError('invalid_path', 'Unsupported proxy path.', 404);
  const url = new URL(rawURL, 'http://127.0.0.1');
  const match = /^\/codex\/(?:v1\/){1,2}([a-zA-Z0-9_/-]+)$/.exec(url.pathname);
  if (!match || match[1].includes('..')) throw new BoardError('invalid_path', 'Unsupported proxy path.', 404);
  return { path: '/' + match[1], query: url.search };
}
function json(response, status, value) {
  if (response.headersSent) { response.destroy(); return; }
  response.writeHead(status, { 'content-type':'application/json', 'cache-control':'no-store', 'x-codex-switchboard':'1' });
  response.end(JSON.stringify(value));
}
function collect(request) {
  const declared=Number(request.headers['content-length']);
  if(Number.isFinite(declared)&&declared>MAX_BODY){request.resume();return Promise.reject(new BoardError('request_too_large','Request or image exceeds the 10 MiB limit.',413));}
  return new Promise((resolve,reject)=>{
    let chunks=[],length=0,finished=false;
    const cleanup=()=>{request.off('data',data);request.off('end',end);request.off('error',error);request.off('aborted',aborted);};
    const error=problem=>{if(finished)return;finished=true;chunks=[];cleanup();request.resume();reject(problem);};
    const aborted=()=>error(new BoardError('request_cancelled','The client cancelled the request.',400));
    const data=chunk=>{length+=chunk.length;if(length>MAX_BODY){error(new BoardError('request_too_large','Request or image exceeds the 10 MiB limit.',413));return;}chunks.push(chunk);};
    const end=()=>{if(finished)return;finished=true;cleanup();resolve(Buffer.concat(chunks));};
    request.on('data',data);request.once('end',end);request.once('error',error);request.once('aborted',aborted);
  });
}
function responseHeaders(headers) {
  const result = {};
  for (const [key,value] of Object.entries(headers)) if (value != null && !hop.has(key) && !key.startsWith('access-control-') && key !== 'set-cookie') result[key] = value;
  result['x-codex-switchboard'] = '1';
  return result;
}
function observer(provider, ownership, status) {
  let pending = '', inspect = true;
  const decoder = new StringDecoder('utf8');
  const record = text => {
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      try {
        const event = JSON.parse(line.slice(5));
        if (event.item?.id) ownership.record(event.item.id, provider);
        if (event.response?.id) ownership.record(event.response.id, provider);
        for (const item of event.response?.output ?? []) ownership.record(item.id, provider);
        if (event.type === 'response.completed') status.result = 'completed';
        if (event.type === 'response.incomplete') status.result = 'incomplete';
        if (event.type === 'response.failed' || event.type === 'error') status.result = 'provider_error';
      } catch {}
    }
  };
  return new Transform({
    transform(chunk, _encoding, callback) {
      if (inspect) {
        pending += decoder.write(chunk);
        if (pending.length > MAX_BODY) { pending = ''; inspect = false; }
        else {
          const parts = pending.split(/\r?\n\r?\n/); pending = parts.pop() ?? '';
          for (const part of parts) record(part);
        }
      }
      callback(null, chunk);
    },
    flush(callback) { if (inspect && pending) record(pending + decoder.end()); pending = ''; callback(); },
  });
}
function jsonOwnershipObserver(provider, ownership) {
  let chunks=[],length=0,inspect=true;
  return new Transform({
    transform(chunk,_encoding,callback){
      length+=chunk.length;
      if(length>MAX_BODY){chunks=[];inspect=false;}
      if(inspect)chunks.push(chunk);
      callback(null,chunk);
    },
    flush(callback){
      if(inspect){try{const body=JSON.parse(Buffer.concat(chunks));ownership.record(body.id,provider);for(const item of body.output??[])ownership.record(item?.id,provider);}catch{}}
      chunks=[];callback();
    },
  });
}
export function createProxy({ getRegistry, getWorker, onRoute = () => {}, isNativePaused = () => false, nativeOrigins, ownership = new HistoryOwnership() }) {
  // Alternative origins are an injected local-fixture seam, never user config
  // or incoming headers. Production calls omit this argument.
  const origins = nativeOrigins ?? { chatgpt:'https://chatgpt.com/backend-api/codex', openai:'https://api.openai.com/v1' };
  const active = new Map();
  const server = createServer(async (request, response) => {
    let route, upstream;
    const status = { startedAt: Date.now(), result: 'routing' };
    try {
      if (request.socket.remoteAddress !== '127.0.0.1' || request.headers.origin != null || request.headers['sec-fetch-site'] != null || !/^(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/.test(request.headers.host ?? '')) throw new BoardError('forbidden_origin', 'Only local Codex clients may use this gateway.', 403);
      if (request.url === '/health' && request.method === 'GET') { json(response, 200, { service:'codex-switchboard', version:1 }); return; }
      if (!['POST','GET'].includes(request.method)) throw new BoardError('method_not_allowed', 'Unsupported request method.', 405);
      const endpoint = normalizePath(request.url);
      const raw = await collect(request);
      if (response.destroyed) return;
      if (raw.length && !/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) throw new BoardError('invalid_content_type', 'Use application/json.', 415);
      const decoded = decodeBody(raw, request.headers['content-encoding']);
      const body = parseBody(decoded);
      route = resolveRoute(body, getRegistry());
      status.provider = route.provider; status.model = route.model; status.selector = route.selector ?? route.model; status.effort = route.effort ?? null; status.result = 'running';
      let payload = raw, headers, target;
      if (route.provider === 'native') {
        if (isNativePaused()) throw new BoardError('native_paused', 'Native requests are paused for an account handoff. Restart existing CLI processes after switching.', 503);
        if (String(request.headers.authorization ?? '').includes(SENTINEL)) throw new BoardError('native_login_required', route.reviewer ? 'The native approval reviewer needs a Codex login. Sign in, or choose manual approval in Codex.' : 'Native models need a Codex login or an OpenAI API key.', 401);
        if (endpoint.path !== '/responses' && Array.isArray(body?.input) && body.input.some(item => ownership.owner(item?.id) && ownership.owner(item.id) !== 'native')) throw new BoardError('external_compaction_unsupported', 'External compaction is unsupported. Start a new task for this provider.');
        const normalized = normalizeHistory(body, route, ownership);
        if (normalized.changed) payload = Buffer.from(JSON.stringify(normalized.body));
        headers = nativeHeaders(request.headers, payload.length, normalized.changed);
        target = new URL((request.headers['chatgpt-account-id'] ? origins.chatgpt : origins.openai) + endpoint.path + endpoint.query);
      } else {
        if (endpoint.path !== '/responses' || request.method !== 'POST') throw new BoardError('external_endpoint_unsupported', 'This external endpoint, including compaction, is unsupported. Start a new task for this provider.', 400);
        const worker = await getWorker(route.provider, route.selector);
        if (!worker?.port) throw new BoardError('provider_unavailable', 'The selected provider is not connected. No other provider was used.', 503);
        payload = Buffer.from(JSON.stringify(prepareExternal(body, route, request.headers, ownership)));
        if (payload.length > MAX_BODY) throw new BoardError('request_too_large', 'The normalized request exceeds 10 MiB.', 413);
        target = new URL(`http://127.0.0.1:${worker.port}/v1/responses`);
        headers = externalHeaders(request.headers, worker.capability, payload.length);
      }
      if (response.destroyed) return;
      onRoute({ ...status });
      upstream = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, { method:request.method, headers }, incoming => {
        status.httpStatus = incoming.statusCode;
        // No redirect is followed, so no destination can inherit credentials.
        if ((incoming.statusCode ?? 500) >= 300) {
          incoming.resume();
          status.result = 'provider_error';
          const code = incoming.statusCode === 429 ? 'quota_or_rate_limit' : incoming.statusCode === 401 || incoming.statusCode === 403 ? 'authentication_or_entitlement' : 'upstream_error';
          json(response, incoming.statusCode ?? 502, { error:{ code, message: route.reviewer ? 'Native approval review failed. Sign in to Codex or choose manual approval in Codex.' : 'The selected provider rejected this request. No fallback was used.' } });
          return;
        }
        response.writeHead(incoming.statusCode ?? 200, responseHeaders(incoming.headers));
        const isSSE = String(incoming.headers['content-type'] ?? '').includes('text/event-stream');
        const isJSON=String(incoming.headers['content-type']??'').includes('application/json');
        const streams = !incoming.headers['content-encoding'] && (isSSE||isJSON) ? [incoming, isSSE?observer(route.provider,ownership,status):jsonOwnershipObserver(route.provider,ownership), response] : [incoming, response];
        pipeline(...streams, error => {
          if (error) status.result = response.destroyed ? 'cancelled' : 'stream_error';
          else if (status.result === 'running') status.result = isSSE ? 'stream_ended' : 'completed';
          status.finishedAt = Date.now(); onRoute({ ...status });
        });
      });
      active.set(upstream, route.provider);
      const finish = () => { active.delete(upstream); status.finishedAt = Date.now(); onRoute({ ...status }); };
      upstream.once('error', () => { status.result = 'transport_error'; json(response, 502, { error:{ code:'transport_error', message:'The selected provider connection failed. No fallback was used.' } }); });
      upstream.setTimeout(120000, () => upstream.destroy(new Error('upstream_timeout')));
      response.once('close', () => { if (!response.writableFinished) { status.result = 'cancelled'; upstream.destroy(); } finish(); });
      response.once('finish', finish);
      upstream.end(payload.length ? payload : undefined);
    } catch (error) {
      const safe = safeError(error); status.result = safe.code; status.finishedAt = Date.now();
      if (route) onRoute({ ...status });
      json(response, error.status ?? 500, { error:safe });
    }
  });
  server.on('upgrade', (request, socket) => { socket.end('HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); });
  server.headersTimeout = 15000; server.requestTimeout = 30000; server.keepAliveTimeout = 5000;
  server.abortProvider = provider => { for (const [request,p] of active) if (p === provider) request.destroy(); };
  return server;
}
