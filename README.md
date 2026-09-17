# Codex Switchboard

One native macOS menu app with a bundled private gateway for Codex Desktop and CLI. Save and switch native Codex accounts, connect the official Devin/Grok CLIs, and select external models from the menu bar. Codex continues to own tool execution and approvals.

**Experimental, source-built app:** Apple Silicon and macOS 26+ only. The helper has isolated validation; final packaged-app activation, a real Desktop workflow, and native two-account handoff remain unverified. Builds are ad-hoc signed, not notarized. See [validation and known limits](docs/compatibility-validation.md).

## Build and install

From a cloned checkout, with Node.js 24+, Bun 1.4.2, and a Swift 6.2+ toolchain with the macOS 26 SDK (`swift` and `xcrun` on PATH):

```sh
bun install --frozen-lockfile --ignore-scripts
node bin/build-macos-app.mjs
open "dist/Codex Switchboard.app"
```

You can move the built app to `/Applications` before opening it. Node, Bun, and Swift are only needed to build; the app bundles its helper. Opening it does not activate integration—use Setup when ready.

Install Codex Desktop/CLI and open it once before setup. For external models, install and sign in to the corresponding official CLI: [Devin](https://docs.devin.ai/cli/quickstart) or [Grok](https://docs.x.ai/build/cli/overview). Only the providers you use need connecting. Switchboard uses your existing accounts and provider access; it does not supply subscriptions or redistribute these CLIs.

## Development checks

After installing dependencies:

```sh
node --test test/*.test.mjs
node bin/test-native.mjs
```

Additional local integration checks (installed Codex for the first; a built app and port 9477 free for the second):

```sh
node bin/check-codex-runtime.mjs
node bin/check-packaging.mjs
```

Build output: `dist/Codex Switchboard.app`. The legacy pinned dependency and patch remain in build staging and historical transport checks; Devin inference now uses ACP. Neither old gateway/router app nor `references/extracted/` is required at runtime or for an ordinary build after dependency installation.

`check-codex-runtime` uses an isolated local fixture, not provider inference. `check-discovery` and `check-provider-start` use an existing official Devin session only for non-inference catalog/startup checks. `check-control-transaction` uses the app’s normalized discovery cache and applies/restores only an isolated Codex home. The checks above do not perform live inference. The explicitly invoked `experiments/acp/gateway-acceptance.mjs` driver does; run it only with authorization.

## Gateway status

Devin inference uses the official CLI's ACP protocol and a bundled MCP relay. Codex owns file execution, approvals and subagents. The retained families are Astra, Gemini 3.8 Flash, GPT-5.6 Sol/Terra/Luna, SWE-1.7/Lightning, SWE-2, Devin Grok 4.6 and DeepSeek V4.1 Flash. The separate Grok connection supports 4.6. Fusion, fast variants, GLM, Kimi and other excluded families are not routed.

See the [compatibility matrix](docs/compatibility-validation.md) for exact selectors and limits. Astra Low deferred discovery passed 4/5 focused controls; the observed failure is retained. Model availability depends on your provider account and CLI version.

## Use

1. Open the app, then **Manage → Connections**. Import/refresh an existing official CLI session or use **Connect** for browser sign-in. Add/import native accounts in **Accounts**.
2. In **Models**, choose **Show in Codex** for compatible discoveries. Astra and the registered Grok model are initial defaults; new models stay disabled.
3. In **Setup**, review any existing integration, choose explicit migration if needed, and **Apply and Restart Codex…**. Choose **Apply, Restart Later** while active tasks are still running.
4. After restarting Codex, choose **Switchboard selection** in its actual picker to follow the menu. **Astra · Devin** and **Grok · xAI** keep direct routing; native entries remain native.
5. Use **Restore Integration…** in Setup to return owned settings. Resolve specific conflicts, then restart Codex.

The gateway uses `127.0.0.1:9477`. It never takes over an unknown listener, rotates accounts, changes sandbox/approval policy, or falls back to a different provider. External compaction and unsafe private continuation require a new task. Grok 4.6 exposes the reviewed image and reasoning contract; Grok 4.5 is retired.

For installation and troubleshooting, see [setup and recovery](docs/setup-recovery.md). For contributions, see [AGENTS.md](AGENTS.md), [development checks](docs/development-workflow.md), [architecture](docs/architecture.md), and the [current checkpoint](docs/implementation-status.md). Bug reports should include the app/CLI versions and **Copy Safe Diagnostics**, never credential files or raw request logs.

Licensed under [MIT](LICENSE). Reused-source and bundled-runtime notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), with [source provenance](docs/source-provenance.md) recorded separately. This is an independent project, not an official OpenAI, Cognition, or xAI app.
