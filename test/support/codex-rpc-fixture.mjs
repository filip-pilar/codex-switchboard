#!/usr/bin/env node
import {createInterface} from 'node:readline';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const mode=readFileSync(join(process.env.CODEX_HOME,'fixture-mode'),'utf8');
const reply=(id,result)=>process.stdout.write(JSON.stringify({id,result})+'\n');
const input=createInterface({input:process.stdin});
input.on('close',()=>process.exit());
input.on('line',line=>{
 const message=JSON.parse(line);if(mode==='timeout')return;
 if(message.method==='initialize')reply(message.id,{userAgent:'fixture'});
 else if(message.method==='account/read')reply(message.id,{account:{type:'chatgpt',accountId:'fixture',email:'fixture@example.test'}});
 else if(message.method==='account/rateLimits/read')reply(message.id,{rateLimits:{primary:{usedPercent:33,windowDurationMins:300,resetsAt:2000000000},secondary:{usedPercent:58,windowDurationMins:10080,resetsAt:2000000000}}});
 else if(message.method==='account/login/start'){
   if(mode==='login')process.stdout.write(JSON.stringify({method:'account/login/completed',params:{success:true}})+'\n');
   reply(message.id,{authUrl:'https://example.test/login',loginId:'fixture'});
 }
});
