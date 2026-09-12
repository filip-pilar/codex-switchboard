// Authenticated discovery/startup only: no inference is forwarded upstream.
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const root=mkdtempSync('/private/tmp/switchboard-provider-start-'),capability=randomBytes(32).toString('base64url');
const child=spawn(resolve('.build/macos/switchboard-helper'),['--worker','devin'],{cwd:'/private/tmp',env:{...process.env,SWITCHBOARD_DATA_DIR:root},stdio:['pipe','pipe','pipe']});
let buffer='',sequence=0;const pending=new Map(),stderr=[];
child.stderr.on('data',c=>stderr.push(c));child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);let reply;try{reply=JSON.parse(line);}catch{continue;}const waiter=pending.get(reply.id);if(waiter){clearTimeout(waiter.timer);pending.delete(reply.id);reply.error?waiter.reject(new Error(reply.error.code)):waiter.resolve(reply.result);}}});
const request=(op,values={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reject(new Error('provider_start_timeout')),45000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,op,capability,...values})+'\n');});
try{
 const discovered=await request('discover');assert.ok(discovered.models.some(m=>m.id==='switchboard-devin-astra'));
 const {port}=await request('start');assert.ok(port>0&&port!==9477);
 assert.equal((await request('validateSelector',{selector:'gpt-6-astra-medium'})).exact,true);
 assert.equal((await request('validateSelector',{selector:'gpt-5.4'})).exact,false);
 const response=await fetch(`http://127.0.0.1:${port}/v1/responses`,{method:'POST'});assert.equal(response.status,401);
 const unused=await fetch(`http://127.0.0.1:${port}/v1/messages`,{method:'POST',headers:{'x-api-key':capability}});assert.equal(unused.status,404);
 assert.equal(Buffer.concat(stderr).length,0);
 console.log(JSON.stringify({passed:true,provider:'devin',compiledTransportStarted:true,exactSelectorEnforced:true,loopbackPrivateListener:true,unauthorizedRejected:true,unusedRoutesRejected:true,rawLogs:false,inferencePerformed:false},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
finally{for(const entry of pending.values())clearTimeout(entry.timer);const exited=once(child,'exit');child.stdin.end();const timer=setTimeout(()=>child.kill('SIGTERM'),3000);await exited;clearTimeout(timer);rmSync(root,{recursive:true,force:true});}
