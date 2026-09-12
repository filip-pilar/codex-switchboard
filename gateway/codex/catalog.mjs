import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readProtected, atomicWrite, privateDirectory } from '../core/files.mjs';
import { runCLI } from '../providers/discovery.mjs';
import { BoardError } from '../core/errors.mjs';
import { ASTRA_INSTRUCTIONS } from '../core/registry.mjs';

export function findCodex(env = process.env) {
  const paths=[env.CODEX_CLI_PATH, '/Applications/ChatGPT.app/Contents/Resources/codex', '/Applications/Codex.app/Contents/Resources/codex', ...String(env.PATH ?? '').split(':').filter(Boolean).map(p => join(p,'codex'))];
  return paths.find(p => p && existsSync(p)) ?? null;
}
export function validateNativeCatalog(value) {
  if (!Array.isArray(value?.models) || !value.models.length || value.models.length > 2000 || value.models.some(m => typeof m.slug !== 'string' || !m.slug || m.slug.startsWith('switchboard-'))) throw new BoardError('native_catalog_missing', 'A valid native Codex catalog is required. Open Codex once or select its compatible CLI in Advanced settings.');
  return { models: value.models.filter(m => !m.slug.startsWith('smr-') && !m.slug.startsWith('router-')).map(m => structuredClone(m)) };
}
export async function nativeCatalog(codexHome, { refresh = false, executable = findCodex() } = {}) {
  const cache=join(codexHome,'models_cache.json');
  if (!refresh) {
    try { return validateNativeCatalog(JSON.parse(readProtected(cache))); } catch {}
  }
  if (!executable) throw new BoardError('codex_cli_missing', 'The Codex runtime could not be found. Open ChatGPT/Codex or choose its CLI in Advanced settings.');
  const scratch=mkdtempSync(join(tmpdir(),'switchboard-native-'));
  privateDirectory(scratch);
  try {
    atomicWrite(join(scratch,'config.toml'),'cli_auth_credentials_store = "file"\n');
    // Only protected auth/cache, never the active generated catalog or config.
    if (refresh) {
      for (const name of ['auth.json','models_cache.json']) {
        const bytes=readProtected(join(codexHome,name),{ optional:true });
        if (bytes) atomicWrite(join(scratch,name),bytes);
      }
    }
    const { stdout }=await runCLI(executable,['debug','models', ...(refresh ? [] : ['--bundled'])],{ env:{ ...process.env,CODEX_HOME:scratch }, timeout:20000,maxBuffer:16*1024*1024 });
    return validateNativeCatalog(JSON.parse(stdout));
  } finally { rmSync(scratch,{recursive:true,force:true}); }
}
export function modelEntry(model, priority, nativeTemplate) {
  const cap=model.capabilities;
  // Conservative local request budget, not a claim about provider capacity.
  // Unknown capacities stay null in the registry and UI.
  const window=cap.contextWindow ?? 32768;
  return {
    slug:model.id, display_name:model.name,
    description:model.id === 'switchboard-selected' ? 'Uses the external model and reasoning chosen in the Switchboard menu on the next request.' : `${model.name}. ${model.evidence?.note ?? 'Provider-advertised; not live-verified in this app.'}`,
    default_reasoning_level:cap.defaultEffort,
    supported_reasoning_levels:(cap.efforts ?? []).map(effort => ({ effort,description:`${effort[0].toUpperCase()+effort.slice(1)} reasoning (provider-advertised)` })),
    shell_type:'unified_exec',visibility:model.enabled ? 'list' : 'hide',supported_in_api:true,priority,
    additional_speed_tiers:[],service_tiers:[],default_service_tier:null,availability_nux:null,upgrade:null,
    base_instructions:model.provider === 'devin' && model.upstream === 'gpt-6-astra' ? ASTRA_INSTRUCTIONS : 'You are a coding assistant. Follow the user and developer instructions, use available tools to complete the task, and preserve approval and sandbox requirements.',
    model_messages:null,include_skills_usage_instructions:true,include_plugin_usage_instructions:true,include_apps_usage_instructions:true,
    supports_reasoning_summary_parameter:false,supports_reasoning_summaries:false,default_reasoning_summary:'none',support_verbosity:false,default_verbosity:null,
    apply_patch_tool_type:'freeform',web_search_tool_type:'text',truncation_policy:{mode:'tokens',limit:10000},supports_parallel_tool_calls:cap.tools === true,
    supports_image_detail_original:cap.images === true,context_window:window,max_context_window:window,auto_compact_token_limit:null,effective_context_window_percent:95,
    experimental_supported_tools:[],input_modalities:cap.images === true ? ['text','image'] : ['text'],supports_search_tool:cap.tools === true,
    // Keep installed-client tool policy. These are not permission overrides.
    ...(nativeTemplate?.tool_mode ? {tool_mode:nativeTemplate.tool_mode} : {}),
    ...(nativeTemplate?.multi_agent_version ? {multi_agent_version:nativeTemplate.multi_agent_version} : {}),
    ...(nativeTemplate?.node_repl_auto_review_required !== undefined ? {node_repl_auto_review_required:nativeTemplate.node_repl_auto_review_required} : {}),
  };
}
export function combinedCatalog(native, registry) {
  const source=validateNativeCatalog(native), template=source.models[0];
  const usable=registry.models.filter(m => m.compatible && (m.enabled || m.wasApplied));
  const entries=usable.map((m,i) => modelEntry(m,100+i,template));
  const enabled=usable.filter(m => m.enabled && m.availability === 'advertised');
  if (enabled.length) entries.unshift(modelEntry({ id:'switchboard-selected',name:'Switchboard selection',provider:'selected',enabled:true,capabilities:{ contextWindow:Math.min(...enabled.map(m => m.capabilities.contextWindow ?? 32768)),images:enabled.some(m => m.capabilities.images === true),tools:true,efforts:null,defaultEffort:null } },99,template));
  const taken = new Set([...source.models, ...entries].map(m=>m.slug));
  for (const model of usable) for (const [effort,selector] of Object.entries(model.selectors)) {
    if (taken.has(selector)) continue;
    const legacy = modelEntry({...model,id:selector,name:`${model.name} (legacy ${effort})`,enabled:false,capabilities:{...model.capabilities,efforts:null,defaultEffort:null}},500+entries.length,template);
    entries.push(legacy); taken.add(selector);
  }
  // Native entries are preserved byte-for-field; visibility is not guessed.
  return { models:[...source.models,...entries] };
}
