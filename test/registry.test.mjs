import test from 'node:test';
import assert from 'node:assert/strict';
import { initialRegistry, normalizeDiscovery, mergeDiscovery, invalidateScope, selectTarget, stableSlug } from '../gateway/core/registry.mjs';
import { resolveRoute } from '../gateway/core/routes.mjs';
import { combinedCatalog } from '../gateway/codex/catalog.mjs';
import { parseGrokModels } from '../gateway/providers/discovery.mjs';

export function fixtureRegistry() {
  let registry=initialRegistry();
  const astra=['low','medium','high','xhigh','max'].map(e=>({selector:`gpt-6-astra-${e}`,label:`Astra ${e}`}));
  registry=mergeDiscovery(registry,'devin',normalizeDiscovery('devin',astra,{scope:'devin-a',now:100}),'devin-a',100);
  registry=mergeDiscovery(registry,'grok',normalizeDiscovery('grok',[{id:'grok-4.5'}],{scope:'grok-a',now:100}),'grok-a',100);
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
  assert.equal(resolveRoute({model:'switchboard-grok'},registry).provider,'grok');
  assert.throws(()=>resolveRoute({model:'switchboard-unknown'},registry),/not been applied/);
  assert.throws(()=>resolveRoute({model:'switchboard-devin-astra',reasoning:{effort:'ultra'}},registry),/reasoning/);
  assert.throws(()=>resolveRoute({model:'switchboard-grok',reasoning:{effort:'high'}},registry),/upstream default/);
  const snapshot=resolveRoute({model:'switchboard-selected'},registry);registry.selection.effort='high';assert.equal(snapshot.effort,'medium');assert.ok(Object.isFrozen(snapshot));
});
test('new compatible discovery reaches registry, routing and catalog without an ID edit',()=>{
  let registry=fixtureRegistry();
  const rows=[{selector:'new-coding-family-2027',label:'Future coding model',capabilities:{tools:true}}];
  const models=normalizeDiscovery('devin',rows,{scope:'devin-a',now:200});
  const future=models[0];assert.equal(future.id,stableSlug('devin',rows[0].selector));assert.equal(future.capabilities.images,null);assert.equal(future.capabilities.contextWindow,null);assert.equal(future.capabilities.efforts,null);
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
  assert.equal(resolveRoute({model:'switchboard-grok'},registry).provider,'grok');
});
test('unknown Grok protocol stays discovered but not enableable, parser rejects partial/error output',()=>{
  const model=normalizeDiscovery('grok',[{id:'grok-future'}],{scope:'g'})[0];assert.equal(model.compatible,false);assert.equal(model.capabilities.tools,null);
  assert.deepEqual(parseGrokModels('Available models:\n- grok-4.5\n','0.2.111'),[{id:'grok-4.5'}]);
  assert.throws(()=>parseGrokModels('Failed to fetch models: grok-4.5','0.2.111'));
  assert.throws(()=>parseGrokModels('grok-4.5\npartial metadata','0.2.111'));
  assert.throws(()=>parseGrokModels('grok-4.5','1.0.0'));
});
