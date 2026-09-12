// Read-only provider catalog check. This does not start a listener or inference.
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {once} from 'node:events';
const data=mkdtempSync('/private/tmp/switchboard-discovery-');
const child=spawn(resolve('.build/macos/switchboard-helper'),['--control'],{cwd:'/private/tmp',env:{...process.env,SWITCHBOARD_DATA_DIR:data},stdio:['pipe','pipe','ignore']});
let buffer='',timer;
try{
 const result=await new Promise((resolve,reject)=>{
  timer=setTimeout(()=>reject(new Error('discovery_timeout')),55000);
  child.on('error',reject);child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
   buffer+=chunk;if(buffer.length>4*1024*1024){reject(new Error('discovery_output_limit'));return;}
   let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let response;try{response=JSON.parse(line);}catch{reject(new Error('invalid_control_reply'));return;}
    if(response.requestID===1){if(response.error)reject(new Error(response.error.code));else resolve(response.result);}
   }
  });child.stdin.write('{"requestID":1,"op":"refresh","provider":"devin"}\n');
 });
 const provider=result.registry.providers.devin,models=result.registry.models.filter(m=>m.provider==='devin'),astra=models.find(m=>m.id==='switchboard-devin-astra');
 console.log(JSON.stringify({provider:'devin',status:provider.status,error:provider.error?.code??null,discoveredModels:models.length,astra:astra?{efforts:astra.capabilities.efforts,images:astra.capabilities.images}:null,inferencePerformed:false,globalConfigWritten:false},null,2));
}finally{clearTimeout(timer);const exit=once(child,'exit');child.stdin.end();const stop=setTimeout(()=>child.kill('SIGTERM'),3000);await exit;clearTimeout(stop);rmSync(data,{recursive:true,force:true});}
