import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Integration, editConfig, parseConfig } from '../gateway/codex/config.mjs';
import { privateDirectory, writeJSON, readProtected, atomicWrite } from '../gateway/core/files.mjs';
const fixture=()=>{const root=mkdtempSync('/private/tmp/switchboard-config-');const home=privateDirectory(join(root,'codex')),data=privateDirectory(join(root,'app'));return {root,home,data,manager:new Integration(data,home)};};
const original='# User comment\nmodel = "gpt-6-astra-medium" # my model\nmodel_provider = "devin_astra"\nmodel_reasoning_effort = "medium"\n[model_providers.devin_astra]\nbase_url = "http://127.0.0.1:4317/openai/v1"\nwire_api = "responses"\n[desktop]\nenabled-reasoning-efforts = [\n  "low", # original effort\n  "medium",\n]\n[projects."/private/work"]\ntrust_level = "trusted"\n';
test('owned TOML edits preserve unrelated settings and comments including multiline arrays',()=>{
  const result=editConfig(original,{model_provider:undefined,openai_base_url:'http://127.0.0.1:9477/codex/v1','desktop.enabled-reasoning-efforts':['low','medium','max']});
  const parsed=parseConfig(result);assert.equal(parsed.model_provider,undefined);assert.equal(parsed.model_providers.devin_astra.base_url,'http://127.0.0.1:4317/openai/v1');assert.ok(result.includes('# User comment'));assert.ok(result.includes('# original effort'));assert.ok(result.includes('# my model'));
  assert.equal(parsed.projects['/private/work'].trust_level,'trusted');
  assert.throws(()=>editConfig('model = [',{model:'x'}),/not valid TOML/);
});
test('explicit migration, compare-before-write conflict resolution and native choice preservation',()=>{
  const f=fixture();try{
    atomicWrite(join(f.home,'config.toml'),original);
    assert.throws(()=>f.manager.install({catalogPath:join(f.data,'models.json'),efforts:['max']}),/migration/);
    f.manager.install({catalogPath:join(f.data,'models.json'),efforts:['max'],migration:true,nativeSlugs:['gpt-5.5'],defaultSelection:{id:'switchboard-devin-astra',effort:'medium'}});
    assert.equal(f.manager.inspect().installed,true);assert.equal(f.manager.inspect().restartRequired,true);
    let text=f.manager.readText().replace('http://127.0.0.1:9477/codex/v1','http://127.0.0.1:9000/v1').replace('model = "switchboard-selected"','model = "gpt-5.5"');atomicWrite(join(f.home,'config.toml'),text);
    assert.deepEqual(f.manager.inspect().conflicts,['openai_base_url']);assert.throws(()=>f.manager.restore(),/openai_base_url/);
    f.manager.restore({resolutions:{openai_base_url:'keep'}});const restored=parseConfig(f.manager.readText());assert.equal(restored.openai_base_url,'http://127.0.0.1:9000/v1');assert.equal(restored.model,'gpt-5.5');assert.equal(restored.model_provider,undefined);assert.equal(restored.model_catalog_json,undefined);assert.equal(restored.projects['/private/work'].trust_level,'trusted');
  }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('sentinel never overwrites real auth and restore removes only an exact owned sentinel',()=>{
  const f=fixture();try{
    atomicWrite(join(f.home,'auth.json'),'{"real":"fixture"}');
    assert.throws(()=>f.manager.install({catalogPath:join(f.data,'models.json'),efforts:[],providerOnly:true}),/overwrite/);
    rmSync(join(f.home,'auth.json'));
    f.manager.install({catalogPath:join(f.data,'models.json'),efforts:[],providerOnly:true});
    assert.equal(JSON.parse(readFileSync(join(f.home,'auth.json'))).OPENAI_API_KEY,'codex-switchboard-local-only');
    atomicWrite(join(f.home,'auth.json'),'{"real":"new login"}');f.manager.restore();assert.equal(JSON.parse(readFileSync(join(f.home,'auth.json'))).real,'new login');
  }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('protected files and configuration refuse file and ancestor symlinks',()=>{
  const f=fixture();try{
    const target=join(f.root,'target');atomicWrite(target,'private fixture');symlinkSync(target,join(f.home,'config.toml'));assert.throws(()=>f.manager.inspect(),/symlink/);assert.throws(()=>atomicWrite(join(f.home,'config.toml'),'bad'),/symlink/);
    symlinkSync(f.home,join(f.root,'linked'));assert.throws(()=>readProtected(join(f.root,'linked','config.toml')),/symlink/);assert.equal(readFileSync(target,'utf8'),'private fixture');
  }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('interrupted config transaction finishes only the exact written revision',()=>{
  const f=fixture();try{
    f.manager.install({catalogPath:join(f.data,'models.json'),efforts:[]});const manifest=f.manager.manifest();writeJSON(f.manager.manifestPath,{...manifest,phase:'installing'});f.manager.recover();assert.equal(f.manager.manifest().phase,'installed');
    writeJSON(f.manager.manifestPath,{...manifest,phase:'installing'});atomicWrite(join(f.home,'config.toml'),f.manager.readText()+'# concurrent edit\n');assert.throws(()=>f.manager.recover(),/interrupted/);
  }finally{rmSync(f.root,{recursive:true,force:true});}
});
test('explicit router migration removes only the recognized hook and restore preserves later unrelated hooks',()=>{
  const f=fixture();try{
    const owned={type:'command',command:"'/private/tmp/subagent-model-router-helper' --config '/private/tmp/router.json' hook codex-pretool",statusMessage:'Selecting subagent route',timeout:10};
    const unrelated={type:'command',command:'/usr/bin/true',statusMessage:'User check'};
    writeJSON(join(f.home,'hooks.json'),{hooks:{PreToolUse:[{matcher:'Agent',hooks:[owned,unrelated]}]}});
    assert.throws(()=>f.manager.install({catalogPath:join(f.data,'models.json'),efforts:[]}),/migration/);
    f.manager.install({catalogPath:join(f.data,'models.json'),efforts:[],migration:true});
    const after=JSON.parse(readFileSync(join(f.home,'hooks.json')));assert.deepEqual(after.hooks.PreToolUse[0].hooks,[unrelated]);
    after.hooks.PostToolUse=[{hooks:[{type:'command',command:'/usr/bin/false'}]}];writeJSON(join(f.home,'hooks.json'),after);
    f.manager.restore();const restored=JSON.parse(readFileSync(join(f.home,'hooks.json')));assert.equal(restored.hooks.PreToolUse[0].hooks.length,2);assert.equal(restored.hooks.PostToolUse[0].hooks[0].command,'/usr/bin/false');
  }finally{rmSync(f.root,{recursive:true,force:true});}
});
