import { BoardError } from '../core/errors.mjs';
import { ASTRA_INSTRUCTIONS } from '../core/registry.mjs';
import { prepareCodexChildRequest } from '../http/codex-child-compat.mjs';

// Bounded, in-memory ownership only. No transcript or image is retained.
export class HistoryOwnership {
  constructor(limit = 4096) { this.entries = new Map(); this.limit = limit; }
  record(id, provider) {
    if (typeof id !== 'string' || id.length > 256) return;
    this.entries.delete(id); this.entries.set(id, provider);
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
  }
  owner(id) { return this.entries.get(id); }
}
const restart = () => new BoardError('new_task_required', 'Start a new task for this provider. The saved private continuation cannot be transferred safely.');
export function normalizeHistory(body, route, ownership) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { body, changed: false };
  let changed = false;
  const output = { ...body };
  const external = route.provider !== 'native';
  if (body.previous_response_id) {
    const owner = ownership.owner(body.previous_response_id);
    // External transports are stateless and require a full visible transcript.
    if (external || owner !== 'native') throw restart();
  }
  const input = body.input;
  if (Array.isArray(input)) {
    const visible = input.filter(item => item && !['reasoning', 'compaction'].includes(item.type));
    output.input = [];
    for (const item of input) {
      if (!item || typeof item !== 'object') { output.input.push(item); continue; }
      const owner = ownership.owner(item.id);
      if (item.type === 'compaction') {
        if (external || owner !== 'native') throw restart();
      }
      if (item.type === 'reasoning') {
        if (external || (owner && owner !== 'native')) {
          if (!visible.length) throw restart();
          changed = true; continue;
        }
        // Unrecognized private reasoning cannot be attributed to native safely.
        if (!owner && item.encrypted_content) throw restart();
      }
      if (external && item.type === 'item_reference') throw restart();
      if (!external && owner && owner !== 'native') {
        // Provider IDs are private metadata; tool call/result IDs remain intact.
        const copy = { ...item }; delete copy.id; output.input.push(copy); changed = true;
      } else output.input.push(item);
    }
  }
  return { body: changed ? output : body, changed };
}
export function prepareExternal(body, route, headers, ownership) {
  let prepared = normalizeHistory(body, route, ownership).body;
  prepared = prepareCodexChildRequest(headers, prepared).body;
  prepared = { ...prepared, model: route.selector };
  delete prepared.reasoning_effort;
  // Astra effort is encoded in the exact upstream selector; sending a second
  // independent effort risks disagreement. Other contracts may expose effort.
  if (route.provider === 'devin') delete prepared.reasoning;
  else if (route.effort) prepared.reasoning = { ...prepared.reasoning, effort: route.effort };
  else delete prepared.reasoning;
  if (route.provider === 'devin' && /^gpt-6-astra-/.test(route.selector) && prepared.instructions !== undefined) prepared.instructions = ASTRA_INSTRUCTIONS;
  const queue = [prepared];
  while (queue.length) {
    const value = queue.pop();
    if (!value || typeof value !== 'object') continue;
    if (value.type === 'input_image' || value.type === 'image_url' || value.type === 'image') {
      const url = typeof value.image_url === 'object' ? value.image_url?.url : value.image_url ?? value.url;
      if (typeof url === 'string' && !url.startsWith('data:')) throw new BoardError('remote_image_unsupported', 'Remote image fetching is unsupported. Attach an inline image.');
      if (route.images !== true) throw new BoardError('vision_unverified', 'Image input has not been verified for this model. Choose Astra for inline images.');
    }
    for (const child of Object.values(value)) if (child && typeof child === 'object') queue.push(child);
  }
  return prepared;
}
