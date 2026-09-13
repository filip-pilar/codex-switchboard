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
// Codex collaboration envelopes are visible conversation messages. Only this
// explicit content schema is portable; private reasoning is handled above.
export function normalizeExternalMessage(item) {
  if (!item || typeof item !== 'object') return item;
  if (!item.type && ['user', 'assistant', 'system', 'developer'].includes(item.role)) return { ...item, type: 'message' };
  if (item.type !== 'agent_message') return item;
  if (typeof item.author !== 'string' || !item.author || typeof item.recipient !== 'string' || !item.recipient || !Array.isArray(item.content) || !item.content.length) throw new BoardError('unsupported_agent_message', 'The collaboration message has an unsupported envelope.');
  const content = item.content.map(part => {
    if (part?.type === 'input_text' && typeof part.text === 'string') return { type: 'input_text', text: part.text };
    // This field is the installed Codex collaboration wire's text payload,
    // not a reasoning item's opaque encrypted continuation.
    if (part?.type === 'encrypted_content' && typeof part.encrypted_content === 'string') return { type: 'input_text', text: part.encrypted_content };
    throw new BoardError('unsupported_agent_message', 'The collaboration message has unsupported content.');
  });
  return { type: 'message', role: 'user', content: [{ type: 'input_text', text: `Agent message from ${JSON.stringify(item.author)} to ${JSON.stringify(item.recipient)}:\n` }, ...content] };
}
function preserveDevinToolFormat(tool) {
  if (!tool || typeof tool !== 'object') return tool;
  if (tool.type === 'namespace') {
    const key = Array.isArray(tool.tools) ? 'tools' : Array.isArray(tool.children) ? 'children' : null;
    return key ? { ...tool, [key]: tool[key].map(preserveDevinToolFormat) } : tool;
  }
  if (tool.type !== 'custom' || tool.format?.type !== 'grammar') return tool;
  if (typeof tool.format.definition !== 'string' || !tool.format.definition || typeof tool.format.syntax !== 'string') throw new BoardError('invalid_custom_format', 'Custom-tool grammar requires a syntax and definition.');
  // The pinned Responses converter turns custom tools into string-argument
  // functions but discards format. Preserve the complete grammar as guidance;
  // the original tool description and client-side validation stay intact.
  return { ...tool, description: `${tool.description ?? ''}\nCustom tool input grammar (${tool.format.syntax}):\n${tool.format.definition}` };
}
export function prepareExternal(body, route, headers, ownership) {
  let prepared = normalizeHistory(body, route, ownership).body;
  prepared = prepareCodexChildRequest(headers, prepared).body;
  prepared = { ...prepared, model: route.selector };
  if (route.provider !== 'devin' && Array.isArray(prepared.input)) prepared.input = prepared.input.map(normalizeExternalMessage);
  delete prepared.reasoning_effort;
  // Astra effort is encoded in the exact upstream selector; sending a second
  // independent effort risks disagreement. Other contracts may expose effort.
  if (route.provider === 'devin') {
    delete prepared.reasoning;
    if (Array.isArray(prepared.tools)) prepared.tools = prepared.tools.map(preserveDevinToolFormat);
    if (Array.isArray(prepared.input)) prepared.input = prepared.input.map(item => item?.type === 'tool_search_output' && Array.isArray(item.tools) ? { ...item, tools: item.tools.map(preserveDevinToolFormat) } : item);
  }
  else if (route.effort) prepared.reasoning = { ...prepared.reasoning, effort: route.effort };
  else delete prepared.reasoning;

  const queue = [prepared];
  while (queue.length) {
    const value = queue.pop();
    if (!value || typeof value !== 'object') continue;
    if (value.type === 'input_image' || value.type === 'image_url' || value.type === 'image') {
      // Check the selector as well as catalog metadata: older applied catalogs
      // may still advertise images for this subscription route.
      if (route.provider === 'grok' && route.selector === 'grok-4.5') throw new BoardError('grok_vision_unavailable', 'Grok 4.5 image input is unavailable on this subscription connection: image-reading checks failed. Choose Grok 4.6 for image tasks. No fallback was used.');
      const url = typeof value.image_url === 'object' ? value.image_url?.url : value.image_url ?? value.url;
      if (typeof url === 'string' && !url.startsWith('data:')) throw new BoardError('remote_image_unsupported', 'Remote image fetching is unsupported. Attach an inline image.');
      if (route.images !== true) throw new BoardError('vision_unverified', 'Image input has not been verified for this model. Choose Astra for inline images.');
    }
    for (const child of Object.values(value)) if (child && typeof child === 'object') queue.push(child);
  }
  return prepared;
}
