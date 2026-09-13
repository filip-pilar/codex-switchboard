// Private stdio MCP endpoint. Execution stays in the calling Codex executor.
import readline from "node:readline";
export async function runACPRelay() {
  const lines = readline.createInterface({ input: process.stdin });
  async function relay(route, body) {
    const r = await fetch(process.env.RELAY_URL + route, {
      method: "POST",
      headers: {
        authorization: "Bearer " + process.env.RELAY_CAPABILITY,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });
    if (!r.ok) throw Error("relay rejected");
    return r.json();
  }
  for await (const line of lines) {
    let m;
    try {
      m = JSON.parse(line);
    } catch {
      continue;
    }
    if (m.id === undefined) continue;
    try {
      let result;
      if (m.method === "initialize")
        result = {
          protocolVersion: m.params.protocolVersion,
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: "codex-caller-relay", version: "0.1.0" },
        };
      else if (m.method === "tools/list") result = await relay("/tools", {});
      else if (m.method === "tools/call")
        result = await relay("/call", m.params);
      else throw Error("unsupported method");
      const refresh = result.refreshTools;
      delete result.refreshTools;
      process.stdout.write(
        JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\n",
      );
      if (refresh)
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            method: "notifications/tools/list_changed",
          }) + "\n",
        );
    } catch {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: m.id,
          error: { code: -32603, message: "Caller relay failed or cancelled" },
        }) + "\n",
      );
    }
  }
}
