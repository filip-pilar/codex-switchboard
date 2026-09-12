#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { resolveBridgePaths } from '../gateway/core/paths.mjs';
import { privateDirectory, readJSON, writeJSON, checkPath } from '../gateway/core/files.mjs';
import { safeError } from '../gateway/core/errors.mjs';

process.umask(0o077);
if(process.argv.includes('--worker')){
  const {runWorker}=await import('../gateway/service/worker.mjs');
  await runWorker(process.argv[process.argv.indexOf('--worker')+1]);
}else{
  const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
  const dataDir=privateDirectory(resolveBridgePaths().bridgeDataDir),lock=join(dataDir,'helper.lock');
  let ownsLock=false,controller;
  const shutdown=async()=>{await controller?.close();if(ownsLock){checkPath(lock,{directory:true});rmSync(lock,{recursive:true});}process.exit(0);};
  try{
    try{mkdirSync(lock,{mode:0o700});ownsLock=true;}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      checkPath(lock,{directory:true});const owner=readJSON(join(lock,'owner.json'),null);
      if(!Number.isInteger(owner?.pid)||owner.pid<2)throw new Error('unknown_helper_lock');
      let live=true;try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')live=false;}
      if(live)throw new Error('helper_already_running');
      rmSync(lock,{recursive:true});mkdirSync(lock,{mode:0o700});ownsLock=true;
    }
    writeJSON(join(lock,'owner.json'),{pid:process.pid});
    const {Controller}=await import('../gateway/service/controller.mjs');
    controller=new Controller({onEvent:process.argv.includes('--restore')?()=>{}:send});
    if(process.argv.includes('--restore')) {
      const result=await controller.command({op:'restore'});
      send({restored:!result.integration.installed,restartRequired:true});
      await shutdown();
    }
    let chain=Promise.resolve();
    const input=createInterface({input:process.stdin,crlfDelay:Infinity});
    input.on('line',line=>{
      if(Buffer.byteLength(line)>65536){shutdown();return;}
      let message;try{message=JSON.parse(line);}catch{send({error:{code:'invalid_command',message:'Use a JSON control command.'}});return;}
      if(!Number.isInteger(message.requestID)){send({error:{code:'invalid_command',message:'A numeric requestID is required.'}});return;}
      const run=async()=>{try{const result=await controller.command(message);send({requestID:message.requestID,result});}catch(error){send({requestID:message.requestID,error:safeError(error)});}};
      if(message.op==='status')run();else chain=chain.then(run);
    });
    input.on('close',shutdown);process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
    send({event:'ready',version:1});
  }catch(error){send({event:'fatal',error:safeError(error)});if(ownsLock)rmSync(lock,{recursive:true});process.exitCode=1;}
}
