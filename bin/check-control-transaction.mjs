// Uses normalized discovery cache and protected credential *scope checks* only.
// Applies/restores an isolated Codex home; never forwards inference.
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {readJSON,writeJSON,privateDirectory,atomicWrite,readProtected} from '../gateway/core/files.mjs';
const root=mkdtempSync('/private/tmp/switchboard-control-'),data=privateDirectory(join(root,'app')),home=privateDirectory(join(root,'codex'));
const cache=readJSON(join(process.env.HOME,'Library/Application Support/Codex Switchboard/gateway-config.json'));
const original='cli_auth_credentials_store = "file"\n# untouched fixture preference\nmodel = "gpt-6-astra"\n';
atomicWrite(join(home,'config.toml'),original);
atomicWrite(join(home,'models_cache.json'),readProtected(join(process.env.CODEX_HOME??join(process.env.HOME,'.codex'),'models_cache.json')));
writeJSON(join(data,'settings.json'),{version:1,codexHome:home,codexCLI:null});writeJSON(join(data,'gateway-config.json'),cache);
const child=spawn(resolve('dist/Codex Switchboard.app/Contents/Resources/switchboard-helper'),['--control'],{cwd:'/private/tmp',env:{...process.env,SWITCHBOARD_DATA_DIR:data},stdio:['pipe','pipe','ignore']});
let buffer='',sequence=0;const pending=new Map();
child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let value;try{value=JSON.parse(line);}catch{continue;}const waiter=pending.get(value.requestID);if(waiter){clearTimeout(waiter.timer);pending.delete(value.requestID);value.error?waiter.reject(new Error(value.error.code+': '+value.error.message)):waiter.resolve(value.result);}}});
const request=(op,values={})=>new Promise((resolve,reject)=>{const requestID=++sequence,timer=setTimeout(()=>reject(new Error('control_timeout')),60000);pending.set(requestID,{resolve,reject,timer});child.stdin.write(JSON.stringify({requestID,op,...values})+'\n');});
try{
 const candidate=cache.models.find(m=>m.provider==='devin'&&m.compatible&&!m.enabled&&m.availability==='advertised');assert.ok(candidate);
 await request('enable',{id:candidate.id,enabled:true});
 const applied=await request('apply',{providerOnly:true,nativeAuthAbsentVerified:true});
 assert.equal(applied.integration.installed,true);assert.equal(applied.gateway,'running');assert.equal(applied.pendingCatalog,false);assert.equal(applied.integration.restartRequired,true);
 assert.ok(applied.registry.appliedModels.some(m=>m.id===candidate.id));
 const manifest=readJSON(join(data,'install-state.json')),catalog=readJSON(manifest.applied.model_catalog_json.value);
 assert.equal(catalog.models.find(m=>m.slug===candidate.id).visibility,'list');assert.ok(catalog.models.some(m=>m.slug==='gpt-6-astra'));
 const low=await request('select',{id:'switchboard-devin-astra',effort:'low'});assert.equal(low.registry.selection.effort,'low');
 const medium=await request('select',{id:'switchboard-devin-astra',effort:'medium'});assert.equal(medium.registry.selection.effort,'medium');
 const restored=await request('restore');assert.equal(restored.integration.installed,false);assert.equal(restored.gateway,'stopped');assert.equal(existsSync(join(home,'auth.json')),false);
 assert.equal(readFileSync(join(home,'config.toml'),'utf8'),original);
 console.log(JSON.stringify({passed:true,compiledApply:true,dynamicModelApplied:true,nativeCatalogPreserved:true,restartSignalled:true,menuSelection:true,compiledRestore:true,originalConfigRestored:true,sentinelRemoved:true,inferencePerformed:false},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
finally{for(const entry of pending.values())clearTimeout(entry.timer);const exited=once(child,'exit');child.stdin.end();const timer=setTimeout(()=>child.kill('SIGTERM'),3000);await exited;clearTimeout(timer);rmSync(root,{recursive:true,force:true});}
