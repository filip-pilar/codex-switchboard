import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExternalMessage } from '../gateway/codex/compatibility.mjs';
import { prepareGrokResponsesRequest, createSSETransform, normalizeIntegralArguments } from '../gateway/transport/grok.mjs';
import { parseGrokModels, enrichDevinCatalog } from '../gateway/providers/discovery.mjs';

test('external history retains bare messages and ordered collaboration envelopes', () => {
  assert.equal(normalizeExternalMessage({role:'user',content:'hello'}).type,'message');
  const input={type:'agent_message',author:'sender',recipient:'receiver',content:[{type:'input_text',text:'first'},{type:'encrypted_content',encrypted_content:'second'}]};
  const result=normalizeExternalMessage(input);
  assert.deepEqual(result.content.map(p=>p.text),['Agent message from "sender" to "receiver":\n','first','second']);
  assert.equal(result.role,'user'); assert.equal(input.type,'agent_message');
  assert.throws(()=>normalizeExternalMessage({...input,content:[{type:'image'}]}),/unsupported content/);
  const reasoning={type:'reasoning',encrypted_content:'opaque'};
  assert.equal(normalizeExternalMessage(reasoning),reasoning);
});
test('signed-in Grok catalog accepts the official banner but never a partial catalog',()=>{
 const output='You are logged in with grok.com.\n\nDefault model: grok-4.6\n\nAvailable models:\n  * grok-4.6 (default)\n  - grok-4.5';
 assert.deepEqual(parseGrokModels(output,'0.2.111'),[{id:'grok-4.6'},{id:'grok-4.5'}]);
 assert.throws(()=>parseGrokModels(output+'\nunknown banner','0.2.111'),/unfamiliar/);
 assert.throws(()=>parseGrokModels(output.replace('* grok-4.6 (default)',''),'0.2.111'),/absent/);
});
test('cached search stays offline and unsupported built-ins are explained',()=>{
 const input={tools:[{type:'web_search',external_web_access:false},{type:'function',name:'run',parameters:{type:'object',properties:{external_web_access:{type:'boolean'}}}}]};
 const result=prepareGrokResponsesRequest(input).body;
 assert.equal(result.tools.length,1); assert.match(result.instructions,/cached-only web search unavailable/);
 assert.deepEqual(result.tools[0],input.tools[1]);
 assert.deepEqual(prepareGrokResponsesRequest({tools:[{type:'web_search',external_web_access:true}]}).body.tools,[{type:'web_search'}]);
});
test('custom SSE emits decoded patch once across arbitrary UTF-8 and JSON chunks',async()=>{
 const {maps}=prepareGrokResponsesRequest({tools:[{type:'namespace',name:'functions',tools:[{type:'custom',name:'apply_patch'}]}]});
 const input='*** Begin Patch\n*** Add File: café.txt\n+hello\n*** End Patch';
 const args=JSON.stringify({input});
 const events=[{type:'response.output_item.added',item:{id:'x',call_id:'c',type:'function_call',name:'functions__apply_patch',arguments:''}}, ...[args.slice(0,15),args.slice(15)].map(delta=>({type:'response.function_call_arguments.delta',item_id:'x',delta})),{type:'response.function_call_arguments.done',item_id:'x',arguments:args},{type:'response.output_item.done',item:{id:'x',call_id:'c',type:'function_call',name:'functions__apply_patch',arguments:args}}];
 const stream=createSSETransform(maps); const output=[]; const read=(async()=>{for await(const chunk of stream)output.push(chunk);})();
 const bytes=Buffer.from(events.map(e=>`data: ${JSON.stringify(e)}\n\n`).join(''));
 for(let i=0;i<bytes.length;i+=7)stream.write(bytes.subarray(i,i+7));stream.end();await read;
 const result=Buffer.concat(output).toString().trim().split('\n\n').map(x=>JSON.parse(x.slice(6)));
 assert.deepEqual(result.filter(e=>e.type.endsWith('.delta')).map(e=>e.delta),[input]);
 assert.equal(result.at(-1).item.input,input);assert.equal(result.at(-1).item.namespace,'functions');assert.equal(result.at(-1).item.call_id,'c');
});
test('integral tool arguments preserve strings, fractions and large integer precision',()=>{
 const input='{"id":92116.0,"text":"92116.0","fraction":1.5,"large":9007199254740993,"huge":9007199254740993.0}';
 assert.equal(normalizeIntegralArguments(input),input.replace('"id":92116.0','"id":92116'));
 assert.equal(normalizeIntegralArguments('{"broken":'),'{"broken":');
 assert.equal(normalizeIntegralArguments('{"precise":1.000000000000000000001}'),'{"precise":1.000000000000000000001}');
});


test('Devin official capability enrichment preserves exact variants and excludes opaque Claude IDs',()=>{
 const rows=[{selector:'model-high-priority'},{selector:'MODEL_PRIVATE_11'},{selector:'new-model'}];
 const result=enrichDevinCatalog(rows,{families:[{family_uid:'model',variants:[{model_uid:'model-high-priority',max_context_tokens:1000000}]},{family_label:'Claude Haiku',variants:[{model_uid:'MODEL_PRIVATE_11'}]}]});
 assert.deepEqual(result[0].capabilities,{contextWindow:1000000,efforts:['high'],defaultEffort:'high'});
 assert.equal(result[1].provider,'anthropic');assert.equal(result[2],rows[2]);
 assert.throws(()=>enrichDevinCatalog(rows,{families:[{variants:[{model_uid:'x'},{model_uid:'x'}]}]}),/duplicate/);
});
test('custom tool grammar and forced namespace survive conversion',()=>{
 const format={type:'grammar',syntax:'lark',definition:'start: "hello"'};
 const {body}=prepareGrokResponsesRequest({tools:[{type:'namespace',name:'fixture',tools:[{type:'custom',name:'patch',format}]}],tool_choice:{type:'custom',namespace:'fixture',name:'patch'}});
 assert.match(body.tools[0].description,/start: "hello"/);assert.equal(body.tools[0].format,undefined);
 assert.deepEqual(body.tool_choice,{type:'function',name:'fixture__patch'});
});

test('Devin ACP preserves caller namespace and call identity',async()=>{
 const {prepareExternal,HistoryOwnership}=await import('../gateway/codex/compatibility.mjs');
 const input=[{role:'user',content:'hello'},{type:'function_call',namespace:'collaboration',name:'send_message',call_id:'call1',arguments:'{"target":"receiver","message":"15"}'},{type:'function_call_output',call_id:'call1',output:'sent'}];
 const prepared=prepareExternal({input},{provider:'devin',selector:'swe-2-medium',images:false},{},new HistoryOwnership());
 assert.equal(prepared.input[0].role,'user');assert.equal(prepared.input[1].namespace,'collaboration');assert.equal(prepared.input[1].name,'send_message');assert.equal(prepared.input[1].call_id,'call1');assert.deepEqual(prepared.input[2],input[2]);assert.equal(input[1].namespace,'collaboration');
});

test('retained Devin vision reaches catalog and respects explicit provider denial',async()=>{
 const {normalizeDiscovery,initialRegistry,mergeDiscovery}=await import('../gateway/core/registry.mjs');
 const {combinedCatalog}=await import('../gateway/codex/catalog.mjs');
 const {resolveRoute}=await import('../gateway/core/routes.mjs');
 const {prepareExternal,HistoryOwnership}=await import('../gateway/codex/compatibility.mjs');
 const models=normalizeDiscovery('devin',['swe-1-7','swe-1-7-medium','swe-1-7-lightning'].map(selector=>({selector})),{scope:'fixture'});
 const registry=mergeDiscovery(initialRegistry(),'devin',models,'fixture');
 registry.models.forEach(m=>m.enabled=true);registry.appliedModels=structuredClone(registry.models);
 const catalog=combinedCatalog({models:[{slug:'native'}]},registry);
 const image={type:'input_image',image_url:'data:image/png;base64,AA=='};
 for(const m of models.slice(0,2)) {
  assert.deepEqual(catalog.models.find(x=>x.slug===m.id).input_modalities,['text','image']);
  const request={model:m.id,input:[{role:'user',content:[image]}]};
  const prepared=prepareExternal(request,resolveRoute(request,registry),{},new HistoryOwnership());
  assert.deepEqual(prepared.input[0].content,[image]);assert.equal(prepared.model,m.upstream);
 }
 assert.equal(models[2].capabilities.images,true);
 assert.equal(normalizeDiscovery('devin',[{selector:'swe-1-7',capabilities:{images:false}}],{scope:'fixture'})[0].capabilities.images,false);
});

test('Devin preserves explicit web policy for ACP enforcement',async()=>{
 const {prepareExternal,HistoryOwnership}=await import('../gateway/codex/compatibility.mjs');
 const web={type:'web_search',external_web_access:false};
 const prepared=prepareExternal({tools:[web]},{provider:'devin',selector:'swe-1-7',images:true},{},new HistoryOwnership());
 assert.deepEqual(prepared.tools,[web]);
});

test('Devin retains custom grammar and original descriptions through declarations and deferred loading',async()=>{
 const {prepareExternal,HistoryOwnership}=await import('../gateway/codex/compatibility.mjs');
 const grammar={type:'grammar',syntax:'lark',definition:'start: "BEACON:" /[0-9]{4}/'};
 const custom={type:'custom',name:'format_fixture',description:'Preserve this entire description verbatim.',format:grammar};
 const namespace={type:'namespace',name:'lab',tools:[custom]};
 const original={tools:[namespace],input:[{type:'tool_search_output',execution:'client',call_id:'c',tools:[namespace]}]};
 const route={provider:'devin',selector:'swe-1-7',images:true};
 const result=prepareExternal(original,route,{},new HistoryOwnership());
 for(const tool of [result.tools[0].tools[0],result.input[0].tools[0].tools[0]]) {
  assert.ok(tool.description.startsWith(custom.description+'\n'));
  assert.ok(tool.description.endsWith(grammar.definition));assert.deepEqual(tool.format,grammar);assert.equal(tool.name,custom.name);
 }
 assert.equal(original.tools[0].tools[0].description,custom.description);
 assert.throws(()=>prepareExternal({tools:[{...custom,format:{type:'grammar',syntax:'lark'}}]},route,{},new HistoryOwnership()),e=>e.code==='invalid_custom_format');
 const grok=prepareExternal(original,{...route,provider:'grok',selector:'grok-4.6'},{},new HistoryOwnership());
 assert.deepEqual(grok.tools,original.tools);
});
