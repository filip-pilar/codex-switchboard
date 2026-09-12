import { execFile } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readDevinSessionToken } from '../core/devin-credentials.mjs';
import { readGrokAccessToken, sanitizeGrokChildEnvironment } from '../core/grok-credentials.mjs';
import { scopeForToken, normalizeDiscovery } from '../core/registry.mjs';
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
  for (const line of plain.split(/\r?\n/)) {
    const match = /^\s*(?:[-*•]\s+)?(grok-[a-zA-Z0-9_.-]+)(?:\s+(?:\(default\)|\[default\]))?\s*$/.exec(line);
    if (match) rows.push({ id: match[1] });
    else if (line.trim() && !/^(?:Available models:?|Models:?)$/i.test(line.trim())) throw new BoardError('unsupported_cli_format', 'The Grok CLI returned an unfamiliar catalog format. Cached models are retained.');
  }
  if (!rows.length) throw new BoardError('invalid_discovery', 'Grok did not list any models. Reconnect to check subscription entitlement.');
  return rows;
}
export async function connectionScope(provider, paths) {
  return scopeForToken(provider === 'devin' ? readDevinSessionToken(paths.devinCredentialsPath) : readGrokAccessToken(paths.grokCredentialsPath));
}
export async function discoverModels(provider, paths) {
  if (provider === 'devin') {
    const token = readDevinSessionToken(paths.devinCredentialsPath);
    Object.assign(process.env,{CODEIUM_API_KEY:token,CODEIUM_API_URL:'https://server.codeium.com'});
    const { fetchCatalog, __setCatalogRequestImpl } = await import('windsurf-api/src/devin-connect-catalog.js');
    const { request } = await import('node:https');
    __setCatalogRequestImpl((options, callback) => request(options, response => {
      let bytes = 0;
      response.on('data', chunk => { bytes += chunk.length; if (bytes > 4 * 1024 * 1024) response.destroy(new Error('catalog_size_limit')); });
      callback(response);
    }));
    const rows = await fetchCatalog({ token, signal: AbortSignal.timeout(15000) });
    if (!Array.isArray(rows) || !rows.length) throw new BoardError('invalid_discovery', 'Devin did not return a complete model catalog.');
    const { setLiveCatalogSelectors, resolveConnectSelector } = await import('windsurf-api/src/devin-connect-models.js');
    setLiveCatalogSelectors(rows);
    const models=normalizeDiscovery(provider,rows,{scope:scopeForToken(token),version:'WindsurfAPI 81370f5'});
    for(const model of models){
      if(Object.values(model.selectors).some(selector=>{const resolved=resolveConnectSelector(selector);return !resolved.mapped||resolved.selector!==selector;})){
        model.compatible=false;model.enabled=false;model.compatibilityReason='Requires adapter update: the pinned transport remaps this exact selector.';
      }
    }
    return {scope:scopeForToken(token),models};
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
