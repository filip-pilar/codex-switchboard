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

Build output: `dist/Codex Switchboard.app`. The legacy pinned dependency and patch remain in build staging and historical transport checks; Devin inference now uses ACP. Neither old gateway/router app nor `references/extracted/` is required at runtime or for an ordinary build after dependency installation.

`check-codex-runtime` uses an isolated local fixture, not provider inference. `check-discovery` and `check-provider-start` use an existing official Devin session only for non-inference catalog/startup checks. `check-control-transaction` uses the app’s normalized discovery cache and applies/restores only an isolated Codex home. The checks above do not perform live inference. The explicitly invoked `experiments/acp/gateway-acceptance.mjs` driver does; run it only with authorization.

## Gateway status

Devin inference uses the official CLI's ACP protocol and a bundled MCP relay. Codex owns file execution, approvals and subagents. The retained families are Astra, Gemini 3.8 Flash, GPT-5.6 Sol/Terra/Luna, SWE-1.7/Lightning, SWE-2, Devin Grok 4.6 and DeepSeek V4.1 Flash. The separate Grok connection supports 4.6. Fusion, fast variants, GLM, Kimi and other excluded families are not routed.

See the [accepted compatibility matrix](docs/compatibility-validation.md) for exact selectors and limits. Astra Low deferred discovery is user-accepted with 4/5 focused passes; the observed failure is retained. **The new helper has been tested in isolation; the running installed service has not been switched.**

## Use

1. Open the app, then **Manage → Connections**. Import/refresh an existing official CLI session or use **Connect** for browser sign-in. Add/import native accounts in **Accounts**.
2. In **Models**, choose **Show in Codex** for compatible discoveries. Astra and the registered Grok model are initial defaults; new models stay disabled.
3. In **Setup**, review any existing integration, choose explicit migration if needed, and **Apply and Restart Codex…**. Choose **Apply, Restart Later** while active tasks are still running.
4. After restarting Codex, choose **Switchboard selection** in its actual picker to follow the menu. **Astra · Devin** and **Grok · xAI** keep direct routing; native entries remain native.
5. Use **Restore Integration…** in Setup to return owned settings. Resolve specific conflicts, then restart Codex.

The gateway uses `127.0.0.1:9477`. It never takes over an unknown listener, rotates accounts, changes sandbox/approval policy, or falls back to a different provider. External compaction and unsafe private continuation require a new task. Grok 4.6 exposes the reviewed image and reasoning contract; Grok 4.5 is retired.

See [setup and recovery](docs/setup-recovery.md), [implementation evidence](docs/implementation-status.md), [architecture](docs/architecture.md), and [source provenance](docs/source-provenance.md). Source licenses are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `licenses/`.
