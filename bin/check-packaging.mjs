import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {gzipSync,zstdCompressSync} from 'node:zlib';
import {writeJSON,privateDirectory} from '../gateway/core/files.mjs';
const root=mkdtempSync('/private/tmp/switchboard-package-'),data=privateDirectory(join(root,'data')),home=privateDirectory(join(root,'codex'));
const executable=resolve(process.argv[2] ?? '.build/macos/switchboard-helper');
writeJSON(join(data,'settings.json'),{version:1,codexHome:home,codexCLI:null});
const child=spawn(executable,['--control'],{cwd:root,env:{...process.env,SWITCHBOARD_DATA_DIR:data,DEVIN_CREDENTIALS_FILE:join(root,'no-devin-session'),GROK_HOME:join(root,'no-grok-session'),PATH:'/usr/bin:/bin'},stdio:['pipe','pipe','pipe']});
let buffer='',next=1;const requests=new Map(),stderr=[];
child.stderr.on('data',chunk=>stderr.push(chunk));
child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);let response;try{response=JSON.parse(line);}catch{throw new Error('helper emitted non-JSON output');}if(response.event==='fatal')throw new Error(JSON.stringify(response.error));const waiter=requests.get(response.requestID);if(waiter){requests.delete(response.requestID);response.error?waiter.reject(new Error(response.error.message)):waiter.resolve(response.result);}}});
const request=(op)=>new Promise((resolve,reject)=>{const id=next++;const timeout=setTimeout(()=>reject(new Error('packaged control timed out')),15000);requests.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value);},reject:error=>{clearTimeout(timeout);reject(error);}});child.stdin.write(JSON.stringify({requestID:id,op})+'\n');});
try{
 const initial=await request('initialize');assert.equal(initial.integration.installed,false);
 const started=await request('startPreview');assert.equal(started.gateway,'running');
 const health=await fetch('http://127.0.0.1:9477/health').then(r=>r.json());assert.equal(health.service,'codex-switchboard');
 for(const [encoding,encode] of [['gzip',gzipSync],['zstd',zstdCompressSync]]){
   const encoded=encode(Buffer.from(JSON.stringify({model:'codex-auto-review',input:'local fixture'})));
   const response=await fetch('http://127.0.0.1:9477/codex/v1/responses',{method:'POST',headers:{'content-type':'application/json','content-encoding':encoding,authorization:'Bearer codex-switchboard-local-only'},body:encoded});
   assert.equal(response.status,401,`compiled ${encoding} decoder must reach sentinel rejection`);
 }
 const oversized=await fetch('http://127.0.0.1:9477/codex/v1/responses',{method:'POST',headers:{'content-type':'application/json','content-encoding':'gzip',authorization:'Bearer codex-switchboard-local-only'},body:gzipSync(Buffer.alloc(10*1024*1024+1))});
 assert.equal(oversized.status,413,'compiled decompressed-size bound');
 const refresh=await request('refresh');assert.ok(refresh.registry.providers.devin.error);assert.ok(refresh.registry.providers.grok.error);
 const diagnostics=await request('diagnostics');assert.equal(diagnostics.gateway,'running');assert.equal(Buffer.concat(stderr).length,0);
 console.log(JSON.stringify({passed:true,standaloneExecutable:true,withoutNodeOrBunOnPATH:true,loopbackHealth:true,compiledWorkerControl:true,compiledCompressionBounds:true,missingProvidersIsolated:true,globalConfigWritten:false},null,2));
}finally{
 const exited=once(child,'exit');child.stdin.end();const timer=setTimeout(()=>child.kill('SIGTERM'),3000);await exited;clearTimeout(timer);rmSync(root,{recursive:true,force:true});
}
// Exercise the user's bundled recovery path after the owned control process exits.
{
 const {Integration}=await import('../gateway/codex/config.mjs');
 const {spawnSync}=await import('node:child_process');
 const recoveryRoot=mkdtempSync('/private/tmp/switchboard-recovery-'),recoveryData=privateDirectory(join(recoveryRoot,'app')),recoveryHome=privateDirectory(join(recoveryRoot,'codex'));
 try{
  writeJSON(join(recoveryData,'settings.json'),{version:1,codexHome:recoveryHome,codexCLI:null});
  const manager=new Integration(recoveryData,recoveryHome);manager.install({catalogPath:join(recoveryData,'models.json'),efforts:[]});
  const result=spawnSync(executable,['--restore'],{cwd:recoveryRoot,env:{...process.env,SWITCHBOARD_DATA_DIR:recoveryData,PATH:'/usr/bin:/bin'},encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,'bundled emergency restore must exit successfully');assert.equal(JSON.parse(result.stdout).restored,true);assert.equal(manager.inspect().installed,false);assert.equal(manager.readText().includes('openai_base_url'),false);
  console.log('Bundled emergency restore passed in an isolated Codex home.');
 }finally{rmSync(recoveryRoot,{recursive:true,force:true});}
}
