import { createInterface } from 'node:readline';
import { resolveBridgePaths } from '../core/paths.mjs';
import { safeError } from '../core/errors.mjs';

export async function runWorker(provider) {
  if (!['devin','grok'].includes(provider)) process.exit(64);
  // Upstream code is private to this process. Only structured replies may leave
  // stdout, and no raw provider logging reaches the app or disk.
  for (const key of ['log','info','warn','error','debug']) console[key]=()=>{};
  const paths=resolveBridgePaths();
  let server, chain=Promise.resolve(), devinCatalog;
  const send=value => process.stdout.write(JSON.stringify(value)+'\n');
  const stop=()=>{ server?.closeAllConnections?.(); if(server)server.close(()=>process.exit(0));else process.exit(0); };
  process.once('SIGTERM',stop); process.once('SIGINT',stop);
  const input=createInterface({input:process.stdin,crlfDelay:Infinity});
  input.on('close',stop);
  input.on('line',line=>{
    if (Buffer.byteLength(line)>65536) { stop(); return; }
    chain=chain.then(async()=>{
      let message;
      try {
        message=JSON.parse(line);
        if (typeof message.capability!=='string' || !/^[A-Za-z0-9_-]{16,512}$/.test(message.capability)) throw new Error('invalid_worker_capability');
        process.env.API_KEY=message.capability;
        const { discoverModels,connectionScope,findCLI }=await import('../providers/discovery.mjs');
        let result;
        if (message.op==='scope') result={scope:await connectionScope(provider,paths)};
        else if (message.op==='discover') {
          result=await discoverModels(provider,paths);
          if(provider==='devin')devinCatalog={...result,at:Date.now()};
        }
        else if (message.op==='validateSelector' && provider==='devin') {
          const scope=await connectionScope('devin',paths);
          if(!devinCatalog || devinCatalog.scope!==scope || Date.now()-devinCatalog.at>60000)devinCatalog={...await discoverModels('devin',paths),at:Date.now()};
          result={exact:devinCatalog.models.some(m=>m.compatible&&Object.values(m.selectors).includes(message.selector))};
        }
        else if (message.op==='start') {
          if (!server) {
            if (provider==='devin') {
              const {readDevinSessionToken}=await import('../core/devin-credentials.mjs');
              const {startDevinACPTransport}=await import('../transport/devin-acp.mjs');
              readDevinSessionToken(paths.devinCredentialsPath);
              server=await startDevinACPTransport({port:0,credentialPath:paths.devinCredentialsPath,cliPath:findCLI('devin'),internalCapability:message.capability});
            } else {
              const {readGrokAccessToken,readGrokCLIVersion}=await import('../core/grok-credentials.mjs');
              const {startGrokTransport}=await import('../transport/grok.mjs');
              readGrokAccessToken(paths.grokCredentialsPath);
              const cliPath=findCLI('grok');
              server=await startGrokTransport({port:0,credentialPath:paths.grokCredentialsPath,cliPath,cliVersion:readGrokCLIVersion({cliPath}),internalCapability:message.capability});
            }
          }
          result={port:server.address().port};
        } else throw new Error('unknown_worker_command');
        send({id:message.id,result});
      } catch(error) { send({id:message?.id,error:safeError(error)}); }
    }).catch(()=>stop());
  });
}
