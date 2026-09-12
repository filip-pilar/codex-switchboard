import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {privateDirectory,writeJSON,atomicWrite} from '../gateway/core/files.mjs';
import {nativeCatalog,combinedCatalog,findCodex} from '../gateway/codex/catalog.mjs';
import {initialRegistry,mergeDiscovery,normalizeDiscovery} from '../gateway/core/registry.mjs';
const root=mkdtempSync('/private/tmp/switchboard-runtime-'),home=privateDirectory(join(root,'codex'));
const codex=findCodex(),seen=[];
let server,child;
const bounded=async(promise,ms=30000)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('runtime fixture timed out')),ms))]);}finally{clearTimeout(timer);}};
const run=(args,env)=>new Promise((resolve,reject)=>{
 child=spawn(codex,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
 child.stdout.on('data',c=>{stdout+=c;if(stdout.length>4*1024*1024)child.kill();});child.stderr.on('data',c=>{stderr+=c;if(stderr.length>1024*1024)child.kill();});child.on('error',reject);child.on('exit',code=>resolve({code,stdout,stderr}));
});
try{
 const native=await nativeCatalog(process.env.CODEX_HOME ?? join(process.env.HOME,'.codex'));
 let registry=mergeDiscovery(initialRegistry(),'devin',normalizeDiscovery('devin',['low','medium','high','xhigh','max'].map(e=>({selector:`gpt-6-astra-${e}`})),{scope:'fixture'}),'fixture');
 registry=mergeDiscovery(registry,'grok',normalizeDiscovery('grok',[{id:'grok-4.5'}],{scope:'fixture'}),'fixture');
 const catalog=combinedCatalog(native,registry),catalogPath=join(root,'models.json');writeJSON(catalogPath,catalog);
 writeJSON(join(home,'auth.json'),{OPENAI_API_KEY:'codex-switchboard-local-only'});
 server=createServer(async(req,res)=>{
   let bytes=0;for await(const chunk of req)bytes+=chunk.length;
   seen.push({path:req.url,method:req.method,bytes});
   if(req.url.includes('/responses')){
     const response={id:'fixture-response',object:'response',created_at:1,status:'completed',model:'switchboard-devin-astra',output:[{id:'fixture-message',type:'message',status:'completed',role:'assistant',content:[{type:'output_text',text:'LOCAL_FIXTURE_OK',annotations:[]}]}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}};
     res.writeHead(200,{'content-type':'text/event-stream'});
     res.end(`data: ${JSON.stringify({type:'response.created',response:{...response,status:'in_progress',output:[]}})}\n\ndata: ${JSON.stringify({type:'response.output_item.done',output_index:0,item:response.output[0]})}\n\ndata: ${JSON.stringify({type:'response.completed',response})}\n\n`);
   }else{res.writeHead(404,{'content-type':'application/json'});res.end('{"error":"fixture endpoint only"}');}
 });
 server.on('upgrade',(_req,socket)=>{seen.push({path:'websocket-upgrade',method:'GET'});socket.end('HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');});
 server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;
 atomicWrite(join(home,'config.toml'),`cli_auth_credentials_store = "file"\nopenai_base_url = "http://127.0.0.1:${port}/codex/v1"\nmodel_catalog_json = ${JSON.stringify(catalogPath)}\nmodel = "switchboard-devin-astra"\nmodel_reasoning_effort = "medium"\n`);
 const env={...process.env,CODEX_HOME:home,OPENAI_API_KEY:'codex-switchboard-local-only'};delete env.OPENAI_BASE_URL;
 // Official app-server, local sentinel, combined catalog; no upstream inference.
 child=spawn(codex,['app-server','--stdio'],{cwd:root,env,stdio:['pipe','pipe','ignore']});
 let buffer='',next=1;const pending=new Map();
 child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;if(buffer.length>16*1024*1024){child.kill();return;}let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);let message;try{message=JSON.parse(line);}catch{continue;}const waiter=pending.get(message.id);if(waiter){pending.delete(message.id);message.error?waiter.reject(new Error('runtime RPC rejected: '+JSON.stringify(message.error))):waiter.resolve(message.result);}}});
 const request=(method,params)=>bounded(new Promise((resolve,reject)=>{const id=next++;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,params})+'\n');}));
 await request('initialize',{clientInfo:{name:'switchboard_fixture',version:'0.1.0'},capabilities:{experimentalApi:true}});
 child.stdin.write('{"method":"initialized"}\n');
 const result=await request('model/list',{includeHidden:true});
 const models=result.data ?? result.models ?? [];
 const ids=models.map(m=>m.id??m.model);
 assert.ok(ids.includes('switchboard-devin-astra'),'Astra must be exposed by actual runtime model/list');
 assert.ok(ids.includes('switchboard-grok'),'Grok must be exposed by actual runtime model/list');
 assert.ok(ids.includes('switchboard-selected'),'menu alias must be exposed by actual runtime model/list');
 const astra=models.find(m=>(m.id??m.model)==='switchboard-devin-astra');
 assert.ok((astra.supportedReasoningEfforts??astra.supported_reasoning_levels??[]).some(e=>(e.reasoningEffort??e.effort)==='max'),'Max must be accepted by installed schema');
 child.stdin.end();child.kill('SIGTERM');await once(child,'exit');child=null;
 const inference=await bounded(run(['exec','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--color','never','Return the local fixture marker only.'],env));
 assert.equal(inference.code,0,'local CLI fixture failed: '+inference.stderr.slice(-2000));
 assert.ok(inference.stdout.includes('LOCAL_FIXTURE_OK'),'local SSE result not consumed');
 assert.ok(seen.some(r=>r.path==='/codex/v1/responses'||r.path==='/codex/v1/v1/responses'),'unexpected Responses suffix');
 console.log(JSON.stringify({passed:true,modelPickerEntries:ids.filter(id=>id.startsWith('switchboard-')),reasoningAccepted:'max',localSentinel:true,observedPaths:seen.map(r=>r.path),localSSE:true,liveInference:false},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
finally{child?.kill('SIGTERM');if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}rmSync(root,{recursive:true,force:true});}
