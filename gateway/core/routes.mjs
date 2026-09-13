import { isRetiredModel } from './registry.mjs';
import { BoardError } from './errors.mjs';

export function resolveRoute(body, registry) {
  const slug = body?.model;
  if (slug != null && (typeof slug !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/.test(slug))) throw new BoardError('invalid_model','The model identity is invalid.');
  // The native reviewer is never rewritten, even when the menu selects external.
  if (slug === 'codex-auto-review') return Object.freeze({ provider: 'native', model: slug, reviewer: true });
  const legacy = !registry.nativeSlugs?.includes(slug) && registry.appliedModels?.find(m => Object.values(m.selectors).includes(slug));
  if ((typeof slug !== 'string' || !slug.startsWith('switchboard-')) && !legacy) return Object.freeze({ provider: 'native', model: typeof slug === 'string' ? slug : null });
  const selected = slug === 'switchboard-selected';
  const id = selected ? registry.selection?.id : legacy?.id ?? slug;
  const applied = registry.appliedModels?.find(m => m.id === id);
  if (!applied) throw new BoardError('unknown_external_model', 'This Switchboard model has not been applied. Open Manage → Models.', 400);
  if (isRetiredModel(applied.provider,applied.upstream) || Object.values(applied.selectors).some(s=>isRetiredModel(applied.provider,s))) throw new BoardError('model_retired', applied.provider === 'grok' ? 'Grok 4.5 is no longer supported. Choose Grok 4.6. No fallback was used.' : 'This Devin model is no longer supported. Choose a supported model. No fallback was used.');
  const current = registry.models.find(m => m.id === id);
  if (!current?.compatible || current.availability !== 'advertised' || registry.providers?.[current.provider]?.scope !== current.scope) throw new BoardError('model_unavailable', 'This model is not available for the current provider connection. Refresh models or reconnect; no fallback was used.', 503);
  if (selected && !current.enabled) throw new BoardError('selection_disabled', 'The selected model is hidden. Choose an enabled model from the menu.');
  let effort = legacy ? Object.entries(legacy.selectors).find(([,selector])=>selector===slug)?.[0] : selected ? registry.selection.effort ?? applied.capabilities.defaultEffort : body.reasoning?.effort ?? body.reasoning_effort ?? applied.capabilities.defaultEffort;
  if (legacy && effort === 'default') effort = applied.capabilities.defaultEffort;
  const efforts = applied.capabilities.efforts;
  if (efforts && !efforts.includes(effort)) throw new BoardError('unsupported_effort', 'This reasoning level is not supported by the selected model.');
  if (!efforts) {
    if (!selected && !legacy && (body.reasoning?.effort != null || body.reasoning_effort != null)) throw new BoardError('unsupported_effort', 'This model uses its upstream default; reasoning controls have not been verified.');
    effort = null;
  }
  const selector = applied.selectors[effort] ?? applied.selectors.default;
  if (!selector || !Object.values(current.selectors).includes(selector)) throw new BoardError('selector_unavailable', 'The selected reasoning variant is no longer advertised. Refresh Models; no fallback was used.', 503);
  return Object.freeze({ provider: current.provider, model: slug, id, selector, effort, images: applied.capabilities.images, revision: registry.appliedRevision });
}
