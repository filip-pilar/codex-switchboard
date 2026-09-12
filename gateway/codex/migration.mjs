import { basename } from 'node:path';
import { BoardError } from '../core/errors.mjs';

function words(command) {
  if (typeof command !== 'string' || command.length > 8192) return [];
  const result=[];let word='',quote=null,escaped=false,started=false;
  for(const c of command){
    if(escaped){word+=c;escaped=false;started=true;continue;}
    if(c==='\\'&&quote!=="'"){escaped=true;continue;}
    if(quote){if(c===quote)quote=null;else word+=c;started=true;continue;}
    if(c==='"'||c==="'"){quote=c;started=true;continue;}
    if(/[;&|`<>\n]/.test(c))return [];
    if(/\s/.test(c)){if(started){result.push(word);word='';started=false;}}
    else{word+=c;started=true;}
  }
  if(quote||escaped)return [];
  if(started)result.push(word);return result;
}
export function isOwnedRouterHook(hook) {
  if(hook?.type!=='command' || hook.statusMessage!=='Selecting subagent route')return false;
  const args=words(hook.command);
  if(args.at(-2)!=='hook'||args.at(-1)!=='codex-pretool')return false;
  const configIndex=args.indexOf('--config');
  if(configIndex<1||args.length!==configIndex+4||!args[configIndex+1].startsWith('/'))return false;
  if(configIndex===1)return basename(args[0])==='subagent-model-router-helper';
  return configIndex===2 && ['node','bun'].includes(basename(args[0])) && /\/subagent-model-router\/dist\/cli\.js$/.test(args[1]);
}
export function parseHooks(text) {
  if(!text)return {hooks:{}};
  try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw new BoardError('invalid_hooks','Codex hooks.json could not be parsed. Restore the prior router integration before migrating.');}
}
export function removeLegacyHooks(text) {
  const document=parseHooks(text),removed=[];
  for(const [event,groups] of Object.entries(document.hooks??{})){
    if(!Array.isArray(groups))continue;
    document.hooks[event]=groups.flatMap(group=>{
      if(!Array.isArray(group?.hooks))return [group];
      const owned=group.hooks.filter(isOwnedRouterHook);
      if(!owned.length)return [group];
      removed.push({event,group:{...group,hooks:owned}});
      const kept=group.hooks.filter(hook=>!isOwnedRouterHook(hook));
      return kept.length?[{...group,hooks:kept}]:[];
    });
  }
  return {text:removed.length?JSON.stringify(document,null,2)+'\n':text,removed};
}
export function hookConflicts(text,removed) {
  if(!removed?.length)return false;
  const document=parseHooks(text),commands=new Map(removed.flatMap(entry=>entry.group.hooks.map(hook=>[hook.command,hook])));
  for(const groups of Object.values(document.hooks??{}))for(const group of Array.isArray(groups)?groups:[])for(const hook of group?.hooks??[])if(commands.has(hook.command)&&JSON.stringify(commands.get(hook.command))!==JSON.stringify(hook))return true;
  return false;
}
export function restoreLegacyHooks(text,removed,{keep=false}={}) {
  if(keep||!removed?.length)return text;
  const document=parseHooks(text);document.hooks??={};
  for(const entry of removed){
    const groups=document.hooks[entry.event]??=[];
    if(!Array.isArray(groups))throw new BoardError('restore_conflict','The legacy hook event changed its structure. Keep current hooks or repair the event before restoring.');
    const metadata=group=>JSON.stringify({...group,hooks:undefined});
    for(const hook of entry.group.hooks){
      // Replace only an exact owned command; preserve every unrelated hook.
      let present=false;
      for(const group of groups){if(!Array.isArray(group?.hooks))continue;const index=group.hooks.findIndex(h=>h.command===hook.command);if(index>=0){group.hooks[index]=hook;present=true;break;}}
      if(present)continue;
      const group=groups.find(g=>metadata(g)===metadata(entry.group));
      if(group)group.hooks.push(hook);else groups.push({...entry.group,hooks:[hook]});
    }
  }
  return JSON.stringify(document,null,2)+'\n';
}
