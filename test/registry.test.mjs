import test from 'node:test';
import assert from 'node:assert/strict';
import { initialRegistry, normalizeDiscovery, mergeDiscovery, invalidateScope, selectTarget, stableSlug } from '../gateway/core/registry.mjs';
import { resolveRoute } from '../gateway/core/routes.mjs';
import { combinedCatalog } from '../gateway/codex/catalog.mjs';
import { parseGrokModels } from '../gateway/providers/discovery.mjs';

const GROK_ID=stableSlug('grok','grok-4.6');
export function fixtureRegistry() {
  let registry=initialRegistry();
  const astra=['low','medium','high','xhigh','max'].map(e=>({selector:`gpt-6-astra-${e}`,label:`Astra ${e}`}));
  registry=mergeDiscovery(registry,'devin',normalizeDiscovery('devin',astra,{scope:'devin-a',now:100}),'devin-a',100);
  registry=mergeDiscovery(registry,'grok',normalizeDiscovery('grok',[{id:'grok-4.6'}],{scope:'grok-a',now:100}).map(m=>({...m,enabled:true})),'grok-a',100);
  registry.appliedModels=structuredClone(registry.models);registry.appliedRevision=registry.revision;
  registry.selection={id:'switchboard-devin-astra',effort:'medium'};
  return registry;
}
test('menu effort is per-request while direct efforts and reviewer stay independent',()=>{
  const registry=fixtureRegistry();
  assert.equal(resolveRoute({model:'switchboard-selected',reasoning:{effort:'low'}},registry).selector,'gpt-6-astra-medium');
  assert.equal(resolveRoute({model:'switchboard-devin-astra',reasoning:{effort:'low'}},registry).selector,'gpt-6-astra-low');
  const changed=selectTarget(registry,'switchboard-devin-astra','low');
  assert.equal(resolveRoute({model:'switchboard-selected'},changed).selector,'gpt-6-astra-low');
  assert.equal(resolveRoute({model:'codex-auto-review'},registry).provider,'native');
  assert.equal(resolveRoute({model:'gpt-6-astra'},registry).provider,'native');
  assert.equal(resolveRoute({model:GROK_ID},registry).provider,'grok');
  assert.equal(resolveRoute({model:'grok-4.6'},registry).effort,'medium');
  assert.throws(()=>resolveRoute({model:'switchboard-unknown'},registry),/not been applied/);
  assert.throws(()=>resolveRoute({model:'switchboard-devin-astra',reasoning:{effort:'ultra'}},registry),/reasoning/);
  assert.equal(resolveRoute({model:GROK_ID,reasoning:{effort:'high'}},registry).effort,'high');
  assert.throws(()=>resolveRoute({model:GROK_ID,reasoning:{effort:'max'}},registry),/reasoning/);
  const legacySelection=structuredClone(registry);legacySelection.selection={id:GROK_ID,effort:null};
  assert.equal(resolveRoute({model:'switchboard-selected'},legacySelection).effort,'medium');
  const snapshot=resolveRoute({model:'switchboard-selected'},registry);registry.selection.effort='high';assert.equal(snapshot.effort,'medium');assert.ok(Object.isFrozen(snapshot));
});
test('new compatible discovery reaches registry, routing and catalog without an ID edit',()=>{
  let registry=fixtureRegistry();
  const rows=[{selector:'swe-2-high',label:'Future coding model',capabilities:{tools:true}}];
  const models=normalizeDiscovery('devin',rows,{scope:'devin-a',now:200});
  const future=models[0];assert.equal(future.id,stableSlug('devin',rows[0].selector));assert.equal(future.capabilities.images,true);assert.equal(future.capabilities.contextWindow,null);assert.equal(future.capabilities.efforts,null);
  registry=mergeDiscovery(registry,'devin',models,'devin-a',200);
  assert.equal(registry.models.find(m=>m.id===future.id).enabled,false);
  assert.throws(()=>selectTarget(registry,future.id,null),/Apply/);
  registry.models.find(m=>m.id===future.id).enabled=true;
  registry.appliedModels=structuredClone(registry.models);
  registry=selectTarget(registry,future.id,null);
  assert.equal(resolveRoute({model:'switchboard-selected'},registry).selector,rows[0].selector);
  const native={models:[{slug:'native-model',visibility:'list',supported_in_api:false,context_window:99999,custom_metadata:{keep:true}}]};
  const catalog=combinedCatalog(native,registry);
  assert.deepEqual(catalog.models[0],native.models[0]);assert.equal(catalog.models.find(m=>m.slug===future.id).visibility,'list');assert.equal(catalog.models.find(m=>m.slug===future.id).context_window,32768);
});
test('discovery keeps preferences, does not stage unchanged metadata and never falls back after account removal',()=>{
  let registry=fixtureRegistry();
  registry.models=registry.models.map(m=>({...m,wasApplied:true}));
  const rows=['low','medium','high','xhigh','max'].map(e=>({selector:`gpt-6-astra-${e}`}));
  const revision=registry.revision;
  registry=mergeDiscovery(registry,'devin',normalizeDiscovery('devin',rows,{scope:'devin-a',now:200}),'devin-a',200);
  assert.equal(registry.revision,revision);
  registry.models.find(m=>m.id==='switchboard-devin-astra').enabled=false;
  registry=mergeDiscovery(registry,'devin',normalizeDiscovery('devin',rows,{scope:'devin-a',now:300}),'devin-a',300);
  assert.equal(registry.models.find(m=>m.id==='switchboard-devin-astra').enabled,false);
  const before=structuredClone(registry);
  assert.throws(()=>normalizeDiscovery('devin',[],{scope:'devin-a'}));assert.deepEqual(registry,before);
  registry=invalidateScope(registry,'devin','devin-b');assert.throws(()=>resolveRoute({model:'switchboard-devin-astra'},registry),/not available/);
  registry=mergeDiscovery(registry,'devin',normalizeDiscovery('devin',[{selector:'new-family'}],{scope:'devin-b'}),'devin-b');
  assert.throws(()=>resolveRoute({model:'switchboard-devin-astra'},registry),/not available/);
  assert.equal(resolveRoute({model:GROK_ID},registry).provider,'grok');
  assert.equal(resolveRoute({model:'grok-4.6'},registry).effort,'medium');
});
test('unknown Grok protocol stays discovered but not enableable, parser rejects partial/error output',()=>{
  const model=normalizeDiscovery('grok',[{id:'grok-future'}],{scope:'g'})[0];assert.equal(model.compatible,false);assert.equal(model.capabilities.tools,null);
  assert.deepEqual(parseGrokModels('Available models:\n- grok-4.5\n','0.2.111'),[{id:'grok-4.5'}]);
  assert.throws(()=>parseGrokModels('Failed to fetch models: grok-4.5','0.2.111'));
  assert.throws(()=>parseGrokModels('grok-4.5\npartial metadata','0.2.111'));
  assert.throws(()=>parseGrokModels('grok-4.5','1.0.0'));
});

test('Grok 4.5 subscription vision stays disabled even if discovery advertises it',()=>{
  const models=normalizeDiscovery('grok',[{id:'grok-4.5',capabilities:{images:true,tools:true}},{id:'grok-4.6'}],{scope:'g'});
  assert.equal(models[0].capabilities.images,false);
  assert.equal(models[0].capabilities.tools,true);
  assert.equal(models[1].capabilities.images,true);
  const registry=fixtureRegistry();
  const catalog=combinedCatalog({models:[{slug:'native-model'}]},registry);
  assert.deepEqual(catalog.models.find(m=>m.slug===GROK_ID).input_modalities,['text','image']);
  assert.equal(normalizeDiscovery('devin',[{selector:'grok-4-5-high'}],{scope:'d'})[0].compatible,false);
  assert.equal(models[0].compatible,false);assert.equal(models[0].enabled,false);
  const retired={...models[0],compatible:true,enabled:true};
  registry.models.push(retired);registry.appliedModels.push(retired);
  assert.throws(()=>resolveRoute({model:retired.id},registry),/no longer supported/);
});


test('user-retired Devin families cannot reappear or route through stale catalogs',()=>{
  const retired=[...['sol','terra','luna'].flatMap(model=>['none','low','medium','high','xhigh','max'].map(e=>`gpt-5-6-${model}-${e}-priority`)),'glm-5-2-1m','glm-5-3-flash-high','kimi-k3-high','kimi-k2-7','swe-1-6-fast','gemini-3-5-flash-high','gemini-3-6-flash-low','gemini-3-7-flash-medium','MODEL_GOOGLE_GEMINI_3_0_FLASH_HIGH','MODEL_GPT_5_2_HIGH','MODEL_PRIVATE_12','MODEL_PRIVATE_15','MODEL_CHAT_GPT_4_1_2025_04_14'];
  const kept=['gemini-3-8-flash-high','swe-1-7','swe-1-7-lightning','swe-2-high','swe-2-max','gpt-5-6-sol-max','gpt-5-6-terra-high','gpt-5-6-luna-low','grok-4-6-high','deepseek-v4-1-flash-max'];
  retired.push('gemini-3-1-pro-high','gpt-5-3-codex-high','gpt-5-4-mini-high','gpt-6-astra-high-priority','inkling-medium','nemotron-3-ultra-high','deepseek-v4-flash-high','new-family-2027');
  for(const selector of [...retired,...kept]){
    const m=normalizeDiscovery('devin',[{selector}],{scope:'devin-a'})[0];
    assert.equal(m.compatible,!retired.includes(selector),selector);
    if(m.compatible)continue;
    const registry=fixtureRegistry();const stale={...m,compatible:true,enabled:true};registry.models.push(stale);registry.appliedModels.push(stale);
    assert.throws(()=>resolveRoute({model:m.id},registry),e=>e.code==='model_retired');
    assert.throws(()=>resolveRoute({model:selector},registry),e=>e.code==='model_retired');
    registry.selection={id:m.id,effort:null};assert.throws(()=>resolveRoute({model:'switchboard-selected'},registry),e=>e.code==='model_retired');
    registry.models[registry.models.length-1]=m;
    assert.equal(combinedCatalog({models:[{slug:'native-model'}]},registry).models.some(x=>x.slug===m.id),false);
  }
});
