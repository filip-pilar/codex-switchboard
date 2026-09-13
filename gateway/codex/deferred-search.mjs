import { Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { BoardError } from '../core/errors.mjs';

const NAME = 'switchboard_tool_search';
const LIMIT = 10 * 1024 * 1024;
const invalid = message => new BoardError('invalid_tool_search', message);
function argumentsObject(value) {
  let parsed=value;
  if (typeof parsed === 'string') {
    try { parsed=JSON.parse(parsed || '{}'); } catch { throw invalid('Tool search arguments must be valid JSON.'); }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw invalid('Tool search arguments must be an object.');
  return parsed;
}

// Codex owns discovery, tool loading and execution. Only the model-facing
// declaration and visible call/result history are translated to functions.
export function prepareDevinSearch(body) {
  const input=Array.isArray(body.input) ? body.input : [];
  const declarations=body.tools ?? [];
  const active=declarations.some(t=>t?.type==='tool_search') || input.some(i=>i?.type==='tool_search_call');
  if (!active) return {body,active:false};
  const definitions=new Map();
  function tool(t, namespace='', loaded=false) {
    if (!t || typeof t!=='object') throw invalid('Invalid tool definition.');
    if (t.defer_loading===true && !loaded) return null;
    if (t.type==='namespace') {
      const children=t.tools ?? t.children;
      if (!Array.isArray(children)) throw invalid('Invalid tool namespace.');
      const name=t.name ?? t.namespace;
      const tools=children.map(child=>tool(child,name,loaded)).filter(Boolean);
      if (!tools.length) return null;
      const result={...t,tools};delete result.children;delete result.defer_loading;return result;
    }
    if (t.type==='tool_search') {
      if (t.execution!=='client' || t.parameters?.type!=='object') throw invalid('Tool search requires a client-executed object schema.');
      return {type:'function',name:NAME,description:t.description ?? 'Search for and load tools available to this Codex task.',parameters:t.parameters};
    }
    const result={...t};delete result.defer_loading;
    const name=t.name ?? t.function?.name;
    if (name) {
      const qualified=namespace ? `${namespace.endsWith('__') ? namespace : namespace+'__'}${name}` : name;
      if (qualified===NAME) throw invalid('A tool conflicts with the reserved search adapter name.');
      const signature=JSON.stringify(result);
      if (definitions.has(qualified)) {
        if (definitions.get(qualified)!==signature) throw invalid('Loaded tool definitions conflict.');
        return null;
      }
      definitions.set(qualified,signature);
    }
    return result;
  }
  const tools=declarations.map(t=>tool(t)).filter(Boolean);
  for (const item of input) if (item?.type==='tool_search_output') {
    if (item.execution!=='client' || typeof item.call_id!=='string' || !Array.isArray(item.tools)) throw invalid('Tool search output requires client execution, a call ID and tool definitions.');
    tools.push(...item.tools.map(t=>tool(t,'',true)).filter(Boolean));
  }
  const mapped=input.map(item=>{
    if (!['tool_search_call','tool_search_output'].includes(item?.type)) return item;
    if (item.execution!=='client' || typeof item.call_id!=='string') throw invalid('Tool search history requires client execution and a call ID.');
    return item.type==='tool_search_call'
      ? {type:'function_call',call_id:item.call_id,name:NAME,arguments:JSON.stringify(argumentsObject(item.arguments))}
      : {type:'function_call_output',call_id:item.call_id,output:JSON.stringify({tools:item.tools})};
  });
  const prepared={...body,tools,...(Array.isArray(body.input)?{input:mapped}:{})};
  if (body.tool_choice?.type==='tool_search') {
    if (!tools.some(t=>t.name===NAME)) throw invalid('The selected tool search is not registered.');
    prepared.tool_choice={type:'function',name:NAME};
  }
  return {body:prepared,active:true};
}
export function restoreDevinSearchEvent(event) {
  function item(value) {
    if (value?.type!=='function_call' || value.name!==NAME) return value;
    const restored={...value,type:'tool_search_call',execution:'client',arguments:argumentsObject(value.arguments ?? '{}')};
    delete restored.name;delete restored.namespace;return restored;
  }
  return {...event,...(event.item?{item:item(event.item)}:{}),...(event.response?.output?{response:{...event.response,output:event.response.output.map(item)}}:{}),...(Array.isArray(event.output)?{output:event.output.map(item)}:{})};
}
export function createDevinSearchTransform(sse) {
  const decoder=new StringDecoder('utf8');let pending='';const ids=new Set();
  function record(value) {
    const data=value.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');
    if (!data || data==='[DONE]') return value+'\n\n';
    const event=JSON.parse(data),restored=restoreDevinSearchEvent(event);
    const id=event.item_id ?? event.item?.id ?? event.item?.call_id;
    if (restored.item?.type==='tool_search_call') ids.add(id);
    if (ids.has(id) && ['response.function_call_arguments.delta','response.function_call_arguments.done'].includes(event.type)) return '';
    return 'data: '+JSON.stringify(restored)+'\n\n';
  }
  return new Transform({
    transform(chunk,encoding,callback) {
      try {
        pending+=decoder.write(chunk);
        if (Buffer.byteLength(pending)>LIMIT) throw invalid('Tool search response exceeds the bridge limit.');
        if (sse) {const records=pending.split(/\r?\n\r?\n/);pending=records.pop() ?? '';for(const value of records)this.push(record(value));}
        callback();
      } catch(error) {callback(error);}
    },
    flush(callback) {
      try {pending+=decoder.end();if(pending)this.push(sse?record(pending):JSON.stringify(restoreDevinSearchEvent(JSON.parse(pending))));callback();}
      catch(error){callback(error);}
    },
  });
}
