import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {createServer,request} from 'node:http';
import {once} from 'node:events';
import {protectInternalServer} from '../gateway/transport/devin.mjs';
import {Controller} from '../gateway/service/controller.mjs';
import {initialRegistry,normalizeDiscovery,mergeDiscovery} from '../gateway/core/registry.mjs';

test('discovery-before-start keeps the actual pinned config on loopback and the selected private port',async()=>{
  const root=mkdtempSync('/private/tmp/switchboard-worker-');
  try{
    const script=`
      import {prepareWorkerEnvironment} from './gateway/service/worker.mjs';
      import {startDevinTransport} from './gateway/transport/devin.mjs';
      import {createServer} from 'node:http';
      import assert from 'node:assert/strict';
      prepareWorkerEnvironment({devinUpstreamDataDir:${JSON.stringify(join(root,'private'))}});
      process.env.API_KEY='fixture-capability-123';process.env.CODEIUM_API_KEY='fixture-token';
      const {config}=await import('windsurf-api/src/config.js');
      assert.equal(config.host,'127.0.0.1');assert.equal(config.port,0);assert.equal(config.defaultModel,'gpt-6-astra-medium');
      const {setLiveCatalogSelectors,resolveConnectSelector}=await import('windsurf-api/src/devin-connect-models.js');
      setLiveCatalogSelectors([{selector:'fixture-new-coding-model'}]);
      assert.deepEqual(resolveConnectSelector('fixture-new-coding-model'),{selector:'fixture-new-coding-model',mapped:true});
      const server=await startDevinTransport({port:0,token:'fixture-token',internalCapability:'fixture-capability-123',dataDir:${JSON.stringify(join(root,'private'))},defaultModel:'gpt-6-astra-medium',loadUpstream:async()=>{const s=createServer((_req,res)=>res.end());s.listen(config.port,config.host);return()=>s;}});
      assert.equal(server.address().address,'127.0.0.1');assert.ok(server.address().port>0);server.close();
    `;
    const child=spawn(process.execPath,['--input-type=module','-e',script],{cwd:process.cwd(),env:{...process.env,WINDSURFAPI_SKIP_DOTENV:'1'},stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',c=>error+=c);const [code]=await once(child,'exit');assert.equal(code,0,error.slice(0,1000));
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('private Devin boundary refuses all unused routes even with a valid capability',async()=>{
  const server=createServer((_req,res)=>res.end('fixture'));protectInternalServer(server,'fixture-capability-123');server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const base=`http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base+'/v1/responses',{method:'POST'})).status,401);
    assert.equal((await fetch(base+'/v1/messages',{method:'POST',headers:{'x-api-key':'fixture-capability-123'}})).status,404);
    assert.equal((await fetch(base+'/dashboard',{headers:{'x-api-key':'fixture-capability-123'}})).status,404);
    assert.equal((await fetch(base+'/v1/responses',{method:'POST',headers:{'x-api-key':'fixture-capability-123'}})).status,200);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('refresh failure retains cache and a new account scope cannot start inference with old entitlements',async()=>{
  const root=mkdtempSync('/private/tmp/switchboard-controller-');
  const controller=new Controller({env:{...process.env,SWITCHBOARD_DATA_DIR:root}});
  try{
    controller.registry=mergeDiscovery(initialRegistry(),'devin',normalizeDiscovery('devin',[{selector:'gpt-6-astra-medium'}],{scope:'old'}),'old');
    const previous=structuredClone(controller.registry.models);
    controller.workers={scope:async()=>({scope:'old'}),discover:async()=>{throw new Error('fixture outage');},stop(){}};
    await controller.refresh('devin');assert.deepEqual(controller.registry.models,previous);assert.equal(controller.registry.providers.devin.status,'refresh_failed');
    let started=false,paused=false;
    controller.workers={scope:async()=>({scope:'new'}),pause(){paused=true;},resume(){},discover:async()=>{throw new Error('fixture outage');},start(){started=true;},stop(){}};
    await assert.rejects(controller.readyWorker('devin'),/identity changed/);assert.equal(started,false);assert.equal(paused,true);assert.equal(controller.registry.models[0].availability,'needs_refresh');
    await controller.refreshes.get('devin');
  }finally{await controller.close();rmSync(root,{recursive:true,force:true});}
});
