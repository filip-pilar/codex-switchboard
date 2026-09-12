import { createInterface } from 'node:readline';
import { resolveBridgePaths } from '../core/paths.mjs';
import { privateDirectory } from '../core/files.mjs';
import { safeError } from '../core/errors.mjs';

export function prepareWorkerEnvironment(paths) {
  privateDirectory(paths.devinUpstreamDataDir);
  Object.assign(process.env,{ DEBUG_REQUEST_BODIES:'0',DEVIN_CONNECT_DEBUG_META:'0',DEVIN_CONNECT_DUMP_RAW:'0',DEVIN_CONNECT_WIRE_DUMP:'0',LOG_LEVEL:'error',POLICY_BLOCK_RING:'-1',WINDSURFAPI_DUMP_SYSTEM_PROMPT:'0',WINDSURFAPI_PROTO_TRACE:'0',WINDSURFAPI_PROTO_TRACE_ERROR_STRINGS:'0',WINDSURFAPI_PROTO_TRACE_READ_WRAPPER_STRINGS:'0',WINDSURFAPI_PROTO_TRACE_STRINGS:'0',WINDSURFAPI_TRACE:'0',WINDSURFAPI_VARIANT_FALLBACK_ON_RATE_LIMIT:'0',WINDSURFAPI_SKIP_DOTENV:'1',WINDSURFAPI_NO_OPEN:'1',HOST:'127.0.0.1',PORT:'0',DEFAULT_MODEL:'gpt-6-astra-medium',DEVIN_CONNECT:'1',DEVIN_CONNECT_IMAGE_TAG:'10',DEVIN_CONNECT_AUTO_RELOGIN:'0',DEVIN_CONNECT_LIVENESS_PROBE:'0',REPLICA_ISOLATE:'0',DATA_DIR:paths.devinUpstreamDataDir });
}

export async function runWorker(provider) {
  if (!['devin','grok'].includes(provider)) process.exit(64);
  // Upstream code is private to this process. Only structured replies may leave
  // stdout, and no raw provider logging reaches the app or disk.
  for (const key of ['log','info','warn','error','debug']) console[key]=()=>{};
  const paths=resolveBridgePaths();
  if (provider === 'devin') prepareWorkerEnvironment(paths);
  let server, chain=Promise.resolve();
  const send=value => process.stdout.write(JSON.stringify(value)+'\n');
  const stop=()=>{ server?.closeAllConnections?.(); server?.close(); process.exit(0); };
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
        else if (message.op==='discover') result=await discoverModels(provider,paths);
        else if (message.op==='validateSelector' && provider==='devin') {
          const {resolveConnectSelector}=await import('windsurf-api/src/devin-connect-models.js');
          const mapped=resolveConnectSelector(message.selector);result={exact:mapped.mapped&&mapped.selector===message.selector};
        }
        else if (message.op==='start') {
          if (!server) {
            if (provider==='devin') {
              const {readDevinSessionToken}=await import('../core/devin-credentials.mjs');
              const {startDevinTransport}=await import('../transport/devin.mjs');
              privateDirectory(paths.devinUpstreamDataDir);
              server=await startDevinTransport({port:0,token:readDevinSessionToken(paths.devinCredentialsPath),dataDir:paths.devinUpstreamDataDir,defaultModel:'gpt-6-astra-medium',internalCapability:message.capability});
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
