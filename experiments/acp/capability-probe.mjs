import {findCLI} from '../../gateway/providers/discovery.mjs';
const model=process.env.ACP_MODEL;const effort=process.env.ACP_EFFORT||'low';if(!model)throw Error('missing model');
import fs from 'node:fs';
import {SessionCalls} from '../../experiments/acp/session-calls.mjs';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {findCodex,nativeCatalog,modelEntry} from '../../gateway/codex/catalog.mjs';
import {decodeBody} from '../../gateway/codex/proxy.mjs';
import {spawn,spawnSync} from 'node:child_process';
import {privateDirectory,readProtected,atomicWrite,writeJSON} from '../../gateway/core/files.mjs';
import {devinCredentialsPath} from '../../gateway/core/paths.mjs';
const visionMode=process.env.ACP_VISION_CARD!==undefined;
const card=Number(process.env.ACP_VISION_CARD||0);const noImage=process.env.ACP_NO_IMAGE==='1';
const imagePrompt=process.env.ACP_VISION_PAIR==='1'?'Read the characters in both attached images, in attachment order. Reply only with the two codes separated by a comma. If no image is attached, reply NO_IMAGE. Do not guess or use tools.':'Read the characters printed in the attached image. Reply only with the exact characters. If no image is available, reply NO_IMAGE. Do not guess. Do not use tools.';
const root=privateDirectory(fs.mkdtempSync('/private/tmp/switchboard-acp-edit-'));
const work=privateDirectory(path.join(root,'work')),data=privateDirectory(path.join(root,'data'));
privateDirectory(path.join(data,'devin'));atomicWrite(path.join(data,'devin/credentials.toml'),readProtected(devinCredentialsPath));
const imagePath=path.join(work,'attachment.png');if(visionMode&&!noImage)fs.copyFileSync('.build/compat-audit/vision-diagnostic/card-'+card+'.png',imagePath);
const editMode=process.env.ACP_TEST==='edit';const imagePath2=path.join(work,'attachment-2.png');if(visionMode&&!noImage&&process.env.ACP_VISION_PAIR==='1')fs.copyFileSync('.build/compat-audit/vision-diagnostic/card-1.png',imagePath2);const target=path.join(work,'verified.txt');const verificationValue=randomUUID().replaceAll('-','');atomicWrite(target,editMode?'BEFORE_EDIT\n':verificationValue+'\n');
writeJSON(path.join(root,'config.json'),{agent:{model:model},auto_update:false,notify:'never',read_config_from:{cursor:false,windsurf:false,claude:false},permissions:{deny:['Exec(*)'],ask:[`Write(${target})`]}});
writeJSON('.build/compat-audit/acp-edit-location.json',{root,target});
const cancelMode=false;
const evidence={startedAt:Date.now(),cancelMode,model:model,requests:[],updates:{},prompts:0};let seq=0,pending='',sessionId;
const waiters=new Map(),toolCalls=new Map();
const capability=randomUUID();
const callerRelay=http.createServer(async(req,res)=>{try{
 if(req.method!=='POST'||req.headers.authorization!=='Bearer '+capability||req.headers.origin){res.writeHead(403).end();return;}
 const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>1024*1024)throw Error('limit');chunks.push(c);}const body=JSON.parse(Buffer.concat(chunks));
 let result;if(req.url==='/tools'){result={tools:toolSpecs.filter(t=>t.type==='function').map(t=>({name:t.name,description:t.description||t.name,inputSchema:t.parameters}))};evidence.relayToolsListed=(evidence.relayToolsListed||0)+1;}
 else if(req.url==='/call'){if(!toolSpecs.some(t=>t.type==='function'&&t.name===body.name))throw Error('undeclared tool');const output=await external('caller',body);result={content:[{type:'text',text:typeof output==='string'?output:JSON.stringify(output)}]};evidence.relayResults=(evidence.relayResults||0)+1;}
 else{res.writeHead(404).end();return;}res.setHeader('content-type','application/json');res.end(JSON.stringify(result));
 }catch{res.writeHead(502).end();}});
callerRelay.listen(0,'127.0.0.1');await once(callerRelay,'listening');
const add=spawnSync(findCLI('devin'),['mcp','add','codex','--scope','user','--env','RELAY_URL=http://127.0.0.1:'+callerRelay.address().port,'--env','RELAY_CAPABILITY='+capability,'--',process.execPath,path.resolve('experiments/acp/caller-relay.mjs')],{cwd:work,env:{...process.env,XDG_CONFIG_HOME:path.join(root,'config'),XDG_DATA_HOME:data,XDG_CACHE_HOME:path.join(root,'cache')},stdio:'pipe'});evidence.mcpAddExit=add.status;
const child=spawn(findCLI('devin'),['--config',path.join(root,'config.json'),'--model',model,'acp'],{cwd:work,env:{...process.env,XDG_DATA_HOME:data,XDG_CONFIG_HOME:path.join(root,'config'),XDG_CACHE_HOME:path.join(root,'cache'),DEVIN_REFUSAL_FALLBACK:''},stdio:['pipe','pipe','pipe']});
const send=m=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',...m})+'\n');
const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=++seq;waiters.set(id,{resolve,reject});send({id,method,params});});
const timeout=setTimeout(()=>{evidence.timeout=true;child.kill('SIGTERM');codex?.kill('SIGTERM');},150000);
child.stderr.resume();
async function handle(m){
 if(m.method&&m.id!==undefined){
 const p=m.params||{};const row={method:m.method,exactTarget:p.path===target};evidence.requests.push(row);
 if(m.method==='fs/read_text_file'&&p.path===target){const output=await external('read',p);send({id:m.id,result:{content:output}});return;}
 if(m.method==='fs/write_text_file'&&p.path===target&&p.content==='AFTER_EDIT\n'){
 row.expectedContent=true;row.unchangedBeforeClient=fs.readFileSync(target,'utf8')==='BEFORE_EDIT\n';
 if(cancelMode){evidence.cancelSent=true;send({method:'session/cancel',params:{sessionId}});send({id:m.id,error:{code:-32603,message:'Client cancelled the pending write; no file was modified'}});return;}
 await external('write',p);
 if(fs.readFileSync(target,'utf8')!=='AFTER_EDIT\n')throw Error('client edit failed');
 row.clientEditVerified=true;send({id:m.id,result:null});return;
 }
 if(m.method==='session/request_permission'){
 const tc={...(toolCalls.get(p.toolCall?.toolCallId)||{}),...(p.toolCall||{})};row.kind=tc.kind;row.toolKeys=Object.keys(tc);row.inputKeys=Object.keys(tc.rawInput||{});row.fixtureInput=Object.entries(tc.rawInput||{}).filter(([k,v])=>typeof v==='string'&&v===target).map(([k])=>k);row.locationMatches=(tc.locations||[]).map(l=>l.path===target);row.optionKinds=(p.options||[]).map(o=>o.kind);
 const locations=tc.locations||[];const input=tc.rawInput||{}; const allowed=toolSpecs.some(t=>t.type==='function'&&tc._meta?.['cognition.ai/inferenceToolName']==='mcp__codex__'+t.name)||(tc.kind==='edit'&&locations.length>0&&locations.every(l=>l.path===target))||(input.file_path===target&&['BEFORE_EDIT','BEFORE_EDIT\n'].includes(input.old_string)&&['AFTER_EDIT','AFTER_EDIT\n'].includes(input.new_string));
 const opt=(p.options||[]).find(o=>o.kind===(allowed?'allow_once':'reject_once'));
 row.allowed=allowed;send({id:m.id,result:{outcome:opt?{outcome:'selected',optionId:opt.optionId}:{outcome:'cancelled'}}});return;
 }
 send({id:m.id,error:{code:-32601,message:'Outside this single-file diagnostic scope'}});return;
 }
 if(m.method==='session/update'){const u=m.params?.update||{};if(u.toolCallId)toolCalls.set(u.toolCallId,{...(toolCalls.get(u.toolCallId)||{}),...u});const key=u.sessionUpdate||'unknown';evidence.updates[key]=(evidence.updates[key]||0)+1;return;}
 const w=waiters.get(m.id);if(w){waiters.delete(m.id);m.error?w.reject(Object.assign(new Error('ACP error'),{code:m.error.code,category:/trust/i.test(m.error.message)?'trust':/auth/i.test(m.error.message)?'auth':'other'})):w.resolve(m.result);}
}
child.stdout.on('data',c=>{pending+=c;let i;while((i=pending.indexOf('\n'))>=0){const line=pending.slice(0,i);pending=pending.slice(i+1);try{handle(JSON.parse(line)).catch(()=>{evidence.callbackError=true;child.kill('SIGTERM');});}catch{}}});
const closed=new Promise(resolve=>child.on('close',(code,signal)=>{evidence.exitCode=code;evidence.signal=signal;for(const w of waiters.values())w.reject(new Error('closed'));resolve();}));
let codex,activeResponse,started=false,toolSpecs=[],finalText='',finished=false;
const inflight=new Map(),broker=new SessionCalls();const sessionHandle=broker.open(()=>{evidence.disconnectCancelled=true;inflight.clear();if(process.env.ACP_AUDIT_DISCONNECT==='1')setTimeout(()=>codex?.kill('SIGTERM'),1500);if(sessionId)send({method:'session/cancel',params:{sessionId}});});
function external(kind,params){const call=broker.enqueue(sessionHandle,{kind,params});flush();return call.result;}
function flatten(ts,namespace){return ts.flatMap(t=>t.type==='namespace'?flatten(t.tools||[],t.name):[{...t,...(namespace?{namespace}:{})}]);}
function emit(res,item){
 const id='resp_'+randomUUID(),response={id,object:'response',status:'in_progress',output:[]};let seq=0;
 res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
 const event=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,sequence_number:seq++,...data})}\n\n`);
 event('response.created',{response});event('response.output_item.added',{output_index:0,item:{...item,status:'in_progress'}});
 event('response.output_item.done',{output_index:0,item});event('response.completed',{response:{...response,status:'completed',output:[item],usage:{input_tokens:0,output_tokens:0,total_tokens:0}}});res.end();
}
function flush(){
 if(!activeResponse)return;
 const next=broker.take(sessionHandle);if(next){if(process.env.ACP_AUDIT_DISCONNECT==='1'){evidence.disconnectInjected=true;activeResponse.destroy();return;}const task=next.payload;const spec=toolSpecs.find(t=>t.name===(task.kind==='caller'?task.params.name:task.kind==='read'?'exec_command':'apply_patch'));
 if(!spec){broker.cancel(sessionHandle);return;}
 const call=next.id;inflight.set(call,task);const item={id:call,call_id:call,name:spec.name,...(spec.namespace?{namespace:spec.namespace}:{}),status:'completed'};
 if(task.kind==='caller'){Object.assign(item,{type:'function_call',arguments:JSON.stringify(task.params.arguments||{})});}
 else if(task.kind==='read'){Object.assign(item,{type:'function_call',arguments:JSON.stringify({cmd:`cat -- '${target.replaceAll("'","'\\''")}'`,max_output_tokens:1000})});}
 else Object.assign(item,{type:'custom_tool_call',input:'*** Begin Patch\n*** Update File: '+target+'\n@@\n-BEFORE_EDIT\n+AFTER_EDIT\n*** End Patch'});
 evidence.emitted??=[];evidence.emitted.push({kind:task.kind,name:spec.name,type:item.type});const res=activeResponse;activeResponse=null;emit(res,item);
 }else if(finished){const res=activeResponse;activeResponse=null;emit(res,{id:'msg_'+randomUUID(),type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:finalText||'Completed.',annotations:[]}]});}
}
const server=http.createServer(async(req,res)=>{
 try{
 if(evidence.disconnectCancelled){res.writeHead(409,{'content-type':'application/json'}).end(JSON.stringify({error:{code:'session_cancelled',message:'This experimental session was cancelled; start a new session.'}}));return;}
 if(req.method!=='POST'||req.headers.authorization!=='Bearer codex-switchboard-local-only'){res.writeHead(403).end();return;}
 const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(decodeBody(Buffer.concat(chunks),req.headers['content-encoding']));
 evidence.responsesRequests=(evidence.responsesRequests||0)+1;if(evidence.responsesRequests>20)throw Error('request limit');
 evidence.requestMetadata??=[];evidence.requestMetadata.push({path:req.url,model:body.model,keys:Object.keys(body),toolCount:body.tools?.length,toolTypes:(body.tools||[]).map(t=>({type:t.type,name:t.name,keys:Object.keys(t)}))});toolSpecs=flatten(body.tools||[]);evidence.callerTools=[...new Set(toolSpecs.map(t=>t.name))];
 if(activeResponse)throw Error('concurrent response');activeResponse=res;broker.bindResponse(sessionHandle,res);
 for(const item of body.input||[]){const task=inflight.get(item.call_id);if(!task||!['function_call_output','custom_tool_call_output'].includes(item.type))continue;inflight.delete(item.call_id);
 if(task.kind==='caller'){evidence.callerReturned=(evidence.callerReturned||0)+1;broker.complete(sessionHandle,item.call_id,item.output);continue;}
 if(task.kind==='write'){broker.complete(sessionHandle,item.call_id,null);continue;}
 let raw=typeof item.output==='string'?item.output:JSON.stringify(item.output);let parsed;try{parsed=JSON.parse(raw);}catch{}
 if(parsed&&typeof parsed.output==='string')raw=parsed.output;
 const match=raw.match(/(?:Final output:|Output:)\n([\s\S]*)$/);if(match)raw=match[1];
 evidence.readResultShapes??=[];evidence.readResultShapes.push({json:!!parsed,keys:parsed?Object.keys(parsed):[],recognized:!!match,containsFixture:raw.includes('BEFORE_EDIT')||raw.includes('AFTER_EDIT'),categories:['sandbox','Operation not permitted','permission denied','No such file','failed','not found'].filter(k=>raw.toLowerCase().includes(k.toLowerCase()))});
 broker.complete(sessionHandle,item.call_id,raw);
 }
 if(!toolSpecs.some(t=>t.name==='apply_patch')||!toolSpecs.some(t=>t.name==='exec_command'))throw Error('required caller tools missing');
 if(!started){if(body.reasoning?.effort!==effort)throw Error('effort mismatch');const requested=model;const selected=await rpc('session/set_config_option',{sessionId,configId:'model',value:requested});const actual=selected.configOptions?.find(o=>o.id==='model')?.currentValue;if(actual!==requested)throw Error('reasoning selector mismatch');evidence.reasoningSelection={effort,requested,actual};started=true;evidence.prompts++;
 const users=(body.input||[]).filter(i=>i.role==='user');const prompt=users.at(-1);const text=(prompt?.content||[]).filter(c=>c.type==='input_text').map(c=>c.text).join('\n');
 const images=users.flatMap(u=>u.content||[]).filter(c=>c.type==='input_image').map(c=>{const match=/^data:([^;]+);base64,(.+)$/.exec(c.image_url||'');if(!match)throw Error('unsupported image');return {type:'image',mimeType:match[1],data:match[2]};});evidence.imageInputs=images.length;
 rpc('session/prompt',{sessionId,prompt:[...images,{type:'text',text:text||'Read verified.txt and replace BEFORE_EDIT with AFTER_EDIT using editing tools, then read it again to verify. Do not use shell or subagents.'}]}).then(r=>{evidence.stopReason=r.stopReason;finished=true;flush();}).catch(()=>{evidence.promptFailed=true;finished=true;flush();});
 }
 flush();
 }catch{evidence.serverError=true;if(!res.headersSent)res.writeHead(500);res.end();}
});
// Retain only assistant text in memory for the final Responses message.
const originalHandle=handle;handle=async m=>{if(m.method==='session/update'&&m.params?.update?.sessionUpdate==='agent_message_chunk')finalText+=m.params.update.content?.text||'';return originalHandle(m);};
try{
 await rpc('initialize',{protocolVersion:1,clientInfo:{name:'codex-switchboard',version:'0.1.0'},clientCapabilities:{fs:{readTextFile:true,writeTextFile:true},terminal:false}});
 const session=await rpc('session/new',{cwd:work,mcpServers:[]});sessionId=session.sessionId;
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const home=privateDirectory(path.join(root,'codex'));const catalog=await nativeCatalog(process.env.CODEX_HOME||path.join(process.env.HOME,'.codex'));
 const template=catalog.models.find(m=>m.slug==='gpt-5.6-luna')||catalog.models[0]; evidence.template=template.slug;
 writeJSON(path.join(home,'catalog.json'),{models:[modelEntry({id:'acp-model-test',name:'ACP model capability test',provider:'devin',upstream:model,enabled:true,capabilities:{images:true,tools:true,efforts:[effort],defaultEffort:effort,contextWindow:128000}},100,template)]});
 writeJSON(path.join(home,'auth.json'),{OPENAI_API_KEY:'codex-switchboard-local-only'});
 atomicWrite(path.join(home,'config.toml'),`cli_auth_credentials_store = "file"\nopenai_base_url = "http://127.0.0.1:${server.address().port}/v1"\nmodel_catalog_json = ${JSON.stringify(path.join(home,'catalog.json'))}\n[features]\nskip_host_skill_discovery = true\n`);
 const env={...process.env,CODEX_HOME:home,OPENAI_API_KEY:'codex-switchboard-local-only'};delete env.OPENAI_BASE_URL;delete env.CODEX_API_KEY;
 codex=spawn(findCodex(),['exec','--ephemeral','--skip-git-repo-check','--sandbox','workspace-write','--color','never','--json','-m','acp-model-test','-c','model_reasoning_effort='+JSON.stringify(effort),...(visionMode&&!noImage?['-i',imagePath,...(process.env.ACP_VISION_PAIR==='1'?['-i',imagePath2]:[])]:[]),'--',visionMode?imagePrompt:editMode?'Read verified.txt and replace BEFORE_EDIT with AFTER_EDIT using file editing tools. Read again to verify. Reply CHECK_EDIT_OK. Do not use shell or subagents.':'Discover tools from the codex MCP server. Use its exec_command tool to run cat verified.txt. Reply only with the exact value returned from that file. Do not use Devin native file or shell tools. Do not edit files or create subagents.'],{cwd:work,env,stdio:['ignore','pipe','pipe']});
 let buf='';codex.stderr.resume();codex.stdout.on('data',c=>{buf+=c;let at;while((at=buf.indexOf('\n'))>=0){const line=buf.slice(0,at);buf=buf.slice(at+1);try{const e=JSON.parse(line);if(e.item?.type==='file_change'&&e.item.status==='completed')evidence.codexPatchCompleted=true;if(e.item?.type==='command_execution'){evidence.codexCommands??=[];evidence.codexCommands.push({exitCode:e.item.exit_code,status:e.item.status,after:e.item.aggregated_output?.includes('AFTER_EDIT')});}if(e.item?.type==='agent_message')evidence.finalMarker=e.item.text?.includes('CHECK_EDIT_OK');if(e.type==='turn.failed')evidence.codexTurnFailed=true;}catch{}}});
 const [code,signal]=await once(codex,'exit');evidence.codexExitCode=code;evidence.codexSignal=signal;
}finally{
 if(!broker.close(sessionHandle))broker.cancel(sessionHandle);child.kill('SIGTERM');await closed;clearTimeout(timeout);callerRelay.closeAllConnections();await new Promise(r=>callerRelay.close(r));server.closeAllConnections();await new Promise(r=>server.close(r));evidence.fileVerified=fs.readFileSync(target,'utf8')==='AFTER_EDIT\n';fs.rmSync(root,{recursive:true,force:true});evidence.scratchRemoved=!fs.existsSync(root);if(visionMode){const cards=JSON.parse(fs.readFileSync('.build/compat-audit/vision-diagnostic/expected.json'));const expected=cards[card].expected+(process.env.ACP_VISION_PAIR==='1'?cards[1].expected:'');evidence.visionCorrect=finalText.toUpperCase().replace(/[^A-Z0-9]/g,'')===(noImage?'NOIMAGE':expected);evidence.noImage=noImage;evidence.card=card;}evidence.exactResult=finalText.trim()===verificationValue;evidence.containsResult=finalText.includes(verificationValue);evidence.sessionsRemaining=broker.size;evidence.finishedAt=Date.now();writeJSON('.build/compat-audit/'+(process.env.ACP_AUDIT_LABEL||'swe2-session-relay')+'.json',evidence);console.log(JSON.stringify(evidence));
}
