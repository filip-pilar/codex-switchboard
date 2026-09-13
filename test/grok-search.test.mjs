import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareGrokResponsesRequest,restoreGrokResponsesEvent,createSSETransform} from '../gateway/transport/grok.mjs';
const search={type:'tool_search',execution:'client',description:'Find tools',parameters:{type:'object',properties:{query:{type:'string'},limit:{type:'integer'}},required:['query'],additionalProperties:false}};
const cold={type:'namespace',name:'lab',defer_loading:true,tools:[{type:'function',name:'read',parameters:{type:'object',properties:{},additionalProperties:false}}]};
const base={model:'grok-4.6',tools:[search,cold]};
test('search loads only discovered tools and preserves namespaced replay identity',()=>{
 const first=prepareGrokResponsesRequest(base);
 assert.equal(first.body.tools.length,1);assert.equal(first.body.tools[0].type,'function');assert.deepEqual(first.body.tools[0].parameters,search.parameters);
 const searchCall=restoreGrokResponsesEvent({type:'response.output_item.done',item:{type:'function_call',id:'s',call_id:'c',name:first.body.tools[0].name,arguments:'{"query":"beacon","limit":2}'}},first.maps).item;
 assert.equal(searchCall.type,'tool_search_call');assert.deepEqual(searchCall.arguments,{query:'beacon',limit:2});assert.equal(searchCall.execution,'client');
 const history=[searchCall,{type:'tool_search_output',call_id:'c',execution:'client',tools:[cold]}];
 const second=prepareGrokResponsesRequest({...base,input:history});
 assert.deepEqual(second.body.tools.map(t=>t.name),['switchboard_tool_search','lab__read']);
 assert.equal(second.body.tools[1].defer_loading,undefined);
 assert.equal(second.body.input[0].call_id,'c');assert.equal(second.body.input[0].type,'function_call');assert.equal(second.body.input[1].type,'function_call_output');
 const called=restoreGrokResponsesEvent({type:'response.completed',response:{output:[{type:'function_call',call_id:'r',name:'lab__read',arguments:'{}'}]}},second.maps).response.output[0];
 assert.equal(called.namespace,'lab');assert.equal(called.name,'read');
 const third=prepareGrokResponsesRequest({...base,input:[...history,called,{type:'function_call_output',call_id:'r',output:'ok'}]});
 assert.equal(third.body.input[2].name,'lab__read');assert.equal(third.body.input[3].call_id,'r');
 assert.equal(third.body.tools.length,2);assert.equal(base.tools[1].defer_loading,true);
});
test('search handles empty results, malformed history, reserved names and provider isolation',()=>{
 const empty=prepareGrokResponsesRequest({...base,input:[{type:'tool_search_call',execution:'client',call_id:'s',arguments:{query:'none'}},{type:'tool_search_output',execution:'client',call_id:'s',tools:[]}]});assert.equal(empty.body.tools.length,1);
 assert.throws(()=>prepareGrokResponsesRequest({...base,tools:[search,{type:'function',name:'switchboard_tool_search'}]}),/conflicts/);
 assert.throws(()=>prepareGrokResponsesRequest({...base,tools:[{...search,execution:'server'}]}),/client-executed/);
 assert.throws(()=>prepareGrokResponsesRequest({...base,input:[{type:'tool_search_call',execution:'client',call_id:'s',arguments:'invalid'}]}),/invalid JSON/);
 const legacy=prepareGrokResponsesRequest({...base,model:'grok-4.5'});assert.equal(legacy.maps.searchName,undefined);assert.match(legacy.body.instructions,/tool_search unavailable/);
});
test('streamed search suppresses function argument fragments and returns complete object arguments',async()=>{
 const {maps}=prepareGrokResponsesRequest(base);
 const start={type:'function_call',id:'s',call_id:'c',name:maps.searchName,arguments:''};
 const done={...start,arguments:'{"query":"beacon"}',status:'completed'};
 const events=[{type:'response.output_item.added',item:start},{type:'response.function_call_arguments.delta',item_id:'s',delta:'{"query":'},{type:'response.function_call_arguments.delta',item_id:'s',delta:'"beacon"}'},{type:'response.function_call_arguments.done',item_id:'s',arguments:done.arguments},{type:'response.output_item.done',item:done},{type:'response.completed',response:{output:[done]}}];
 const stream=createSSETransform(maps),chunks=[];const read=(async()=>{for await(const chunk of stream)chunks.push(chunk);})();
 const wire=Buffer.from(events.map(e=>`data: ${JSON.stringify(e)}\n\n`).join(''));
 for(let i=0;i<wire.length;i+=3)stream.write(wire.subarray(i,i+3));stream.end();await read;
 const output=Buffer.concat(chunks).toString().trim().split('\n\n').map(e=>JSON.parse(e.slice(6)));
 assert.equal(output.length,3);assert.equal(output[0].item.type,'tool_search_call');assert.deepEqual(output[1].item.arguments,{query:'beacon'});assert.equal(output[2].response.output[0].call_id,'c');
 assert.throws(()=>restoreGrokResponsesEvent({type:'response.output_item.done',item:{...done,arguments:'[]'}},maps),/must be an object/);
});


test('search replay deduplicates loaded schemas, validates forced search and cancels cleanly',()=>{
 const call={type:'tool_search_call',execution:'client',call_id:'s',arguments:{query:'beacon'}};
 const output={type:'tool_search_output',execution:'client',call_id:'s',tools:[cold,cold]};
 const {body,maps}=prepareGrokResponsesRequest({...base,input:[call,output],tool_choice:{type:'tool_search'}});
 assert.equal(body.tools.length,2);assert.deepEqual(body.tool_choice,{type:'function',name:maps.searchName});
 assert.throws(()=>prepareGrokResponsesRequest({model:'grok-4.6',input:[call,output],tool_choice:{type:'tool_search'}}),/not registered/);
 const cancelled=createSSETransform(maps);cancelled.write('data: {"type":');cancelled.destroy();assert.equal(cancelled.destroyed,true);
});
