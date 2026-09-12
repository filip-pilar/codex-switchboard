import { removeLegacyHooks, restoreLegacyHooks, hookConflicts } from './migration.mjs';
import { parse } from 'smol-toml';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';
import { atomicWrite, readProtected, readJSON, writeJSON, checkPath, privateDirectory } from '../core/files.mjs';
import { BoardError } from '../core/errors.mjs';
import { SENTINEL } from './proxy.mjs';

export const OWNED_KEYS = ['model','model_reasoning_effort','model_provider','openai_base_url','model_catalog_json','desktop.enabled-reasoning-efforts','cli_auth_credentials_store'];
const valueAt = (object, key) => key.split('.').reduce((value, part) => value?.[part], object);
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const digest = text => createHash('sha256').update(text).digest('hex');
export function parseConfig(text) {
  try { return parse(text); } catch { throw new BoardError('invalid_toml', 'Codex config.toml is not valid TOML. Resolve it before applying setup.'); }
}
function statements(text) {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const result = []; let offset = 0, section = '';
  for (let i=0;i<lines.length;i++) {
    const start = offset, line = lines[i]; offset += line.length;
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    let source = line;
    while (true) {
      try { parse(source); break; } catch {
        if (++i >= lines.length) throw new BoardError('unsupported_toml_layout', 'A config assignment cannot be edited without rewriting unrelated settings.');
        source += lines[i]; offset += lines[i].length;
      }
    }
    if (source.trimStart().startsWith('[')) { section = source; result.push({ start, end:offset, source, header:true, section }); }
    else result.push({ start,end:offset,source,section, values:parse(section + source) });
  }
  return result;
}
function withoutOwned(document, keys) {
  const result = structuredClone(document);
  for (const key of keys) {
    const parts = key.split('.'); const last = parts.pop(); let object = result;
    for (const part of parts) object = object?.[part];
    if (object) delete object[last];
  }
  if (result.desktop && !Object.keys(result.desktop).length) delete result.desktop;
  return result;
}
function commentSuffix(source) {
  // Retain trailing comments and comment-only lines from owned assignments.
  // Multiline strings are rejected for owned scalar keys below.
  const comments = [];
  for (const line of source.split('\n')) {
    let quote = null, escaped = false;
    for (let i=0;i<line.length;i++) {
      const c=line[i];
      if (escaped) { escaped=false; continue; }
      if (quote === '"' && c === '\\') { escaped=true; continue; }
      if (quote) { if (c===quote) quote=null; continue; }
      if (c==='"' || c==="'") { quote=c; continue; }
      if (c==='#') { comments.push(line.slice(i)); break; }
    }
  }
  return comments.length ? comments.join('\n') + '\n' : '';
}
export function editConfig(text, changes) {
  const original = parseConfig(text), parts = statements(text), replacements = [], append = [];
  for (const [key,value] of Object.entries(changes)) {
    if (!OWNED_KEYS.includes(key)) throw new Error('unowned_config_key');
    const present = valueAt(original,key) !== undefined;
    const found = parts.filter(p => !p.header && valueAt(p.values,key) !== undefined);
    if (found.length > 1 || (present && found.length !== 1)) throw new BoardError('unsupported_toml_layout', `Cannot safely locate owned key ${key}.`);
    const statement = found[0];
    if (statement) {
      if (Object.keys(withoutOwned(statement.values,[key])).length) throw new BoardError('unsupported_toml_layout', `The inline assignment for ${key} also contains unrelated settings. Expand it before setup.`);
      if (statement.source.includes('"""') || statement.source.includes("'''")) throw new BoardError('unsupported_toml_layout', `Use a single-line value for ${key} before setup.`);
      const lhs = statement.source.slice(0, statement.source.indexOf('=')).trim();
      const ending = statement.source.endsWith('\n') ? '\n' : '';
      replacements.push({ ...statement, replacement:commentSuffix(statement.source) + (value === undefined ? '' : `${lhs} = ${JSON.stringify(value)}${ending || '\n'}`) });
    } else if (value !== undefined) {
      if (key === 'desktop.enabled-reasoning-efforts') {
        const table = parts.find(p => p.header && /^\s*\[\s*(?:desktop|"desktop"|'desktop')\s*\]/.test(p.source));
        if (table) { replacements.push({ start:table.end,end:table.end,replacement:`enabled-reasoning-efforts = ${JSON.stringify(value)}\n` }); continue; }
      }
      append.push(`${key} = ${JSON.stringify(value)}\n`);
    }
  }
  if (append.length) { const firstTable = parts.find(p => p.header)?.start ?? text.length; replacements.push({ start:firstTable,end:firstTable,replacement:(firstTable > 0 && text[firstTable-1] !== '\n' ? '\n' : '') + append.join('') }); }
  let result=text;
  for (const replacement of replacements.sort((a,b) => b.start-a.start || b.end-a.end)) result=result.slice(0,replacement.start)+replacement.replacement+result.slice(replacement.end);
  const parsed=parseConfig(result);
  for (const [key,value] of Object.entries(changes)) if (!equal(valueAt(parsed,key),value)) throw new BoardError('config_verification_failed', `Config key ${key} did not validate.`);
  if (!equal(withoutOwned(original,Object.keys(changes)),withoutOwned(parsed,Object.keys(changes)))) throw new BoardError('config_verification_failed', 'An unrelated setting would change. Setup was stopped.');
  return result;
}
export function integrationConflicts(text) {
  const config=parseConfig(text), reasons=[];
  if (config.model_provider && config.model_provider !== 'openai') reasons.push(`model_provider: ${String(config.model_provider).slice(0,100)}`);
  if (config.openai_base_url && config.openai_base_url !== 'http://127.0.0.1:9477/codex/v1') reasons.push('An existing OpenAI base URL is configured');
  if (config.model_catalog_json) reasons.push('An existing model catalog is configured');
  return reasons;
}
export class Integration {
  constructor(dataDir, codexHome) {
    this.dataDir=dataDir; this.codexHome=codexHome; this.configPath=join(codexHome,'config.toml'); this.hooksPath=join(codexHome,'hooks.json'); this.manifestPath=join(dataDir,'install-state.json');
  }
  readText() { return readProtected(this.configPath,{optional:true})?.toString('utf8') ?? ''; }
  readHooks() { return readProtected(this.hooksPath,{optional:true,limit:1024*1024})?.toString('utf8') ?? ''; }
  manifest() { return readJSON(this.manifestPath,null); }
  inspect() {
    const text=this.readText(), manifest=this.manifest();
    const owned=manifest && ['installed','installing','restoring'].includes(manifest.phase);
    return { installed:!!owned, interrupted:owned && manifest.phase!=='installed', restartRequired:manifest?.restartRequired === true, transaction:manifest?.transaction ?? null, conflicts:owned ? this.restoreConflicts(text,manifest) : [...integrationConflicts(text), ...(removeLegacyHooks(this.readHooks()).removed.length ? ['Legacy router PreToolUse hook'] : [])], codexHome:this.codexHome, nativeCredentialStore:parseConfig(text).cli_auth_credentials_store ?? 'default', recovered:manifest?.recovered ?? false };
  }
  recover() {
    const manifest=this.manifest();
    if (!manifest || !['installing','restoring'].includes(manifest.phase)) return;
    const text=this.readText();
    // Only recover the precise interrupted state; never roll back someone else's edit.
    if (digest(text) === manifest.afterHash) {
      if (manifest.phase==='restoring' && manifest.sentinelOwned) this.removeSentinel();
      if (manifest.hookTransaction) { const hooks=this.readHooks(); if (digest(hooks)===manifest.hookTransaction.beforeHash) atomicWrite(this.hooksPath,manifest.hookTransaction.afterText); else if (digest(hooks)!==manifest.hookTransaction.afterHash) throw new BoardError('interrupted_transaction_conflict','Codex hooks changed during an interrupted operation. Review the hooks before recovering.'); }
      writeJSON(this.manifestPath,{ ...manifest, phase:manifest.phase === 'installing' ? 'installed' : 'restored', recovered:true });
    } else if (digest(text) === manifest.beforeHash) {
      if (manifest.phase==='installing' && manifest.sentinelOwned && !manifest.previousManifest?.sentinelOwned) this.removeSentinel();
      if (manifest.hookTransaction) { const hooks=this.readHooks(); if (digest(hooks)===manifest.hookTransaction.afterHash) atomicWrite(this.hooksPath,manifest.hookTransaction.beforeText); else if (digest(hooks)!==manifest.hookTransaction.beforeHash) throw new BoardError('interrupted_transaction_conflict','Codex hooks changed during an interrupted operation.'); }
      if (manifest.previousManifest) writeJSON(this.manifestPath,manifest.previousManifest);
      else writeJSON(this.manifestPath,{ ...manifest, phase:'restored', recovered:true });
    } else throw new BoardError('interrupted_transaction_conflict', 'Codex configuration changed during an interrupted operation. Restore from Setup after reviewing conflicts.');
  }
  install({ catalogPath, defaultSelection, efforts, migration = false, providerOnly = false, nativeFileStorage = false, nativeSlugs = [], transaction = randomUUID() }) {
    this.recover();
    const text=this.readText(), parsed=parseConfig(text), prior=this.manifest();
    const installed=prior?.phase === 'installed';
    const originalHooks=this.readHooks(), migrationHooks=removeLegacyHooks(originalHooks);
    const conflicts=installed ? this.restoreConflicts(text,prior) : [...integrationConflicts(text), ...(migrationHooks.removed.length ? ['Legacy router PreToolUse hook'] : [])];
    if (conflicts.length && (!migration || installed)) throw new BoardError('configuration_conflict', conflicts.join('; ') + '. Review the explicit migration/restore action in Setup.');
    const enabledEfforts=[...new Set([...(parsed.desktop?.['enabled-reasoning-efforts'] ?? ['low','medium','high','xhigh']), ...efforts])];
    if (!enabledEfforts.every(e => typeof e === 'string')) throw new BoardError('invalid_toml', 'The desktop reasoning list must contain strings.');
    const changes={ model_provider:undefined, openai_base_url:'http://127.0.0.1:9477/codex/v1', model_catalog_json:catalogPath, 'desktop.enabled-reasoning-efforts':enabledEfforts };
    if (!installed && defaultSelection) { changes.model='switchboard-selected'; changes.model_reasoning_effort=defaultSelection.effort ?? undefined; }
    if (nativeFileStorage || providerOnly) changes.cli_auth_credentials_store='file';
    const next=editConfig(text,changes);
    const backup=join(privateDirectory(join(this.dataDir,'backups')),`${transaction}.config.toml`);
    atomicWrite(backup,text);
    const original=installed ? prior.original : Object.fromEntries(OWNED_KEYS.map(key => [key,{ present:valueAt(parsed,key) !== undefined, value:valueAt(parsed,key) ?? null }]));
    const nextParsed=parseConfig(next);
    const applied=Object.fromEntries(OWNED_KEYS.map(key => [key,{ present:valueAt(nextParsed,key) !== undefined, value:valueAt(nextParsed,key) ?? null }]));
    let sentinelOwned=installed && prior.sentinelOwned;
    const authPath=join(this.codexHome,'auth.json');
    if (providerOnly) {
      const existing=readProtected(authPath,{optional:true,limit:1024*1024});
      if (existing) throw new BoardError('auth_already_present', 'Provider-only setup will not overwrite an existing Codex login.');
      // This path is exposed only after the installed-client sentinel fixture passes.
      sentinelOwned=true;
    }
    const hookTransaction=!installed && migrationHooks.removed.length ? {beforeText:originalHooks,afterText:migrationHooks.text,beforeHash:digest(originalHooks),afterHash:digest(migrationHooks.text)} : null;
    const legacyHooks=installed ? prior.legacyHooks : migrationHooks.removed;
    const manifest={ version:1,nativeSlugs,hookTransaction,legacyHooks,phase:'installing',transaction,beforeHash:digest(text),afterHash:digest(next),backup,original,applied,configPath:this.configPath,restartRequired:true,sentinelOwned,previousManifest:installed ? prior : null };
    writeJSON(this.manifestPath,manifest);
    try {
      if (digest(this.readText())!==digest(text) || (hookTransaction && digest(this.readHooks())!==hookTransaction.beforeHash)) throw new BoardError('configuration_conflict','Codex configuration changed while setup was being prepared. No conflicting edit was overwritten.');
      if (hookTransaction) atomicWrite(this.hooksPath,hookTransaction.afterText);
      if (providerOnly) atomicWrite(authPath,JSON.stringify({ OPENAI_API_KEY:SENTINEL })+'\n');
      if (digest(this.readText())!==digest(text)) throw new BoardError('configuration_conflict','Codex configuration changed before setup committed.');
      atomicWrite(this.configPath,next);
      if (!equal(parseConfig(this.readText()),nextParsed)) throw new Error('config_write_failed');
      writeJSON(this.manifestPath,{ ...manifest,phase:'installed',previousManifest:null });
    } catch (error) {
      if (digest(this.readText())===digest(next)) atomicWrite(this.configPath,text);
      if (hookTransaction && digest(this.readHooks())===hookTransaction.afterHash) atomicWrite(this.hooksPath,hookTransaction.beforeText);
      if (providerOnly) this.removeSentinel();
      if (installed) writeJSON(this.manifestPath,prior);
      else writeJSON(this.manifestPath,{ ...manifest,phase:'restored' });
      throw error;
    }
    return this.inspect();
  }
  restoreConflicts(text,manifest) {
    const current=parseConfig(text), conflicts=[];
    for (const key of OWNED_KEYS) {
      const expected=manifest.applied[key];
      const value=valueAt(current,key);
      if (key === 'model' && typeof value === 'string' && !value.startsWith('switchboard-') && value !== expected?.value && manifest.nativeSlugs?.includes(value)) continue;
      if (!equal(value,expected?.present ? expected.value : undefined)) conflicts.push(key);
    }
    if (hookConflicts(this.readHooks(),manifest.legacyHooks)) conflicts.push('hooks.json');
    return conflicts;
  }
  restore({ resolutions = {}, transaction = randomUUID() } = {}) {
    try { this.recover(); } catch (error) { if (error.code!=='interrupted_transaction_conflict') throw error; }
    const manifest=this.manifest();
    if (!manifest || !['installed','installing','restoring'].includes(manifest.phase)) return this.inspect();
    const text=this.readText(), current=parseConfig(text), conflicts=this.restoreConflicts(text,manifest);
    for (const key of conflicts) if (!['keep','restore'].includes(resolutions[key])) throw new BoardError('restore_conflict', `Choose Keep current or Restore original for: ${conflicts.join(', ')}.`);
    const changes={};
    for (const key of OWNED_KEYS) {
      if (resolutions[key] === 'keep') continue;
      if (key === 'model' && typeof current.model === 'string' && !current.model.startsWith('switchboard-') && current.model !== manifest.applied.model?.value && manifest.nativeSlugs?.includes(current.model)) continue;
      const entry=manifest.original[key]; changes[key]=entry.present ? entry.value : undefined;
    }
    const keepsNative=manifest.nativeSlugs?.includes(current.model) && current.model!==manifest.applied.model?.value;
    if(keepsNative && resolutions.model_provider!=='restore' && manifest.original.model_provider?.present && manifest.original.model_provider.value!=='openai') changes.model_provider=undefined;
    const next=editConfig(text,changes);
    const beforeHooks=this.readHooks(),afterHooks=restoreLegacyHooks(beforeHooks,manifest.legacyHooks,{keep:resolutions['hooks.json']==='keep'});
    const hookTransaction=beforeHooks!==afterHooks ? {beforeText:beforeHooks,afterText:afterHooks,beforeHash:digest(beforeHooks),afterHash:digest(afterHooks)} : null;
    writeJSON(this.manifestPath,{ ...manifest,hookTransaction,phase:'restoring',transaction,beforeHash:digest(text),afterHash:digest(next),previousManifest:manifest });
    if (digest(this.readText())!==digest(text) || digest(this.readHooks())!==digest(beforeHooks)) throw new BoardError('restore_conflict','Codex configuration changed while restore was being prepared.');
    if (hookTransaction) atomicWrite(this.hooksPath,afterHooks);
    if (digest(this.readText())!==digest(text)) throw new BoardError('restore_conflict','Codex configuration changed before restore committed.');
    atomicWrite(this.configPath,next);
    if (manifest.sentinelOwned) this.removeSentinel();
    writeJSON(this.manifestPath,{ ...manifest,phase:'restored',transaction,restartRequired:true,previousManifest:null });
    return this.inspect();
  }
  removeSentinel() {
    const path=join(this.codexHome,'auth.json'), value=readProtected(path,{optional:true,limit:1024*1024});
    if (!value) return;
    let parsed; try { parsed=JSON.parse(value); } catch { return; }
    if (Object.keys(parsed).length===1 && parsed.OPENAI_API_KEY===SENTINEL) { checkPath(path,{missing:false}); unlinkSync(path); }
  }
  acknowledgeRestart() { const manifest=this.manifest(); if (manifest) writeJSON(this.manifestPath,{ ...manifest,restartRequired:false }); return this.inspect(); }
}
