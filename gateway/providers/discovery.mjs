import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import {tmpdir} from 'node:os';
import {privateDirectory,atomicWrite,readProtected} from '../core/files.mjs';
import { join } from 'node:path';
import { readDevinSessionToken } from '../core/devin-credentials.mjs';
import { readGrokAccessToken, sanitizeGrokChildEnvironment } from '../core/grok-credentials.mjs';
import { scopeForToken, normalizeDiscovery, isRetiredModel } from '../core/registry.mjs';
import { BoardError } from '../core/errors.mjs';

export function runCLI(executable, args, { env = process.env, timeout = 30000, maxBuffer = 128 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, { encoding: 'utf8', env, timeout, maxBuffer, windowsHide: true }, (error, stdout, stderr) => {
      if (error) { reject(new BoardError('cli_discovery_failed', 'Official CLI discovery did not succeed. Reconnect the provider or retry later.', 503)); return; }
      resolve({ stdout, stderr });
    });
  });
}
export function findCLI(provider, env = process.env) {
  const home = env.HOME;
  const candidates = provider === 'grok' ? [env.GROK_CLI, join(home, '.grok/bin/grok'), join(home, '.local/bin/grok')] : [env.DEVIN_CLI, join(home, '.local/bin/devin')];
  candidates.push(...String(env.PATH ?? '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin').split(':').filter(Boolean).map(p => join(p, provider)));
  return candidates.find(p => p && existsSync(p)) ?? null;
}
export function parseGrokModels(output, version) {
  // Official 0.2 CLI has no JSON flag. Accept only the observed line-oriented
  // model list schema; never extract a model name from an error sentence.
  if (!/^0\.2\.\d+$/.test(version) || Buffer.byteLength(output) > 128 * 1024) throw new BoardError('unsupported_cli_format', 'This Grok CLI model format needs an adapter update.');
  const plain = output.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();
  if (/not authenticated|failed|error|sign in|login/i.test(plain)) throw new BoardError('needs_login', 'Grok needs an official CLI login.', 401);
  const rows = [];
  let defaultModel;
  for (const line of plain.split(/\r?\n/)) {
    const defaultLine = /^Default model: (grok-[a-zA-Z0-9_.-]+)$/.exec(line.trim());
    if (defaultLine) {
      if (defaultModel) throw new BoardError('unsupported_cli_format', 'Grok returned duplicate default model declarations.');
      defaultModel = defaultLine[1]; continue;
    }
    if (line.trim() === 'You are logged in with grok.com.') continue;
    const match = /^\s*(?:[-*•]\s+)?(grok-[a-zA-Z0-9_.-]+)(?:\s+(?:\(default\)|\[default\]))?\s*$/.exec(line);
    if (match) rows.push({ id: match[1] });
    else if (line.trim() && !/^(?:Available models:?|Models:?)$/i.test(line.trim())) throw new BoardError('unsupported_cli_format', 'The Grok CLI returned an unfamiliar catalog format. Cached models are retained.');
  }
  if (!rows.length) throw new BoardError('invalid_discovery', 'Grok did not list any models. Reconnect to check subscription entitlement.');
  if (defaultModel && !rows.some(row => row.id === defaultModel)) throw new BoardError('invalid_discovery', 'Grok default model is absent from its catalog.');
  return rows;
}
// Join exact official model UIDs; never infer an entitlement from a family name.
export function enrichDevinCatalog(rows, catalog) {
  if (!Array.isArray(catalog?.families) || catalog.families.length > 2000) throw new BoardError('invalid_discovery', 'Devin returned unsupported family metadata.');
  const variants = new Map();
  for (const family of catalog.families) {
    if (!Array.isArray(family.variants) || family.variants.length > 2000) throw new BoardError('invalid_discovery', 'Devin returned unsupported variant metadata.');
    for (const variant of family.variants) {
      if (typeof variant.model_uid !== 'string' || variants.has(variant.model_uid)) throw new BoardError('invalid_discovery', 'Devin returned duplicate variant metadata.');
      const uidEffort = /(?:-|_)(none|minimal|low|medium|high|xhigh|max)(?=$|-(?:priority|1m)$)/i.exec(variant.model_uid)?.[1]?.toLowerCase();
      const labelEffort = /\b(None|Minimal|Low|Medium|High|XHigh|Max)(?: Thinking)?$/.exec(variant.label ?? '')?.[1]?.toLowerCase();
      if (uidEffort && labelEffort && uidEffort !== labelEffort) throw new BoardError('invalid_discovery', 'Devin returned conflicting reasoning metadata.');
      const effort = uidEffort ?? labelEffort;
      variants.set(variant.model_uid, {
        ...( /claude|anthropic|opus|sonnet|haiku/i.test(`${family.family_uid} ${family.family_label}`) ? {provider:'anthropic'} : {}),
        capabilities: {
          ...(Number.isInteger(variant.max_context_tokens) ? {contextWindow:variant.max_context_tokens} : {}),
          ...(effort ? {efforts:[effort], defaultEffort:effort} : {}),
        },
      });
    }
  }
  return rows.map(row => {
    const metadata = variants.get(row.selector);
    return metadata ? {...row, ...metadata, capabilities:{...row.capabilities,...metadata.capabilities}} : row;
  });
}
export async function connectionScope(provider, paths) {
  return scopeForToken(provider === 'devin' ? readDevinSessionToken(paths.devinCredentialsPath) : readGrokAccessToken(paths.grokCredentialsPath));
}
export async function discoverModels(provider, paths) {
  if (provider === 'devin') {
    const token = readDevinSessionToken(paths.devinCredentialsPath);
    const cli=findCLI('devin');if(!cli)throw new BoardError('cli_missing','Install the official Devin CLI, then reconnect.');
    const root=privateDirectory(mkdtempSync(join(realpathSync(tmpdir()),'switchboard-devin-discovery-')));
    try {
      const data=privateDirectory(join(root,'data'));privateDirectory(join(data,'devin'));
      atomicWrite(join(data,'devin/credentials.toml'),readProtected(paths.devinCredentialsPath));
      const env={PATH:process.env.PATH,HOME:process.env.HOME,XDG_DATA_HOME:data,XDG_CONFIG_HOME:join(root,'config'),XDG_CACHE_HOME:join(root,'cache'),LOG_LEVEL:'off'};
      const {stdout}=await runCLI(cli,['models','list','--format','json'],{env,timeout:15000,maxBuffer:2*1024*1024});
      const catalog=JSON.parse(stdout);
      if(!Array.isArray(catalog.families))throw new BoardError('invalid_discovery','Devin returned unsupported model metadata.');
      const retained={families:catalog.families.map(f=>({...f,variants:(f.variants??[]).filter(v=>!isRetiredModel('devin',v.model_uid))})).filter(f=>f.variants.length)};
      const rows=retained.families.flatMap(f=>f.variants.map(v=>({selector:v.model_uid,label:v.label})));
      const models=normalizeDiscovery('devin',enrichDevinCatalog(rows,retained),{scope:scopeForToken(token),version:'Official Devin CLI ACP'});
      return {scope:scopeForToken(token),models};
    } finally {rmSync(root,{recursive:true,force:true});}
  }
  const cli = findCLI('grok');
  if (!cli) throw new BoardError('cli_missing', 'Install the official Grok CLI, then reconnect.');
  const env = sanitizeGrokChildEnvironment(process.env);
  const { stdout: versionText } = await runCLI(cli, ['version'], { env, timeout: 5000, maxBuffer: 16384 });
  const version = /^grok\s+(\d+\.\d+\.\d+)(?:\s|$)/i.exec(versionText.trim())?.[1];
  if (!version) throw new BoardError('unsupported_cli_format', 'The configured executable is not a supported official Grok CLI.');
  const { stdout } = await runCLI(cli, ['--no-auto-update', 'models'], { env });
  const token = readGrokAccessToken(paths.grokCredentialsPath);
  return { scope: scopeForToken(token), version, models: normalizeDiscovery(provider, parseGrokModels(stdout, version), { scope: scopeForToken(token), version }) };
}
