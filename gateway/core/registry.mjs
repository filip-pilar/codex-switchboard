import { createHash } from 'node:crypto';
import { BoardError } from './errors.mjs';

export const ASTRA_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const ASTRA_INSTRUCTIONS = "You are a helpful coding assistant. Inspect the workspace with the available tools, make requested edits with the available patch tool, run relevant checks, and finish the requested task before responding. Follow the user's instructions.";
export const stableSlug = (provider, upstream) => `switchboard-${provider}-${createHash('sha256').update(upstream).digest('hex').slice(0, 20)}`;
export function scopeForToken(token) {
  let identity=token;
  try { const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url')); if(typeof claims.sub==='string' && typeof claims.iss==='string') identity=JSON.stringify([claims.iss,claims.sub,claims.organization_id??claims.workspace_id??null]); } catch {}
  return createHash('sha256').update('switchboard-account-scope\0').update(identity).digest('hex');
}
const safeID = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/.test(value);
const unknownCapabilities = { contextWindow: null, images: null, tools: null, efforts: null, defaultEffort: null };

export function normalizeDiscovery(provider, rows, { scope, version = 'unknown', now = Date.now() } = {}) {
  if (!['devin', 'grok'].includes(provider) || !Array.isArray(rows) || rows.length === 0 || rows.length > 2000) throw new BoardError('invalid_discovery', 'Model discovery returned an incomplete or unsupported catalog.');
  const normalized = [];
  const astraRows = [];
  const seen = new Set();
  for (const row of rows) {
    const upstream = row.selector ?? row.id;
    if (!safeID(upstream) || seen.has(upstream)) throw new BoardError('invalid_discovery', 'Model discovery contained invalid or duplicate identities.');
    seen.add(upstream);
    // The initial app deliberately has no Claude integration.
    if (/claude|anthropic|opus|sonnet|haiku/i.test(upstream) || row.provider === 'anthropic') continue;
    if (provider === 'devin' && /^gpt-6-astra-(low|medium|high|xhigh|max)$/.test(upstream)) { astraRows.push(row); continue; }
    const knownGrok = provider === 'grok' && upstream === 'grok-4.5';
    const supplied = row.capabilities ?? {};
    // Reviewed adapter contract: Devin Connect has a shared text/tool wire
    // format. Its exact discovered selectors enter the pinned live allow-list.
    // Grok only has a reviewed contract for 4.5; new protocols stay disabled.
    const compatible = provider === 'devin' || knownGrok || (row.protocol === 'responses' && supplied.tools === true);
    const capabilities = {
      ...unknownCapabilities,
      contextWindow: Number.isInteger(supplied.contextWindow) && supplied.contextWindow >= 4096 ? supplied.contextWindow : null,
      images: typeof supplied.images === 'boolean' ? supplied.images : null,
      tools: typeof supplied.tools === 'boolean' ? supplied.tools : compatible ? true : null,
      efforts: Array.isArray(supplied.efforts) && supplied.efforts.length && supplied.efforts.every(e => ASTRA_EFFORTS.includes(e) || e === 'none' || e === 'minimal') ? [...new Set(supplied.efforts)] : null,
      defaultEffort: null,
    };
    if (capabilities.efforts?.includes(supplied.defaultEffort)) capabilities.defaultEffort = supplied.defaultEffort;
    // A supplied effort list without a valid default is not a complete contract.
    if (capabilities.efforts && !capabilities.defaultEffort) capabilities.efforts = null;
    normalized.push({ id: knownGrok ? 'switchboard-grok' : stableSlug(provider, upstream), provider, upstream, name: knownGrok ? 'Grok · xAI' : `${String(row.label ?? row.name ?? upstream).slice(0, 120)} · ${provider === 'devin' ? 'Devin' : 'xAI'}`, selectors: { default: upstream }, capabilities, compatible, compatibilityReason: compatible ? 'Reviewed text and coding-tool transport' : 'Requires adapter update: coding-tool transport is not established', availability: 'advertised', enabled: knownGrok, scope, source: provider === 'devin' ? 'GetCliModelConfigs + reviewed Connect transport' : 'Official Grok CLI models', version, refreshedAt: now, evidence: { liveVerified: false, note: 'Availability is advertised; inference entitlement is checked by the provider.' } });
  }
  if (astraRows.length) {
    const selectors = Object.fromEntries(astraRows.map(r => [r.selector.split('-').at(-1), r.selector]));
    const efforts = ASTRA_EFFORTS.filter(e => selectors[e]);
    normalized.unshift({ id: 'switchboard-devin-astra', provider, upstream: 'gpt-6-astra', name: 'Astra · Devin', selectors, capabilities: { contextWindow: null, images: true, tools: true, efforts, defaultEffort: efforts.includes('medium') ? 'medium' : efforts[0] }, compatible: true, compatibilityReason: 'Reviewed Astra selector mapping and Connect image tag 10', availability: 'advertised', enabled: true, scope, source: 'GetCliModelConfigs + pinned Astra overlay', version, refreshedAt: now, evidence: { liveVerified: false, inheritedVerifiedEfforts: ['low', 'medium'], note: 'Low and Medium have prior source evidence. Other efforts are provider-advertised; this app has not live-verified them.' } });
  }
  return normalized;
}

export function mergeDiscovery(registry, provider, discovered, scope, now = Date.now()) {
  if (!Array.isArray(discovered)) throw new BoardError('invalid_discovery', 'The discovery result is not complete.');
  const previous = registry.models ?? [];
  const current = new Map(discovered.map(m => [m.id, m]));
  const result = previous.map(old => {
    if (old.provider !== provider) return old;
    const fresh = current.get(old.id);
    current.delete(old.id);
    return fresh ? { ...fresh, enabled: old.enabled, firstSeenAt: old.firstSeenAt ?? old.refreshedAt, wasApplied: old.wasApplied ?? false } : { ...old, availability: 'unavailable', scope, refreshedAt: now };
  });
  result.push(...[...current.values()].map(m => ({ ...m, firstSeenAt: now, wasApplied: false })));
  const picker = models => JSON.stringify(models.filter(m => m.enabled || m.wasApplied).map(m => ({id:m.id,name:m.name,enabled:m.enabled,compatible:m.compatible,capabilities:m.capabilities,selectors:m.selectors})));
  const changed = picker(previous) !== picker(result);
  return { ...registry, revision: (registry.revision ?? 0) + (changed ? 1 : 0), models: result, providers: { ...registry.providers, [provider]: { scope, refreshedAt: now, error: null, retryAfter: 0, status: 'connected' } } };
}

export function invalidateScope(registry, provider, scope) {
  if (registry.providers?.[provider]?.scope === scope) return registry;
  return { ...registry, models: registry.models.map(m => m.provider === provider ? { ...m, availability: 'needs_refresh' } : m), providers: { ...registry.providers, [provider]: { ...registry.providers?.[provider], scope, status: 'needs_refresh' } } };
}
export function enabledTargets(registry) {
  const applied = new Set(registry.appliedModels?.map(m => m.id) ?? []);
  return registry.models.filter(m => m.enabled && m.compatible && m.availability === 'advertised' && applied.has(m.id));
}
export function selectTarget(registry, id, effort) {
  const model = enabledTargets(registry).find(m => m.id === id);
  if (!model) throw new BoardError('target_not_applied', 'Apply the catalog before selecting this connected model.');
  const choices = model.capabilities.efforts;
  if (choices ? !choices.includes(effort) : effort !== null && effort !== undefined && effort !== '') throw new BoardError('unsupported_effort', 'Choose a reasoning level supported by this model.');
  return { ...registry, selection: { id, effort: choices ? effort : null } };
}
export function initialRegistry() { return { version: 1, revision: 0, appliedRevision: null, models: [], appliedModels: [], providers: {}, selection: null }; }
