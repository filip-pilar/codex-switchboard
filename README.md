# Codex Switchboard

One native macOS menu app with a bundled private gateway for Codex Desktop and CLI. It manages saved native Codex accounts, official Devin/Grok CLI connections, discovered external models, and per-request menu selection.

**Requirements:** Apple Silicon, macOS 26+, Codex Desktop/CLI, and the official provider CLIs for sign-in. Node and Bun are build tools; end users do not need them. The app is locally signed and is not a public/notarized release.

## Build and check

```sh
bun install --ignore-scripts
node bin/build-macos-app.mjs
node --test test/*.test.mjs
node bin/test-native.mjs
node bin/check-codex-runtime.mjs
node bin/check-packaging.mjs
```

Build output: `dist/Codex Switchboard.app`. The pinned dependency and patch are part of this repository; neither old gateway/router app nor `references/extracted/` is required at runtime or for an ordinary build after dependency installation.

`check-codex-runtime` uses an isolated local fixture, not provider inference. `check-discovery` and `check-provider-start` use an existing official Devin session only for non-inference catalog/startup checks. `check-control-transaction` uses the app’s normalized discovery cache and applies/restores only an isolated Codex home. No script automatically performs paid/live inference.

## Use

1. Open the app, then **Manage → Connections**. Import/refresh an existing official CLI session or use **Connect** for browser sign-in. Add/import native accounts in **Accounts**.
2. In **Models**, choose **Show in Codex** for compatible discoveries. Astra and the registered Grok model are initial defaults; new models stay disabled.
3. In **Setup**, review any existing integration, choose explicit migration if needed, and **Apply and Restart Codex…**. Choose **Apply, Restart Later** while active tasks are still running.
4. After restarting Codex, choose **Switchboard selection** in its actual picker to follow the menu. **Astra · Devin** and **Grok · xAI** keep direct routing; native entries remain native.
5. Use **Restore Integration…** in Setup to return owned settings. Resolve specific conflicts, then restart Codex.

The gateway uses `127.0.0.1:9477`. It never takes over an unknown listener, rotates accounts, changes sandbox/approval policy, or falls back to a different provider. External compaction and unsafe private continuation require a new task. Grok vision/reasoning controls remain unadvertised until supported by verified metadata/contract.

See [setup and recovery](docs/setup-recovery.md), [implementation evidence](docs/implementation-status.md), [architecture](docs/architecture.md), and [source provenance](docs/source-provenance.md). Source licenses are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `licenses/`.
