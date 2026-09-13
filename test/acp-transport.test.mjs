import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { startDevinACPTransport } from "../gateway/transport/devin-acp.mjs";

const fake = `#!${process.execPath}
import fs from 'node:fs';import path from 'node:path';import readline from 'node:readline';
const config=path.join(process.env.XDG_CONFIG_HOME,'relay.json');
if(process.argv[2]==='mcp'){
 const env={};for(let n=0;n<process.argv.length;n++)if(process.argv[n]==='--env'){const v=process.argv[++n],at=v.indexOf('=');env[v.slice(0,at)]=v.slice(at+1);}
 fs.mkdirSync(process.env.XDG_CONFIG_HOME,{recursive:true});fs.writeFileSync(config,JSON.stringify(env));process.exit(0);
}
const send=m=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...m})+'\\n');
const lines=readline.createInterface({input:process.stdin});
lines.on('line',line=>{const m=JSON.parse(line);if(m.method==='initialize')send({id:m.id,result:{protocolVersion:1}});
else if(m.method==='session/new')send({id:m.id,result:{sessionId:'fixture'}});
else if(m.method==='session/set_config_option')send({id:m.id,result:{configOptions:[{id:'model',currentValue:m.params.value}]}});
else if(m.method==='session/prompt'){
 const env=JSON.parse(fs.readFileSync(config));
 send({method:'session/update',params:{update:{sessionUpdate:'agent_thought_chunk',content:{type:'text',text:'Fixture reasoning'}}}});
 (async()=>{await new Promise(r=>setTimeout(r,100));const invalid=await fetch(env.RELAY_URL+'/call',{method:'POST',headers:{authorization:'Bearer '+env.RELAY_CAPABILITY,'content-type':'application/json'},body:JSON.stringify({name:'sample',arguments:{value:17,workdir:process.cwd()}})});if(!(await invalid.json()).isError)throw Error('private workspace escaped');const r=await fetch(env.RELAY_URL+'/call',{method:'POST',headers:{authorization:'Bearer '+env.RELAY_CAPABILITY,'content-type':'application/json'},body:JSON.stringify({name:'sample',arguments:{value:17}})});const result=await r.json();
 send({method:'session/update',params:{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:result.content[0].text}}}});send({id:m.id,result:{stopReason:'end_turn'}});
 })().catch(()=>{});
}});
`;
async function fixture(options = {}) {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "acp-transport-test-"),
  );
  const cli = path.join(root, "cli.mjs"),
    credentialPath = path.join(root, "credentials.toml");
  fs.writeFileSync(cli, fake, { mode: 0o700 });
  fs.writeFileSync(credentialPath, "fixture", { mode: 0o600 });
  const capability = "test-capability-123456";
  const server = await startDevinACPTransport({
    cliPath: cli,
    credentialPath,
    internalCapability: capability,
    ...options,
  });
  const post = (body, signal) =>
    fetch("http://127.0.0.1:" + server.address().port + "/v1/responses", {
      method: "POST",
      headers: { "x-api-key": capability, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  return {
    root,
    server,
    post,
    async close() {
      await new Promise((r) => server.close(r));
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
const body = {
  model: "fixture",
  prompt_cache_key: "conversation-one",
  stream: true,
  input: [{ role: "user", content: "fixture" }],
  tools: [
    {
      type: "function",
      name: "sample",
      parameters: {
        type: "object",
        properties: { value: { type: "integer" } },
      },
    },
  ],
};
function events(text) {
  return text
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => JSON.parse(l.slice(5)));
}

test("integrated ACP binds results to their conversation and enforces session capacity", async () => {
  const f = await fixture({ maxSessions: 1 });
  try {
    const first = await f.post(body);
    const emitted = events(await first.text());
    assert.ok(
      emitted.some((e) => e.type === "response.reasoning_summary_text.delta"),
    );
    const call = emitted.find(
      (e) =>
        e.type === "response.output_item.done" &&
        e.item.type === "function_call",
    ).item;
    assert.equal(call.name, "sample");
    assert.equal(call.arguments, '{"value":17}');
    const input = [
      {
        type: "function_call_output",
        call_id: call.call_id,
        output: "RESULT_17",
      },
    ];
    assert.equal(
      (await f.post({ ...body, prompt_cache_key: "other", input })).status,
      502,
    );
    assert.equal(
      (await f.post({ ...body, prompt_cache_key: "new" })).status,
      502,
    );
    const completed = events(await (await f.post({ ...body, input })).text());
    assert.equal(
      completed.at(-1).response.output.find((i) => i.type === "message")
        .content[0].text,
      "RESULT_17",
    );
  } finally {
    await f.close();
  }
});

test("disconnect cancels an ACP process before a caller tool is dispatched", async () => {
  const f = await fixture();
  const controller = new AbortController();
  try {
    const response = await f.post(body, controller.signal);
    await response.body.getReader().read();
    controller.abort();
    await new Promise((r) => setTimeout(r, 150));
  } finally {
    await f.close();
  }
  assert.equal(fs.existsSync(f.root), false);
});
