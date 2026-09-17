import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {Controller} from '../gateway/service/controller.mjs';
import {initialRegistry,normalizeDiscovery,mergeDiscovery} from '../gateway/core/registry.mjs';

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
