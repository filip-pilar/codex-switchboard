import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {swiftCachePaths} from './swift-cache-paths.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url))),{moduleCache,scratch}=swiftCachePaths(root,'swift-tests');
mkdirSync(moduleCache,{recursive:true});
const result=spawnSync('swift',['test','--disable-sandbox','--scratch-path',scratch],{cwd:root,stdio:'inherit',env:{...process.env,CLANG_MODULE_CACHE_PATH:moduleCache,SWIFTPM_MODULECACHE_OVERRIDE:moduleCache,SWITCHER_TEST_RPC_EXE:join(root,'test/support/codex-rpc-fixture.mjs'),SWITCHER_TEST_INSTALLED_CLI:'/Applications/ChatGPT.app/Contents/Resources/codex'}});
process.exitCode=result.status??1;
