// Explicitly authorized live acceptance only. Uses the real gateway; no activation.
import { findCLI } from "../../gateway/providers/discovery.mjs";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { startDevinACPTransport } from "../../gateway/transport/devin-acp.mjs";
import { createProxy } from "../../gateway/codex/proxy.mjs";
import { devinCredentialsPath } from "../../gateway/core/paths.mjs";
import {
  privateDirectory,
  writeJSON,
  atomicWrite,
} from "../../gateway/core/files.mjs";
import {
  findCodex,
  nativeCatalog,
  modelEntry,
} from "../../gateway/codex/catalog.mjs";
const mode = process.env.ACP_LIVE_MODE ?? "edit";
const selector = process.env.ACP_LIVE_MODEL ?? "swe-2-medium",
  effort = process.env.ACP_LIVE_EFFORT ?? "medium";
const root = privateDirectory(fs.mkdtempSync("/private/tmp/gateway-acp-live-"));
const work = privateDirectory(path.join(root, "work"));
const home = privateDirectory(path.join(root, "home"));
const key = randomUUID(),
  value = randomUUID();
atomicWrite(path.join(work, "input.txt"), value);
let transport, proxy, child;
const evidence = {};
try {
  if (process.env.ACP_PACKAGED === "1") {
    const helper = spawn(
      path.resolve(".build/acp/switchboard-helper"),
      ["--worker", "devin"],
      {
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          SWITCHBOARD_DATA_DIR: path.join(root, "data"),
        },
        stdio: ["pipe", "pipe", "ignore"],
      },
    );
    const ready = new Promise((resolve, reject) => {
      let text = "";
      helper.stdout.on("data", (c) => {
        text += c;
        let at;
        while ((at = text.indexOf("\n")) >= 0) {
          const m = JSON.parse(text.slice(0, at));
          text = text.slice(at + 1);
          if (m.id === 1)
            m.error ? reject(Error(m.error.code)) : resolve(m.result);
        }
      });
      helper.once("exit", () => reject(Error("helper exited")));
    });
    helper.stdin.write(
      JSON.stringify({ id: 1, op: "start", capability: key }) + "\n",
    );
    const result = await ready;
    transport = {
      address: () => ({ port: result.port }),
      close: (cb) => {
        helper.once("exit", cb);
        helper.stdin.end();
      },
    };
  } else
    transport = await startDevinACPTransport({
      internalCapability: key,
      credentialPath: devinCredentialsPath,
      cliPath: findCLI("devin"),
      onEvent: (e) => {
        evidence.acp ??= [];
        evidence.acp.push(e);
      },
    });
  const model = {
    id: "switchboard-devin-live",
    name: "Gateway SWE2",
    provider: "devin",
    upstream: selector,
    selectors: { [effort]: selector },
    scope: "scratch",
    compatible: true,
    availability: "advertised",
    enabled: true,
    capabilities: {
      images: true,
      tools: true,
      efforts: [effort],
      defaultEffort: effort,
      contextWindow: 128000,
    },
  };
  proxy = createProxy({
    getRegistry: () => ({
      models: [model],
      appliedModels: [model],
      providers: { devin: { scope: "scratch" } },
      nativeSlugs: [],
    }),
    getWorker: async () => ({
      port: transport.address().port,
      capability: key,
    }),
    onRoute: (r) => {
      evidence.route = r;
    },
  });
  proxy.prependListener("request", (req, res) => {
    let requestText = "";
    req.on("data", (chunk) => {
      if (requestText.length < 10 * 1024 * 1024) requestText += chunk;
    });
    req.on("end", () => {
      try {
        const body = JSON.parse(requestText);
        if (mode === "search")
          evidence.searchDeclared = (body.tools ?? []).some(
            (t) => t.type === "tool_search",
          );
        for (const item of body.input ?? []) {
          if (
            !["function_call_output", "custom_tool_call_output"].includes(
              item.type,
            )
          )
            continue;
          const output =
            typeof item.output === "string"
              ? item.output
              : JSON.stringify(item.output);
          evidence.resultFlags ??= [];
          evidence.resultFlags.push({
            child: !!req.headers["x-openai-subagent"],
            hasValue: output.includes(value),
            missingFile: /no such file|ENOENT|cannot access/i.test(output),
            denied:
              /permission denied|not permitted|not allowed|denied by/i.test(
                output,
              ),
            unknownTool: /unknown tool|tool not found|not a valid tool/i.test(
              output,
            ),
            success: /exit code: 0/i.test(output),
          });
        }
      } catch {}
      requestText = "";
    });

    let pending = "";
    const write = res.write;
    res.write = function (chunk, ...args) {
      pending += String(chunk);
      let at;
      while ((at = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, at);
        pending = pending.slice(at + 1);
        if (!line.startsWith("data:")) continue;
        try {
          const event = JSON.parse(line.slice(5));
          if (
            event.type === "response.output_item.done" &&
            event.item?.type === "tool_search_call"
          )
            evidence.searchDispatched = true;
          if (
            event.type === "response.output_item.done" &&
            ["function_call", "custom_tool_call"].includes(event.item?.type)
          ) {
            evidence.calls ??= [];
            const a = event.item.arguments ?? event.item.input ?? "";
            let keys = [];
            try {
              keys = Object.keys(JSON.parse(a));
            } catch {}
            evidence.calls.push({
              child: !!req.headers["x-openai-subagent"],
              name: event.item.name,
              namespace: event.item.namespace,
              keys,
              readsFixture: a.includes("input.txt"),
              hasValue: a.includes(value),
              fresh: a.includes('\"fork_turns\":\"none\"'),
            });
          }
          if (event.type === "response.completed") {
            const text = (event.response?.output ?? [])
              .filter((i) => i.type === "message")
              .flatMap((i) => i.content ?? [])
              .map((c) => c.text ?? "")
              .join("");
            evidence.replies ??= [];
            evidence.replies.push({
              child: !!req.headers["x-openai-subagent"],
              hasValue: text.includes(value),
              hasAck: text.includes("ACK_" + value),
              textLength: text.length,
              empty: !text.trim(),
              mentionsTools: /tool|discover|search|beacon/i.test(text),
              mentionsMCP: /mcp/i.test(text),
              unavailable:
                /not available|unavailable|no access|cannot access|don.t have access/i.test(
                  text,
                ),
              permission: /permission|denied|authorized/i.test(text),
              failure: /failed|error|denied|not found|unable|cannot/i.test(
                text,
              ),
            });
          }
        } catch {}
      }
      return write.call(this, chunk, ...args);
    };
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const catalog = await nativeCatalog(process.env.HOME + "/.codex");
  writeJSON(path.join(home, "catalog.json"), {
    models: [
      modelEntry(
        model,
        100,
        catalog.models.find(
          (m) =>
            m.slug ===
            (process.env.ACP_LIVE_AGENTS === "1"
              ? "gpt-6-astra"
              : "gpt-5.6-luna"),
        ) ?? catalog.models[0],
      ),
    ],
  });
  writeJSON(path.join(home, "auth.json"), {
    OPENAI_API_KEY: "codex-switchboard-local-only",
  });
  atomicWrite(
    path.join(home, "config.toml"),
    `cli_auth_credentials_store = "file"\nopenai_base_url = "http://127.0.0.1:${proxy.address().port}/codex/v1"\nmodel_catalog_json = ${JSON.stringify(path.join(home, "catalog.json"))}\n[features]\nskip_host_skill_discovery = true\nmulti_agent = true\nmulti_agent_v2 = true\n`,
  );
  if (mode === "search")
    fs.appendFileSync(
      path.join(home, "config.toml"),
      `[mcp_servers.search_lab]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(path.resolve("experiments/acp/search-fixture.mjs"))}]\n[mcp_servers.search_lab.env]\nLAB_VALUE = ${JSON.stringify(value)}\nLAB_LOG = ${JSON.stringify(path.join(root, "search.jsonl"))}\n`,
    );
  child = spawn(
    findCodex(),
    [
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      "--json",
      "--color",
      "never",
      "-m",
      model.id,
      "-c",
      "model_reasoning_effort=" + JSON.stringify(effort),
      ...(mode === "web" ? ["-c", 'web_search="live"'] : []),
      ...(mode === "image"
        ? [
            "-i",
            path.resolve(".build/compat-audit/vision-diagnostic/card-0.png"),
          ]
        : []),
      "--",
      mode === "image"
        ? "Read the characters in the attached image. Reply only with those characters. Do not use tools."
        : mode === "search"
          ? process.env.ACP_EXPLICIT_DISCOVERY === "1"
            ? "First call the native mcp_list_tools tool to list tools on server codex. Locate switchboard_tool_search there and invoke it through the codex MCP server to discover the laboratory beacon tool. Refresh the codex MCP tool list, then invoke the loaded read_lab_beacon tool through codex. Return only its actual returned value. You must execute the discovery and loaded tool; do not infer the value. Do not use shell or files."
            : "Discover codex MCP tools. Use switchboard_tool_search to discover the laboratory beacon tool. Refresh the codex tool list and call the loaded beacon through codex. Reply only with the returned value. Do not use shell or files."
          : mode === "web-denied"
            ? "This is a controlled negative test. Attempt native web_search to search for MCP documentation even though the gateway says it is unavailable. Report whether the tool can run. Do not use caller tools or files."
            : mode === "web"
              ? "Use native web_search to find the official Model Context Protocol tools list-changed notification documentation. Return the official URL and exact method. Actually search; no shell or files."
              : process.env.ACP_PEER === "1"
                ? "Use only native Codex collaboration through codex MCP. Use task_name checker and reader exactly, with fork_turns none for both. Spawn fresh checker first: tell it to reply READY and finish its initial turn without reading files, and on a later reader message reply ACK_ plus the received value. Wait for checker to finish its READY turn. Spawn fresh reader next: tell it to read input.txt using codex exec_command, then use collaboration followup_task targeted at /root/checker with the exact value and instruction to reply ACK_ plus it. The reader must send the message directly, not through the parent. Wait for checker to finish and return its exact ACK_. Do not read input.txt yourself."
                : process.env.ACP_LIVE_AGENTS === "1"
                  ? "Use the codex MCP collaboration tools to spawn exactly two fresh Codex children with fork_turns none and task names reader and checker. Tell reader to read input.txt using codex exec_command and return its value. Tell checker to read input.txt and return ACK_ followed by its value. Wait for both. Reply only with the ACK_ value from checker. Do not read files yourself or use native Devin subagents."
                  : "Read input.txt using the codex MCP caller tools. Create output.txt containing ACK_ followed by that exact value, using the caller apply_patch tool. Read output.txt to verify. Reply only with its contents.",
    ],
    {
      cwd: work,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        CODEX_HOME: home,
        OPENAI_API_KEY: "codex-switchboard-local-only",
      },
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  let buf = "";
  child.stdout.on("data", (c) => {
    buf += c;
    let at;
    while ((at = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, at);
      buf = buf.slice(at + 1);
      try {
        const e = JSON.parse(line);
        if (e.item?.type === "collab_tool_call") {
          evidence.collaboration ??= [];
          evidence.collaboration.push({
            tool: e.item.tool,
            status: e.item.status,
          });
        }
        if (
          e.item?.type === "command_execution" &&
          e.item.command?.includes("input.txt")
        )
          evidence.parentRead = true;
        if (e.item?.type === "agent_message") {
          evidence.exact = e.item.text?.trim() === "ACK_" + value;
          evidence.containsAck = e.item.text?.includes("ACK_" + value);
          evidence.searchValue = e.item.text?.trim() === value;
          evidence.webAnswer =
            e.item.text?.includes("modelcontextprotocol.io") &&
            e.item.text?.includes("notifications/tools/list_changed");
          if (mode === "image")
            evidence.image =
              e.item.text?.toUpperCase().replace(/[^A-Z0-9]/g, "") ===
              JSON.parse(
                fs.readFileSync(
                  ".build/compat-audit/vision-diagnostic/expected.json",
                ),
              )[0].expected;
        }
        evidence.types ??= [];
        if (e.item?.type) evidence.types.push(e.item.type);
      } catch {}
    }
  });
  const timer = setTimeout(() => child.kill("SIGTERM"), 240000);
  [evidence.exit] = await once(child, "exit");
  clearTimeout(timer);
  evidence.file =
    fs.existsSync(path.join(work, "output.txt")) &&
    fs.readFileSync(path.join(work, "output.txt"), "utf8").trim() ===
      "ACK_" + value;
} finally {
  child?.kill("SIGTERM");
  proxy?.closeAllConnections();
  if (proxy) await new Promise((r) => proxy.close(r));
  if (transport) await new Promise((r) => transport.close(r));
  if (mode === "search")
    evidence.searchExecuted = fs.existsSync(path.join(root, "search.jsonl"));
  fs.rmSync(root, { recursive: true, force: true });
  evidence.clean = !fs.existsSync(root);
  writeJSON(
    ".build/compat-audit/gateway-acp-" +
      (process.env.ACP_LIVE_LABEL ??
        (process.env.ACP_PACKAGED === "1"
          ? "packaged"
          : process.env.ACP_LIVE_AGENTS === "1"
            ? "agents"
            : mode)) +
      ".json",
    evidence,
  );
  console.log(JSON.stringify(evidence));
}
