import { join, resolve } from 'node:path';
import { unlinkSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { resolveBridgePaths } from '../core/paths.mjs';
import { privateDirectory, readJSON, writeJSON, checkPath } from '../core/files.mjs';
import { BoardError, safeError } from '../core/errors.mjs';
import { initialRegistry, mergeDiscovery, invalidateScope, selectTarget, enabledTargets } from '../core/registry.mjs';
import { Workers } from './workers.mjs';
import { createProxy } from '../codex/proxy.mjs';
import { Integration, parseConfig } from '../codex/config.mjs';
import { combinedCatalog, nativeCatalog, findCodex } from '../codex/catalog.mjs';
import { findCLI } from '../providers/discovery.mjs';

const DAY=24*60*60*1000;
export class Controller {
  constructor({env=process.env,onEvent=()=>{}}={}) {
    this.env=env;this.paths=resolveBridgePaths(env);this.dataDir=privateDirectory(this.paths.bridgeDataDir);this.onEvent=onEvent;
    this.settingsPath=join(this.dataDir,'settings.json');this.registryPath=join(this.dataDir,'gateway-config.json');
    this.settings=readJSON(this.settingsPath,{version:1,codexHome:resolve(env.CODEX_HOME || join(env.HOME,'.codex')),codexCLI:null});
    this.registry=readJSON(this.registryPath,initialRegistry());
    this.integration=new Integration(this.dataDir,this.settings.codexHome);
    this.workers=new Workers({...env,SWITCHBOARD_DATA_DIR:this.dataDir},(provider,status)=>{this.workerStates[provider]=status;this.emit();});
    this.workerStates={};this.refreshes=new Map();this.nativePaused=false;this.server=null;this.gateway='stopped';this.lastRoute=null;this.error=null;
  }
  save(){writeJSON(this.registryPath,this.registry);}
  emit(){this.onEvent({event:'status',status:this.status()});}
  status(){
    let integration;
    try{integration=this.integration.inspect();}catch(error){integration={installed:false,conflicts:[],error:safeError(error)};}
    return {version:1,gateway:this.gateway,error:this.error,port:9477,registry:this.registry,workerStates:this.workerStates,lastRoute:this.lastRoute,integration,settings:this.settings,clis:{codex:this.settings.codexCLI ?? findCodex(this.env),devin:findCLI('devin',this.env),grok:findCLI('grok',this.env)},homeDisagreement:!!(this.env.CODEX_HOME && resolve(this.env.CODEX_HOME)!==this.settings.codexHome),pendingCatalog:this.registry.revision!==this.registry.appliedRevision,nativePaused:this.nativePaused};
  }
  async initialize(){
    try{this.integration.recover();this.recoverApply();if(this.integration.inspect().installed)await this.start();}
    catch(error){this.error=safeError(error);this.gateway='needs_attention';}
    // Discovery never starts inference. Serial provider workers prevent concurrent
    // official CLI refresh of the same identity.
    this.refreshStale().catch(()=>{});
    this.timer=setInterval(()=>this.refreshStale().catch(()=>{}),60*60*1000);this.timer.unref();
    return this.status();
  }
  recoverApply(){
    const pendingPath=join(this.dataDir,'apply-pending.json'),pending=readJSON(pendingPath,null);
    if(!pending)return;
    const manifest=this.integration.manifest();
    if(manifest?.phase==='installed' && manifest.applied.model_catalog_json.value===pending.catalogPath){this.registry=pending.next;this.save();}
    checkPath(pendingPath);unlinkSync(pendingPath);
  }
  async start(){
    if(this.server?.listening)return;
    this.gateway='starting';this.emit();
    const server=createProxy({getRegistry:()=>this.registry,getWorker:(provider,selector)=>this.readyWorker(provider,selector),isNativePaused:()=>this.nativePaused,onRoute:route=>{this.lastRoute=route;this.emit();}});
    try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen({host:'127.0.0.1',port:9477,exclusive:true},resolve);});this.server=server;this.gateway='running';this.error=null;}
    catch(error){this.gateway='needs_attention';this.error=safeError(error);throw error;}
    this.emit();
  }
  async stop(){
    this.workers.stop();
    if(this.server){this.server.closeAllConnections();await new Promise(resolve=>this.server.close(resolve));this.server=null;}
    this.gateway='stopped';this.emit();
  }
  async readyWorker(provider,selector){
    const {scope}=await this.workers.scope(provider);
    if(scope!==this.registry.providers[provider]?.scope){
      this.registry=invalidateScope(this.registry,provider,scope);this.save();
      this.server?.abortProvider(provider);this.workers.pause(provider);this.workers.resume(provider);
      this.refresh(provider).catch(()=>{});
      throw new BoardError('connection_changed','The official CLI identity changed. Models are refreshing for the new connection; retry when ready.',503);
    }
    const worker=await this.workers.start(provider);
    if(provider==='devin' && selector){const check=await worker.request('validateSelector',{selector});if(!check.exact)throw new BoardError('adapter_selector_mismatch','The official CLI does not advertise this exact model selector. Refresh Models or update the adapter; no fallback was used.',503);}
    return worker;
  }
  async refreshStale(){
    await Promise.all(['devin','grok'].map(async provider=>{
      const state=this.registry.providers[provider];
      if(state?.retryAfter>Date.now())return;
      if(state?.refreshedAt && Date.now()-state.refreshedAt<DAY){
        try{const {scope}=await this.workers.scope(provider);if(scope===state.scope)return;}catch{}
      }
      return this.refresh(provider);
    }));
  }
  async refresh(provider){
    if(!['devin','grok'].includes(provider))throw new BoardError('invalid_provider','Unknown provider.');
    if(this.refreshes.has(provider))return this.refreshes.get(provider);
    const job=(async()=>{
      let scopeVerified=false;
      try{
        const {scope}=await this.workers.scope(provider);scopeVerified=true;
        if(this.registry.providers[provider]?.scope && this.registry.providers[provider].scope!==scope){this.server?.abortProvider(provider);this.workers.pause(provider);this.workers.resume(provider);}
        this.registry=invalidateScope(this.registry,provider,scope);this.save();
        const discovered=await this.workers.discover(provider);
        this.registry=mergeDiscovery(this.registry,provider,discovered.models,discovered.scope);this.save();
      }catch(error){
        const safe=safeError(error),previous=this.registry.providers[provider] ?? {};
        this.registry={...this.registry,models:scopeVerified?this.registry.models:this.registry.models.map(m=>m.provider===provider?{...m,availability:'needs_refresh'}:m),providers:{...this.registry.providers,[provider]:{...previous,credentialReady:scopeVerified,error:safe,retryAfter:Date.now()+5*60*1000,status:scopeVerified&&previous.refreshedAt?'refresh_failed':'needs_login'}}};this.save();
      }finally{this.emit();}
      return this.status();
    })();
    this.refreshes.set(provider,job);job.finally(()=>this.refreshes.delete(provider));return job;
  }
  setEnabled(id,enabled){
    const model=this.registry.models.find(m=>m.id===id);
    if(!model)throw new BoardError('unknown_model','The model is not registered.');
    if(enabled && (!model.compatible || model.availability!=='advertised'))throw new BoardError('model_incompatible','This model is unavailable or requires an adapter update.');
    if(typeof enabled!=='boolean')throw new BoardError('invalid_toggle','Invalid model preference.');
    if(model.enabled!==enabled){this.registry={...this.registry,revision:this.registry.revision+1,models:this.registry.models.map(m=>m.id===id?{...m,enabled}:m)};this.save();}
    return this.status();
  }
  async apply(options={}){
    if(options.providerOnly && options.nativeAuthAbsentVerified!==true) throw new BoardError('verify_native_auth_first','The app must verify that no native login exists before provider-only setup.');
    if(this.status().homeDisagreement && !options.confirmHome)throw new BoardError('codex_home_disagreement','The selected Codex home differs from the inherited CLI home. Confirm which home Desktop uses in Advanced settings.');
    await Promise.all([...new Set(this.registry.models.filter(m=>m.enabled).map(m=>m.provider))].map(async provider=>{try{const {scope}=await this.workers.scope(provider);if(scope===this.registry.providers[provider]?.scope)return;}catch{};await this.refresh(provider);}));
    const source=readJSON(join(this.dataDir,'native-models.json'),null) ?? await nativeCatalog(this.settings.codexHome,{executable:this.settings.codexCLI ?? findCodex(this.env)});
    const catalog=combinedCatalog(source,this.registry),revision=this.registry.revision;
    const transaction=randomUUID();
    const catalogPath=join(this.dataDir,`models-${transaction}.json`);
    const next={...this.registry,appliedRevision:revision,nativeSlugs:source.models.map(m=>m.slug),appliedModels:this.registry.models.filter(m=>m.compatible&&(m.enabled||m.wasApplied)).map(m=>({...m,wasApplied:true})),models:this.registry.models.map(m=>m.compatible&&(m.enabled||m.wasApplied)?{...m,wasApplied:true}:m)};
    const targets=enabledTargets(next);
    if(!next.selection){
      const preferred=targets.find(m=>m.id==='switchboard-devin-astra') ?? targets[0];
      next.selection=preferred ? {id:preferred.id,effort:preferred.capabilities.defaultEffort} : null;
    }
    if(!this.integration.inspect().installed && next.selection && !targets.some(m=>m.id===next.selection.id))throw new BoardError('connect_before_migration','The saved menu selection is disconnected. Reconnect it or choose an available model before applying setup.');
    const currentModel=parseConfig(this.integration.readText()).model;
    if(!next.selection && currentModel && !source.models.some(m=>m.slug===currentModel)) throw new BoardError('connect_before_migration','Connect an external provider or choose a native Codex model before migrating the current model selection.');
    writeJSON(catalogPath,catalog);
    const pendingPath=join(this.dataDir,'apply-pending.json');writeJSON(pendingPath,{transaction,catalogPath,next});
    // Bind before altering global configuration; never redirect Codex to an
    // unknown listener or to an app that failed to start.
    await this.start();
    try{
      this.integration.install({catalogPath,defaultSelection:next.selection,efforts:[...new Set(next.appliedModels.flatMap(m=>m.capabilities.efforts??[]))],migration:options.migration===true,providerOnly:options.providerOnly===true,nativeFileStorage:options.nativeFileStorage===true,nativeSlugs:source.models.map(m=>m.slug),transaction});
      this.registry=next;this.save();unlinkSync(pendingPath);
    }catch(error){try{unlinkSync(pendingPath);}catch{};if(!this.integration.inspect().installed)await this.stop();throw error;}
    return this.status();
  }
  async command(message){
    switch(message.op){
      case 'initialize':return this.initialize();
      case 'status':return this.status();
      case 'refresh':if(message.provider)return this.refresh(message.provider);await Promise.all(['devin','grok'].map(p=>this.refresh(p)));return this.status();
      case 'enable':return this.setEnabled(message.id,message.enabled);
      case 'select':this.registry=selectTarget(this.registry,message.id,message.effort);this.save();return this.status();
      case 'apply':return this.apply(message);
      case 'restore':this.integration.restore({resolutions:message.resolutions});await this.stop();return this.status();
      case 'nativeChanged':{ const source=await nativeCatalog(this.settings.codexHome,{refresh:true,executable:this.settings.codexCLI ?? findCodex(this.env)});writeJSON(join(this.dataDir,'native-models.json'),source);this.registry={...this.registry,revision:this.registry.revision+1};this.save();return this.status();}
      case 'acknowledgeRestart':this.integration.acknowledgeRestart();return this.status();
      case 'startPreview':await this.start();return this.status();
      case 'pauseNative':this.nativePaused=true;this.server?.abortProvider('native');return this.status();
      case 'resumeNative':this.nativePaused=false;return this.status();
      case 'beginReconnect':if(!['devin','grok'].includes(message.provider))throw new BoardError('invalid_provider','Unknown provider.');this.server?.abortProvider(message.provider);this.workers.pause(message.provider);this.workerStates[message.provider]='reconnecting';return this.status();
      case 'endReconnect':this.workers.resume(message.provider);delete this.workerStates[message.provider];return this.refresh(message.provider);
      case 'settings':{
        if(this.integration.inspect().installed)throw new BoardError('restore_before_home_change','Restore integration before changing the Codex home or runtime.');
        if(typeof message.codexHome!=='string'||!message.codexHome.startsWith('/'))throw new BoardError('invalid_home','Choose an absolute Codex home path.');
        checkPath(message.codexHome,{directory:true});
        if(message.codexCLI && (typeof message.codexCLI!=='string'||!message.codexCLI.startsWith('/')))throw new BoardError('invalid_cli','Choose an absolute Codex runtime path.');
        this.settings={...this.settings,codexHome:resolve(message.codexHome),codexCLI:message.codexCLI||null};writeJSON(this.settingsPath,this.settings);this.integration=new Integration(this.dataDir,this.settings.codexHome);return this.status();
      }
      case 'diagnostics':{
        const state=this.status();return {version:'0.1.0',helper:'bundled',gateway:state.gateway,port:9477,providers:Object.fromEntries(Object.entries(state.registry.providers).map(([p,s])=>[p,{status:s.status,error:s.error?.code??null,lastRefresh:s.refreshedAt??null}])),lastRoute:state.lastRoute,installed:state.integration.installed,pendingCatalog:state.pendingCatalog};
      }
      default:throw new BoardError('unknown_command','Unknown control command.');
    }
  }
  async close(){clearInterval(this.timer);await this.stop();}
}
