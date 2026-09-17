import { spawnSync } from 'node:child_process';
import { accessSync, constants, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { findCodex } from '../gateway/codex/catalog.mjs';
import { swiftCachePaths } from './swift-cache-paths.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { moduleCache, scratch } = swiftCachePaths(root, 'swift-tests');
const installedCLI = process.env.SWITCHER_TEST_INSTALLED_CLI || findCodex();
const env = {
  ...process.env,
  CLANG_MODULE_CACHE_PATH: moduleCache,
  SWIFTPM_MODULECACHE_OVERRIDE: moduleCache,
  SWITCHER_TEST_RPC_EXE: join(root, 'test/support/codex-rpc-fixture.mjs'),
};

if (installedCLI) {
  // An invalid explicit path should fail, not silently skip the runtime check.
  accessSync(installedCLI, constants.X_OK);
  env.SWITCHER_TEST_INSTALLED_CLI = installedCLI;
} else {
  delete env.SWITCHER_TEST_INSTALLED_CLI;
  console.warn('Codex CLI not found; skipping the installed-runtime test. Fixture tests still run.');
}

mkdirSync(moduleCache, { recursive: true });
const result = spawnSync('swift', ['test', '--disable-sandbox', '--scratch-path', scratch], {
  cwd: root,
  stdio: 'inherit',
  env,
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
