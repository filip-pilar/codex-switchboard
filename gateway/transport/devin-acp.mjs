import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { randomUUID, createHash } from "node:crypto";
import { helperCommand } from "../service/workers.mjs";
import {
  privateDirectory,
  atomicWrite,
  readProtected,
  writeJSON,
} from "../core/files.mjs";
import { parseBody, decodeBody, MAX_BODY } from "../codex/proxy.mjs";
import {
  flattenTools,
  relayTools,
  promptBlocks,
  toolItem,
} from "./acp/protocol.mjs";
import { findCallerTool } from "./acp/tool-names.mjs";
import { AgentTasks } from "./acp/agent-tasks.mjs";
import { SessionCalls } from "./acp/session-calls.mjs";

async function bodyOf(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Error("request_too_large");
    chunks.push(c);
  }
  return parseBody(
    decodeBody(Buffer.concat(chunks), req.headers["content-encoding"]),
  );
}
function json(res, status, code) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res
    .writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
    })
    .end(
      JSON.stringify({
        error: {
          code,
          message:
            "Devin ACP could not complete this request. No fallback was used.",
        },
      }),
    );
}
function runtimeCommand() {
  const command = helperCommand(["--acp-relay"]);
  return [command.executable, ...command.args];
}

// One isolated official-CLI process per conversation. Tool results are bound to
// issued opaque call IDs. The gateway never executes caller shell/file tools.
export async function startDevinACPTransport({
  port = 0,
  internalCapability,
  credentialPath,
  cliPath,
  maxSessions = 8,
  idleMs = 300000,
  onEvent = () => {},
}) {
  if (!/^[A-Za-z0-9_-]{16,512}$/.test(internalCapability ?? "") || !cliPath)
    throw Error("invalid_acp_configuration");
  const agents = new AgentTasks(),
    owners = new Map();
  let nextSession = 0;
  function ownerFor(body, headers) {
    const key = body.prompt_cache_key;
    if (typeof key !== "string" || key.length > 512) return randomUUID();
    const hash = createHash("sha256")
      .update(String(headers["x-openai-subagent"] ?? "root") + "|" + key)
      .digest("hex");
    let owner = owners.get(hash);
    if (!owner) {
      if (owners.size >= 128) throw Error("conversation_limit");
      owner = { id: randomUUID(), last: Date.now() };
      owners.set(hash, owner);
    }
    owner.last = Date.now();
    return owner.id;
  }
  const sessions = new Map(),
    calls = new Map(),
    responses = new Map();
  let closed = false;
  async function create(body, owner) {
    if (sessions.size >= maxSessions) throw Error("acp_session_limit");
    const s = {
      id: randomUUID(),
      owner,
      number: nextSession++,
      model: body.model,
      webAllowed: (body.tools ?? []).some(
        (t) => t.type === "web_search" && t.external_web_access !== false,
      ),
      tools: flattenTools(body.tools),
      pending: new Map(),
      updates: new Map(),
      seq: 0,
      buffer: "",
      active: null,
      finished: false,
      closed: false,
      last: Date.now(),
      text: "",
      thought: "",
      web: [],
      running: false,
    };
    sessions.set(s.id, s);
    onEvent({ type: "session_started", session: s.number });
    try {
      s.root = privateDirectory(
        fs.mkdtempSync(
          path.join(fs.realpathSync(os.tmpdir()), "switchboard-acp-"),
        ),
      );
      const work = privateDirectory(path.join(s.root, "work")),
        data = privateDirectory(path.join(s.root, "data"));
      privateDirectory(path.join(data, "devin"));
      atomicWrite(
        path.join(data, "devin/credentials.toml"),
        readProtected(credentialPath),
      );
      // Isolate official CLI logs/session database and remove them at teardown.
      const env = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: os.tmpdir(),
        XDG_DATA_HOME: data,
        XDG_CONFIG_HOME: path.join(s.root, "config"),
        XDG_CACHE_HOME: path.join(s.root, "cache"),
        DEVIN_REFUSAL_FALLBACK: "",
        LOG_LEVEL: "off",
      };
      writeJSON(path.join(s.root, "config.json"), {
        agent: { model: s.model },
        auto_update: false,
        notify: "never",
        read_config_from: { cursor: false, windsurf: false, claude: false },
        subagents_enabled: false,
        disabled_tools: [
          "read",
          "edit",
          "write",
          "exec",
          "grep",
          "glob",
          "fetch",
          "task",
          ...((body.tools ?? []).some(
            (t) => t.type === "web_search" && t.external_web_access !== false,
          )
            ? []
            : ["web_search"]),
        ],
        permissions: {
          deny: [
            "read",
            "edit",
            "write",
            "exec",
            "grep",
            "glob",
            "fetch",
            "Read(**)",
            "Write(**)",
            "Exec(*)",
            ...(s.webAllowed ? [] : ["web_search"]),
          ],
        },
      });
      s.broker = new SessionCalls({ maxSessions: 1 });
      s.handle = s.broker.open(() => dispose(s));
      const relayKey = randomUUID();
      s.relay = http.createServer(async (req, res) => {
        try {
          if (
            req.method !== "POST" ||
            req.headers.origin ||
            req.headers.authorization !== "Bearer " + relayKey
          ) {
            json(res, 403, "forbidden");
            return;
          }
          const b = await bodyOf(req);
          let result;
          if (req.url === "/tools") result = { tools: relayTools(s.tools) };
          else if (req.url === "/call") {
            const spec = findCallerTool(
              s.tools.filter((t) => ["function", "custom"].includes(t.type)),
              b.name,
            );
            if (!spec) throw Error("undeclared_tool");
            if (JSON.stringify(b.arguments ?? {}).includes(s.root)) {
              // The CLI sees its private ACP cwd. It must never override the
              // real Codex executor's workspace with that transport directory.
              onEvent({ type: "caller_workspace_mismatch", session: s.number });
              res.writeHead(200, { "content-type": "application/json" }).end(
                JSON.stringify({
                  isError: true,
                  content: [
                    {
                      type: "text",
                      text: "This is the private ACP transport directory, not the caller workspace. Retry without that directory in workdir/cwd or shell commands. Codex caller tools default to the actual workspace; use an explicit path only when supplied by the caller.",
                    },
                  ],
                }),
              );
              return;
            }

            if (
              spec.type === "custom" &&
              typeof b.arguments?.input !== "string"
            )
              throw Error("invalid_custom_input");
            onEvent({
              type: "caller_tool",
              session: s.number,
              name: spec.name,
              namespace: spec.namespace,
            });
            const call = s.broker.enqueue(s.handle, {
              spec,
              args: b.arguments ?? {},
            });
            call.result.catch(() => {});
            calls.set(call.id, s);
            try {
              agents.dispatch(s.owner, call.id, spec, b.arguments ?? {});
            } catch (error) {
              await dispose(s);
              throw error;
            }
            flush(s);
            let output = await call.result;
            if (spec.name === "switchboard_tool_search")
              output =
                (typeof output === "string" ? output : JSON.stringify(output)) +
                "\nRefresh the codex MCP tool list. Loaded relay names: " +
                relayTools(s.tools)
                  .map((t) => t.name)
                  .join(", ");
            if (
              s.agentTask &&
              s.agentTask.version > (s.deliveredTaskVersion ?? 0)
            ) {
              output =
                (typeof output === "string" ? output : JSON.stringify(output)) +
                "\nNew agent message:\n" +
                s.agentTask.message;
              s.deliveredTaskVersion = s.agentTask.version;
            }
            const replies = agents.replies(s.owner);
            if (replies.length)
              output =
                (typeof output === "string" ? output : JSON.stringify(output)) +
                "\nChild replies:\n" +
                replies.join("\n");
            result = {
              content: [
                {
                  type: "text",
                  text:
                    typeof output === "string"
                      ? output
                      : JSON.stringify(output),
                },
              ],
              refreshTools: spec.name === "switchboard_tool_search",
            };
          } else {
            json(res, 404, "not_found");
            return;
          }
          res
            .writeHead(200, { "content-type": "application/json" })
            .end(JSON.stringify(result));
        } catch {
          json(res, 502, "caller_tool_failed");
        }
      });
      s.relay.listen(0, "127.0.0.1");
      await once(s.relay, "listening");
      if (s.closed) throw Error("acp_session_closed");
      const command = runtimeCommand();
      const add = spawnSync(
        cliPath,
        [
          "mcp",
          "add",
          "codex",
          "--scope",
          "user",
          "--env",
          "RELAY_URL=http://127.0.0.1:" + s.relay.address().port,
          "--env",
          "RELAY_CAPABILITY=" + relayKey,
          "--",
          ...command,
        ],
        { cwd: work, env, timeout: 15000, stdio: "ignore" },
      );
      if (add.status !== 0) {
        await dispose(s);
        throw Error("acp_mcp_configuration");
      }
      s.process = spawn(
        cliPath,
        [
          "--config",
          path.join(s.root, "config.json"),
          "--model",
          s.model,
          "acp",
        ],
        { cwd: work, env, stdio: ["pipe", "pipe", "pipe"] },
      );
      s.process.stderr.resume();
      s.send = (m) =>
        s.process.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
      s.rpc = (method, params) =>
        new Promise((resolve, reject) => {
          const id = ++s.seq;
          const timer = setTimeout(
            () => {
              s.pending.delete(id);
              reject(Error("acp_timeout"));
              dispose(s);
            },
            method === "session/prompt" ? 300000 : 15000,
          );
          s.pending.set(id, { resolve, reject, timer });
          s.send({ id, method, params });
        });
      s.process.once("error", () => dispose(s));
      s.process.once("exit", () => dispose(s));
      s.process.stdout.on("data", (c) => {
        s.buffer += c;
        if (Buffer.byteLength(s.buffer) > MAX_BODY) {
          dispose(s);
          return;
        }
        let at;
        while ((at = s.buffer.indexOf("\n")) >= 0) {
          const line = s.buffer.slice(0, at);
          s.buffer = s.buffer.slice(at + 1);
          try {
            handle(s, JSON.parse(line));
          } catch {
            dispose(s);
          }
        }
      });
      try {
        await s.rpc("initialize", {
          protocolVersion: 1,
          clientInfo: { name: "codex-switchboard", version: "0.1.0" },
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false,
          },
        });
        const session = await s.rpc("session/new", {
          cwd: work,
          mcpServers: [],
        });
        s.sessionId = session.sessionId;
        const selected = await s.rpc("session/set_config_option", {
          sessionId: s.sessionId,
          configId: "model",
          value: s.model,
        });
        if (
          selected.configOptions?.find((o) => o.id === "model")
            ?.currentValue !== s.model
        )
          throw Error("selector_mismatch");
      } catch {
        await dispose(s);
        throw Error("acp_initialization_failed");
      }
      return s;
    } catch (error) {
      await dispose(s);
      throw error;
    }
  }
  async function dispose(s) {
    if (s.closed) return;
    s.closed = true;
    sessions.delete(s.id);
    if (![...sessions.values()].some((other) => other.owner === s.owner))
      agents.close(s.owner);
    s.broker?.cancel(s.handle);
    for (const [id, owner] of calls) if (owner === s) calls.delete(id);
    for (const [id, owner] of responses) if (owner === s) responses.delete(id);
    for (const p of s.pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("acp_session_closed"));
    }
    s.pending.clear();
    if (s.active) {
      json(s.active, 502, "acp_session_closed");
      s.active = null;
    }
    s.process?.stdin.end();
    if (s.process && s.process.exitCode === null) {
      s.process.kill("SIGTERM");
      await Promise.race([
        once(s.process, "exit"),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
      if (s.process.exitCode === null) s.process.kill("SIGKILL");
    }
    s.relay?.closeAllConnections();
    s.relay?.close();
    if (s.root) fs.rmSync(s.root, { recursive: true, force: true });
  }
  function handle(s, m) {
    if (m.method && m.id !== undefined) {
      if (m.method === "session/request_permission") {
        const tc = {
          ...s.updates.get(m.params?.toolCall?.toolCallId),
          ...m.params?.toolCall,
        };
        const name = tc._meta?.["cognition.ai/inferenceToolName"];
        let allowed = false;
        try {
          allowed =
            name?.startsWith("mcp__codex__") &&
            !!findCallerTool(
              s.tools.filter((t) => ["custom", "function"].includes(t.type)),
              name.slice(12),
            );
        } catch {}
        const option = m.params.options?.find(
          (o) => o.kind === (allowed ? "allow_once" : "reject_once"),
        );
        s.send({
          id: m.id,
          result: {
            outcome: option
              ? { outcome: "selected", optionId: option.optionId }
              : { outcome: "cancelled" },
          },
        });
      } else
        s.send({
          id: m.id,
          error: {
            code: -32601,
            message:
              "Use the configured codex MCP caller tools; native local execution is unavailable.",
          },
        });
      return;
    }
    if (m.method === "session/update") {
      const u = m.params?.update ?? {};
      if (u.sessionUpdate === "usage_update") {
        const v = u.usage ?? u;
        const input =
            v._meta?.["cognition.ai/inputTokens"] ??
            v.inputTokens ??
            v.input_tokens,
          output =
            v._meta?.["cognition.ai/outputTokens"] ??
            v.outputTokens ??
            v.output_tokens;
        if (
          Number.isSafeInteger(input) &&
          Number.isSafeInteger(output) &&
          input >= 0 &&
          output >= 0
        )
          s.usage = {
            input_tokens: input,
            output_tokens: output,
            total_tokens: input + output,
            ...(Number.isSafeInteger(v._meta?.["cognition.ai/cachedReadTokens"])
              ? {
                  input_tokens_details: {
                    cached_tokens: v._meta["cognition.ai/cachedReadTokens"],
                  },
                }
              : {}),
          };
        onEvent({
          type: "usage_fields",
          keys: Object.keys(v),
          metaKeys: Object.keys(v._meta ?? {}),
          metaShapes: Object.fromEntries(
            Object.entries(v._meta ?? {}).map(([k, v]) => [
              k,
              v && typeof v === "object" ? Object.keys(v) : typeof v,
            ]),
          ),
        });
      }
      if (u.sessionUpdate === "tool_call")
        onEvent({
          type: "native_tool",
          name: u._meta?.["cognition.ai/inferenceToolName"],
        });
      if (u.toolCallId)
        s.updates.set(u.toolCallId, { ...s.updates.get(u.toolCallId), ...u });
      if (u.sessionUpdate === "agent_message_chunk") {
        s.text += u.content?.text ?? "";
        delta(s, "message", u.content?.text ?? "");
      }
      if (u.sessionUpdate === "agent_thought_chunk") {
        s.thought += u.content?.text ?? "";
        delta(s, "reasoning", u.content?.text ?? "");
      }
      if (Buffer.byteLength(s.text) + Buffer.byteLength(s.thought) > MAX_BODY) {
        dispose(s);
        return;
      }
      const t = s.updates.get(u.toolCallId);
      if (
        t?._meta?.["cognition.ai/inferenceToolName"] === "web_search" &&
        u.status === "completed" &&
        s.webAllowed &&
        typeof t.rawInput?.query === "string"
      )
        s.web.push(t.rawInput.query);
      return;
    }
    const p = s.pending.get(m.id);
    if (p) {
      s.pending.delete(m.id);
      clearTimeout(p.timer);
      m.error ? p.reject(Error("acp_rpc_failed")) : p.resolve(m.result);
    }
  }
  function stream(s) {
    if (s.stream) return s.stream;
    const res = s.active;
    if (!res) return;
    const id = "resp_" + randomUUID();
    let seq = 0;
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
    });
    const event = (type, data) =>
      res.write(
        `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: seq++, ...data })}\n\n`,
      );
    const response = {
      id,
      object: "response",
      status: "in_progress",
      output: [],
    };
    event("response.created", { response });
    s.stream = { res, event, response, items: [], byType: new Map() };
    return s.stream;
  }
  function delta(s, type, text) {
    const out = stream(s);
    if (!out || !text) return;
    let item = out.byType.get(type);
    if (!item) {
      item =
        type === "reasoning"
          ? {
              id: "rs_" + randomUUID(),
              type,
              summary: [{ type: "summary_text", text: "" }],
            }
          : {
              id: "msg_" + randomUUID(),
              type: "message",
              role: "assistant",
              status: "in_progress",
              content: [{ type: "output_text", text: "", annotations: [] }],
            };
      out.byType.set(type, item);
      out.items.push(item);
      out.event("response.output_item.added", {
        output_index: out.items.length - 1,
        item,
      });
    }
    const index = out.items.indexOf(item);
    if (type === "reasoning") {
      item.summary[0].text += text;
      out.event("response.reasoning_summary_text.delta", {
        item_id: item.id,
        output_index: index,
        summary_index: 0,
        delta: text,
      });
    } else {
      item.content[0].text += text;
      out.event("response.output_text.delta", {
        item_id: item.id,
        output_index: index,
        content_index: 0,
        delta: text,
      });
    }
  }
  function emit(s, items) {
    const out = stream(s);
    if (!out) return;
    s.active = null;
    s.stream = null;
    s.last = Date.now();
    responses.set(out.response.id, s);
    for (const item of items) {
      if (out.byType.has(item.type)) continue;
      out.items.push(item);
      out.event("response.output_item.added", {
        output_index: out.items.length - 1,
        item: { ...item, status: "in_progress" },
      });
    }
    out.items.forEach((item, index) => {
      item.status = "completed";
      out.event("response.output_item.done", { output_index: index, item });
    });
    out.event("response.completed", {
      response: {
        ...out.response,
        status: "completed",
        output: out.items,
        ...(s.usage ? { usage: s.usage } : {}),
      },
    });
    out.res.end();
    s.text = "";
    s.thought = "";
  }
  function flush(s) {
    if (!s.active || s.closed) return;
    const next = s.broker.take(s.handle);
    if (next) {
      emit(s, [toolItem(next.payload.spec, next.payload.args, next.id)]);
      return;
    }
    if (s.finished) {
      if (s.agentTask) s.agentTask.reply = s.text;
      const items = [];
      if (s.thought)
        items.push({
          id: "rs_" + randomUUID(),
          type: "reasoning",
          summary: [{ type: "summary_text", text: s.thought }],
        });
      for (const query of s.web)
        items.push({
          id: "ws_" + randomUUID(),
          type: "web_search_call",
          status: "completed",
          action: { type: "search", query },
        });
      items.push({
        id: "msg_" + randomUUID(),
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: s.text, annotations: [] }],
      });
      emit(s, items);
    }
  }
  const server = http.createServer(async (req, res) => {
    let s;
    try {
      if (
        closed ||
        req.method !== "POST" ||
        req.url !== "/v1/responses" ||
        req.headers.origin ||
        req.headers["x-api-key"] !== internalCapability
      ) {
        json(res, 403, "forbidden");
        return;
      }
      const body = await bodyOf(req);
      if (!body || typeof body.model !== "string" || body.stream === false)
        throw Error("unsupported_acp_request");
      if (typeof body.input === "string")
        body.input = [{ role: "user", content: body.input }];
      const requestOwner = ownerFor(body, req.headers);
      const owners = new Set(
        (body.input ?? [])
          .filter((i) =>
            ["function_call_output", "custom_tool_call_output"].includes(
              i.type,
            ),
          )
          .map((i) => calls.get(i.call_id))
          .filter(Boolean),
      );
      if (owners.size > 1) throw Error("cross_session_results");
      s = [...owners][0] ?? responses.get(body.previous_response_id);
      if (s && body.prompt_cache_key && s.owner !== requestOwner)
        throw Error("cross_conversation_result");
      if (s && s.model !== body.model)
        throw Error("model_change_during_tool_call");
      if (
        s &&
        s.webAllowed !==
          (body.tools ?? []).some(
            (t) => t.type === "web_search" && t.external_web_access !== false,
          )
      )
        throw Error("web_policy_change_during_session");
      if (!s) s = await create(body, requestOwner);
      if (res.destroyed) {
        await dispose(s);
        return;
      }
      if (s.active) throw Error("concurrent_session_request");
      s.agentTask ??= (body.input ?? [])
        .filter((i) => i.type === "agent_message")
        .map((i) => agents.lookup(i.recipient))
        .find(Boolean);
      s.tools = flattenTools(body.tools);
      s.active = res;
      s.last = Date.now();
      s.broker.bindResponse(s.handle, res);
      let completed = false;
      for (const item of body.input ?? []) {
        if (
          calls.get(item.call_id) !== s ||
          !["function_call_output", "custom_tool_call_output"].includes(
            item.type,
          )
        )
          continue;
        agents.bind(item.call_id, item.output);
        completed =
          s.broker.complete(s.handle, item.call_id, item.output) || completed;
        calls.delete(item.call_id);
      }
      if (!s.running) {
        s.running = true;
        s.finished = false;
        s.text = "";
        s.thought = "";
        s.web = [];
        s.webAllowed = (body.tools ?? []).some(
          (t) => t.type === "web_search" && t.external_web_access !== false,
        );
        const rewritten = agents.rewrite(body.input);
        onEvent({
          type: "prompt",
          session: s.number,
          agentMessages: (body.input ?? []).filter(
            (i) => i.type === "agent_message",
          ).length,
          resolvedAgents: rewritten.filter(
            (i, n) => i !== (body.input ?? [])[n],
          ).length,
        });
        if (s.agentTask) {
          s.agentTask.boundOwner = s.owner;
          s.deliveredTaskVersion = s.agentTask.version;
        }
        const blocks = promptBlocks({ ...body, input: rewritten });
        blocks[0].text +=
          "\nNative web_search is " +
          (s.webAllowed
            ? "permitted for live web requests."
            : "unavailable for this request. Do not use it.");
        s.rpc("session/prompt", { sessionId: s.sessionId, prompt: blocks })
          .then(() => {
            s.finished = true;
            s.running = false;
            flush(s);
          })
          .catch(() => dispose(s));
      } else if (!completed) throw Error("missing_tool_result");
      flush(s);
    } catch {
      const ownsResponse = s?.active === res;
      if (ownsResponse) s.active = null;
      json(res, 502, "acp_request_failed");
      if (ownsResponse) await dispose(s);
    }
  });
  const timer = setInterval(() => {
    for (const [key, owner] of owners)
      if (
        Date.now() - owner.last > idleMs &&
        ![...sessions.values()].some((s) => s.owner === owner.id)
      )
        owners.delete(key);
    for (const s of sessions.values())
      if (Date.now() - s.last > idleMs) dispose(s);
  }, 10000);
  timer.unref();
  const close = server.close.bind(server);
  server.close = (callback) => {
    closed = true;
    clearInterval(timer);
    Promise.all([...sessions.values()].map(dispose)).finally(() =>
      close(callback),
    );
    return server;
  };
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return server;
}
