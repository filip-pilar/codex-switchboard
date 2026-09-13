import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import * as zlib from 'node:zlib';
import { createProxy, decodeBody, parseBody, MAX_BODY, externalHeaders, normalizePath, SENTINEL } from '../gateway/codex/proxy.mjs';
import { HistoryOwnership, prepareExternal, normalizeHistory } from '../gateway/codex/compatibility.mjs';
import { initialRegistry, normalizeDiscovery, mergeDiscovery } from '../gateway/core/registry.mjs';
import { prepareGrokResponsesRequest, restoreGrokResponsesEvent } from '../gateway/transport/grok.mjs';
const fixtureRegistry=()=>{
  let registry=mergeDiscovery(initialRegistry(),'devin',normalizeDiscovery('devin',['low','medium','high','xhigh','max'].map(e=>({selector:`gpt-6-astra-${e}`})),{scope:'d'}),'d');
  registry.appliedModels=structuredClone(registry.models);registry.appliedRevision=registry.revision;registry.selection={id:'switchboard-devin-astra',effort:'medium'};return registry;
};
const listen=async server=>{server.listen(0,'127.0.0.1');await once(server,'listening');return server.address().port;};
const close=async server=>{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));};
function send(port,path,body,headers={}){return new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port,path,method:'POST',headers:{'content-type':'application/json',...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString(),headers:res.headers}));});req.on('error',reject);req.end(body);});}
test('compression bounds and depth limit preserve image bytes or fail explicitly',()=>{
  const raw=Buffer.from(JSON.stringify({input:[{type:'input_image',image_url:'data:image/png;base64,AQID'}]}));
  assert.deepEqual(decodeBody(zlib.gzipSync(raw),'gzip'),raw);assert.deepEqual(decodeBody(zlib.brotliCompressSync(raw),'br'),raw);
  assert.deepEqual(decodeBody(zlib.zstdCompressSync(raw),'zstd'),raw);
  assert.throws(()=>decodeBody(zlib.gzipSync(Buffer.alloc(MAX_BODY+1)),'gzip'),e=>e.status===413);
  assert.throws(()=>decodeBody(Buffer.alloc(MAX_BODY+1),'identity'),e=>e.status===413);
  const nested='{"a":'.repeat(101)+'0'+'}'.repeat(101);assert.throws(()=>parseBody(Buffer.from(nested)),/nesting/);
});
test('credential allow-list strips native identity and preserves only required compatibility metadata',()=>{
  const headers=externalHeaders({authorization:'native-fixture','chatgpt-account-id':'account-fixture',cookie:'cookie-fixture','x-api-key':'source-fixture','x-access-token':'token-fixture','x-private-secret':'secret-fixture','openai-beta':'responses=v1','x-openai-subagent':'child'},'destination-fixture',10);
  assert.deepEqual(headers,{'openai-beta':'responses=v1','x-openai-subagent':'child','x-api-key':'destination-fixture','content-length':'10','content-type':'application/json'});
});
test('inline images and tool IDs survive Astra normalization, private continuation fails safely',()=>{
  const ownership=new HistoryOwnership(),route={provider:'devin',selector:'gpt-6-astra-medium',effort:'medium',images:true};
  const body={model:'switchboard-selected',instructions:'Static native preamble',input:[{role:'developer',content:'Keep this developer instruction'},{type:'reasoning',encrypted_content:'native-private-fixture'},{role:'user',content:[{type:'input_image',image_url:'data:image/png;base64,AQID'}]},{type:'function_call',call_id:'call-123',name:'exec',arguments:'{}'},{type:'function_call_output',call_id:'call-123',output:[{type:'input_image',image_url:'data:image/png;base64,BAUG'}]}]};
  const prepared=prepareExternal(body,route,{},ownership);assert.equal(prepared.input[0].content,'Keep this developer instruction');assert.equal(prepared.input[1].content[0].image_url,'data:image/png;base64,AQID');assert.equal(prepared.input[2].call_id,'call-123');assert.equal(prepared.input[3].call_id,'call-123');assert.equal(prepared.input[3].output[0].image_url,'data:image/png;base64,BAUG');assert.equal(prepared.instructions,body.instructions);
  assert.throws(()=>prepareExternal({...body,previous_response_id:'private'},route,{},ownership),/Start a new task/);
  assert.throws(()=>prepareExternal({...body,input:[{type:'compaction',encrypted_content:'private'}]},route,{},ownership),/Start a new task/);
  assert.throws(()=>prepareExternal({...body,input:[{type:'input_image',image_url:'https://example.invalid/image.png'}]},route,{},ownership),/Remote image/);
  assert.throws(()=>prepareExternal(body,{...route,provider:'grok',images:null},{},ownership),/not been verified/);
  assert.throws(()=>normalizeHistory({input:[{type:'compaction',id:'unattributed'}]}, {provider:'native'},ownership),/Start a new task/);
  ownership.record('native-compaction','native');assert.equal(normalizeHistory({input:[{type:'compaction',id:'native-compaction'}]}, {provider:'native'},ownership).changed,false);
  ownership.record('external-reasoning','grok');const native=normalizeHistory({input:[{type:'reasoning',id:'external-reasoning',encrypted_content:'private'},{role:'user',content:'visible'}]}, {provider:'native'},ownership);assert.equal(native.body.input.length,1);
});
test('Grok custom and namespaced tool roundtrip retains call IDs',()=>{
  const body={tools:[{type:'custom',name:'apply_patch',description:'patch'}],input:[{type:'custom_tool_call',call_id:'c1',name:'apply_patch',input:'patch fixture'},{type:'custom_tool_call_output',call_id:'c1',output:'done'}]};
  const prepared=prepareGrokResponsesRequest(body);assert.equal(prepared.body.input[0].call_id,'c1');assert.equal(prepared.body.input[1].call_id,'c1');
  const event=restoreGrokResponsesEvent({type:'response.output_item.done',item:{type:'function_call',name:'apply_patch',call_id:'c2',arguments:'{"input":"patch fixture"}'}},prepared.maps);assert.equal(event.item.type,'custom_tool_call');assert.equal(event.item.call_id,'c2');assert.equal(event.item.input,'patch fixture');
});
test('loopback proxy preserves native bytes, routes external selector and refuses browser traffic',async()=>{
  const seen=[];const upstream=createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);seen.push({path:req.url,headers:req.headers,body:Buffer.concat(chunks)});res.setHeader('content-type','text/event-stream');res.end('data: {"type":"response.completed","response":{"id":"fixture-response","output":[]}}\n\n');});
  const upstreamPort=await listen(upstream),registry=fixtureRegistry(),routes=[];
  const proxy=createProxy({getRegistry:()=>registry,getWorker:async()=>({port:upstreamPort,capability:'destination-fixture'}),nativeOrigins:{openai:`http://127.0.0.1:${upstreamPort}/v1`,chatgpt:`http://127.0.0.1:${upstreamPort}/backend-api/codex`},onRoute:r=>routes.push(r)});const port=await listen(proxy);
  try{
    const original=Buffer.from('{ "model" : "native-model", "input" : "hello" }');const compressed=zlib.gzipSync(original);
    const native=await send(port,'/codex/v1/v1/responses',compressed,{'authorization':'Bearer native-fixture','chatgpt-account-id':'native-account','content-encoding':'gzip'});assert.equal(native.status,200);assert.equal(seen[0].path,'/backend-api/codex/responses');assert.deepEqual(seen[0].body,compressed);assert.equal(seen[0].headers.authorization,'Bearer native-fixture');
    const external=await send(port,'/codex/v1/responses',JSON.stringify({model:'switchboard-selected',input:'hello',stream:true}),{'authorization':'Bearer native-fixture','chatgpt-account-id':'native-account',cookie:'private-fixture'});assert.equal(external.status,200);assert.equal(JSON.parse(seen[1].body).model,'gpt-6-astra-medium');assert.equal(seen[1].headers.authorization,undefined);assert.equal(seen[1].headers['chatgpt-account-id'],undefined);assert.equal(seen[1].headers.cookie,undefined);
    registry.selection.effort='low';await send(port,'/codex/v1/responses',JSON.stringify({model:'switchboard-selected',input:'next'}));assert.equal(JSON.parse(seen[2].body).model,'gpt-6-astra-low');
    assert.equal((await send(port,'/codex/v1/responses',JSON.stringify({model:'native-model'}),{origin:'https://browser.invalid'})).status,403);
    assert.equal((await send(port,'/codex/v1/responses',JSON.stringify({model:'codex-auto-review'}),{authorization:`Bearer ${SENTINEL}`})).status,401);
    assert.equal((await send(port,'/codex/v1/responses/compact',JSON.stringify({model:'switchboard-selected'}))).status,400);
    assert.ok(routes.some(r=>r.provider==='devin'&&r.result==='completed'));
  }finally{await close(proxy);await close(upstream);}
});
test('closing an SSE client cancels the exact upstream stream',async()=>{
  let cancelled;const observed=new Promise(resolve=>cancelled=resolve);
  const upstream=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: {"type":"response.created"}\n\n');res.on('close',cancelled);});const upstreamPort=await listen(upstream);
  const proxy=createProxy({getRegistry:fixtureRegistry,getWorker:async()=>({port:upstreamPort,capability:'fixture-capability'})});const port=await listen(proxy);
  try{
    await new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port,path:'/codex/v1/responses',method:'POST',headers:{'content-type':'application/json'}},res=>{res.once('data',()=>{res.destroy();resolve();});});req.on('error',reject);req.end(JSON.stringify({model:'switchboard-selected',input:'hello',stream:true}));});
    await Promise.race([observed,new Promise((_,reject)=>setTimeout(()=>reject(new Error('upstream not cancelled')),2000).unref())]);
  }finally{await close(proxy);await close(upstream);}
});
test('both installed-client path forms normalize without doubled upstream v1',()=>{
  assert.equal(normalizePath('/codex/v1/v1/responses').path,'/responses');assert.equal(normalizePath('/codex/v1/responses').path,'/responses');assert.throws(()=>normalizePath('//other-host/responses'));
});
test('encoded oversize input receives an explicit 413 instead of a reset connection',async()=>{
  const server=createProxy({getRegistry:fixtureRegistry,getWorker:async()=>{throw new Error('must not reach upstream');}});const port=await listen(server);
  try{const response=await send(port,'/codex/v1/responses',Buffer.alloc(MAX_BODY+1),{'content-length':String(MAX_BODY+1)});assert.equal(response.status,413);assert.match(response.body,/10 MiB/);}finally{await close(server);}
});

test('retired Grok 4.5 fails locally with stale catalog metadata and no worker startup',async()=>{
  let registry=mergeDiscovery(fixtureRegistry(),'grok',normalizeDiscovery('grok',[{id:'grok-4.5'}],{scope:'g'}),'g');
  registry.appliedModels=structuredClone(registry.models);
  registry.appliedModels.find(m=>m.provider==='grok').capabilities.images=true;
  let workerStarts=0;
  const server=createProxy({getRegistry:()=>registry,getWorker:async()=>{workerStarts++;throw new Error('must not start');}}),port=await listen(server);
  const image={type:'input_image',image_url:'data:image/png;base64,AQID'};
  try{
    for(const input of ['hello',[{role:'user',content:[image]}],[{type:'function_call_output',call_id:'c',output:[image]}]]){
      const response=await send(port,'/codex/v1/responses',JSON.stringify({model:'switchboard-grok',input}));
      assert.equal(response.status,400);assert.match(response.body,/model_retired/);assert.match(response.body,/Choose Grok 4.6/);
    }
    assert.equal(workerStarts,0);
    const route={provider:'grok',selector:'grok-4.5',images:true};
    assert.equal(prepareExternal({input:'hello'},route,{},new HistoryOwnership()).input,'hello');
    assert.deepEqual(prepareExternal({input:[{role:'user',content:[image]}]},{...route,selector:'grok-4.6'},{},new HistoryOwnership()).input[0].content,[image]);
  }finally{await close(server);}
});

test('Devin search proxy translates JSON and SSE for SWE and Astra',async()=>{
 const seen=[];
 const upstream=createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));seen.push(body);
  const output=[{type:'function_call',name:'switchboard_tool_search',call_id:'c',arguments:'{"query":"beacon"}'}];
  const payload=body.stream ? 'data: '+JSON.stringify({type:'response.completed',response:{output}})+'\n\n' : JSON.stringify({output});
  res.writeHead(200,{'content-type':body.stream?'text/event-stream':'application/json','content-length':Buffer.byteLength(payload)});res.end(payload);
 });
 const upstreamPort=await listen(upstream);
 let registry=fixtureRegistry();registry=mergeDiscovery(registry,'devin',normalizeDiscovery('devin',[{selector:'swe-1-7'},{selector:'gpt-6-astra-medium'}],{scope:'d'}),'d');registry.appliedModels=structuredClone(registry.models);
 const proxy=createProxy({getRegistry:()=>registry,getWorker:async()=>({port:upstreamPort,capability:'fixture-capability'})}),port=await listen(proxy);
 const tools=[{type:'tool_search',execution:'client',parameters:{type:'object',properties:{query:{type:'string'}},required:['query']}}];
 try {
  for(const stream of [false,true]) {
   const response=await send(port,'/codex/v1/responses',JSON.stringify({model:'swe-1-7',stream,input:'hello',tools}));
   assert.equal(response.status,200);assert.match(response.body,/tool_search_call/);assert.match(response.body,/"execution":"client"/);assert.equal(response.headers['content-length'],undefined);
   assert.equal(seen.at(-1).tools[0].name,'switchboard_tool_search');
  }
  await send(port,'/codex/v1/responses',JSON.stringify({model:'switchboard-devin-astra',input:'hello',tools}));
  assert.equal(seen.at(-1).tools[0].name,'switchboard_tool_search');
 }finally{await close(proxy);await close(upstream);}
});
