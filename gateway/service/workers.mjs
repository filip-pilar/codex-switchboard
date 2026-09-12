import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BoardError } from '../core/errors.mjs';

export function helperCommand(extra = []) {
  const entry=fileURLToPath(new URL('../../bin/switchboard-helper.mjs',import.meta.url));
  return { executable:process.execPath,args:[...(entry.includes('$bunfs') ? [] : [entry]),...extra] };
}
class Worker {
  constructor(provider, env, onExit) {
    this.provider=provider; this.capability=randomBytes(32).toString('base64url'); this.pending=new Map(); this.next=1; this.port=null; this.stopped=false;
    const command=helperCommand(['--worker',provider]);
    const isolated=Object.fromEntries(Object.entries(env).filter(([key])=>!key.startsWith('ASTRAFLOW_')&&!key.startsWith('CODEIUM_')&&!key.startsWith('DASHBOARD_')&&!key.startsWith('WINDSURF_')&&!key.startsWith('WINDSURFAPI_')&&!key.startsWith('POLICY_BLOCK_')&&!['API_KEY','DATA_DIR','GROK_API_KEY','XAI_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','DEVIN_CONNECT_CRED_KEY'].includes(key)));
    this.child=spawn(command.executable,command.args,{env:isolated,stdio:['pipe','pipe','ignore']});
    let pending='';
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data',chunk=>{
      pending+=chunk;
      if (Buffer.byteLength(pending)>4*1024*1024) { this.stop(); return; }
      let newline;
      while ((newline=pending.indexOf('\n'))>=0) {
        const line=pending.slice(0,newline);pending=pending.slice(newline+1);
        let message;try {message=JSON.parse(line);} catch {this.stop();return;}
        const waiter=this.pending.get(message.id);if(!waiter)continue;
        clearTimeout(waiter.timer);this.pending.delete(message.id);
        if(message.error)waiter.reject(new BoardError(message.error.code,message.error.message,503));else waiter.resolve(message.result);
      }
    });
    const failed=()=>{
      const wasServing=!!this.port;this.port=null;
      for(const waiter of this.pending.values()){clearTimeout(waiter.timer);waiter.reject(new BoardError('worker_stopped','The provider worker stopped. Reconnect the provider.',503));}
      this.pending.clear();onExit(this.stopped,wasServing);
    };
    this.child.once('exit',failed);this.child.once('error',failed);
  }
  request(op,values={}) {
    if(this.stopped) return Promise.reject(new BoardError('worker_stopped','The provider worker is stopped.',503));
    const id=this.next++;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new BoardError('worker_timeout','The provider operation timed out. Cached models were retained.',503));this.stop();},45000);
      this.pending.set(id,{resolve,reject,timer});
      this.child.stdin.write(JSON.stringify({id,op,capability:this.capability,...values})+'\n',error=>{if(error){clearTimeout(timer);this.pending.delete(id);reject(new BoardError('worker_stopped','The provider worker is unavailable.',503));}});
    });
  }
  async start(){ if(!this.port){const result=await this.request('start',{capability:this.capability});this.port=result.port;}return this; }
  stop(){ if(this.stopped)return;this.stopped=true;this.child.stdin.end();this.child.kill('SIGTERM'); }
}
export class Workers {
  constructor(env,onState=()=>{}) {this.env=env;this.onState=onState;this.workers=new Map();this.failures=new Map();this.paused=new Set();this.starts=new Map();this.restartTimers=new Map();}
  worker(provider) {
    if(this.paused.has(provider))throw new BoardError('provider_reconnecting','This provider is reconnecting. Other routes remain available.',503);
    const failure=this.failures.get(provider);
    if(failure?.count>=4)throw new BoardError('worker_needs_attention','The provider worker stopped repeatedly. Reconnect this provider to retry.',503);
    if(failure && Date.now()<failure.retryAt)throw new BoardError('worker_backoff','The provider worker is restarting after a failure. Retry shortly or reconnect.',503);
    if(!this.workers.has(provider)){
      const instance=new Worker(provider,this.env,(intentional,wasServing)=>{
        if(this.workers.get(provider)!==instance)return;
        this.workers.delete(provider);this.starts.delete(provider);
        if(!intentional){
          const previous=this.failures.get(provider),count=(previous && Date.now()-previous.at<60000?previous.count:0)+1,delay=Math.min(60000,1000*2**count);
          this.failures.set(provider,{count,at:Date.now(),retryAt:Date.now()+delay});this.onState(provider,count>=4?'needs_attention':'restarting');
          if(wasServing && count<4){const timer=setTimeout(()=>{this.restartTimers.delete(provider);if(!this.paused.has(provider))this.start(provider).catch(()=>{});},delay);timer.unref();this.restartTimers.set(provider,timer);}
        }
      });
      this.workers.set(provider,instance);
    }
    return this.workers.get(provider);
  }
  async start(provider){
    if(!this.starts.has(provider))this.starts.set(provider,this.worker(provider).start().then(worker=>{if(Date.now()-(this.failures.get(provider)?.at??0)>60000)this.failures.delete(provider);this.onState(provider,'ready');return worker;}).finally(()=>this.starts.delete(provider)));
    return this.starts.get(provider);
  }
  async discover(provider){return this.worker(provider).request('discover');}
  async scope(provider){return this.worker(provider).request('scope');}
  pause(provider){clearTimeout(this.restartTimers.get(provider));this.restartTimers.delete(provider);this.paused.add(provider);this.workers.get(provider)?.stop();this.workers.delete(provider);this.starts.delete(provider);}
  resume(provider){this.paused.delete(provider);this.failures.delete(provider);}
  stop(){for(const timer of this.restartTimers.values())clearTimeout(timer);this.restartTimers.clear();for(const worker of this.workers.values())worker.stop();this.workers.clear();}
}
