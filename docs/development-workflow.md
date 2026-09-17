# Development

Build/install commands are in [README](../README.md); component ownership is in [architecture](architecture.md). Run checks from the repository root and select those relevant to the change.

| Check | Prerequisites and effects |
| --- | --- |
| `node --test test/*.test.mjs` | Installed dependencies; gateway fixtures and loopback servers. No provider inference. |
| `node bin/test-native.mjs` | Swift toolchain; account/RPC fixtures. Finds Codex in ChatGPT/Codex apps or PATH; accepts `CODEX_CLI_PATH` or `SWITCHER_TEST_INSTALLED_CLI`. Only the installed-runtime test is skipped when Codex is absent. Uses private scratch homes. |
| `node bin/check-codex-runtime.mjs` | Installed Codex and native catalog metadata. Local fixture responses in an isolated home; no provider inference. |
| `node bin/check-packaging.mjs` | Built helper at `.build/macos/switchboard-helper` (or first argument), Node 24+, port 9477 free. Checks standalone operation, compression bounds and scratch restore. |
| `node bin/check-discovery.mjs`, `node bin/check-provider-start.mjs` | Built helper and official Devin sign-in. Authenticated catalog/startup checks, no inference. Inspect readiness as well as exit status. |
| `node bin/check-control-transaction.mjs` | Built app, normalized discovery/native caches, valid provider scope and a compatible disabled Devin model. Applies/restores a scratch Codex home using port 9477; no inference. |
| `node bin/build-macos-app.mjs` (or `--debug`) | Builds and ad-hoc signs the app under `dist/`; does not activate integration. Inspect affected UI behavior for app changes. |

`node bin/build-helper.mjs` defaults to `dist/switchboard-helper`. Use `--output .build/macos/switchboard-helper` for helper-only packaging checks. Don't run packaging/control checks concurrently or terminate an existing listener to free the port.

The Swift wrappers' `--disable-sandbox` flag applies to SwiftPM build subprocesses, not Codex permissions. Preserve the host's approval/sandbox policy.

Optional [live acceptance](../experiments/acp/README.md) requires current authorization and existing provider sign-in. [Compatibility validation](compatibility-validation.md) records evidence and remaining acceptance; historical authorization is not permission for another run. Activation and recovery are covered in [setup and recovery](setup-recovery.md).

The helper is compiled with Bun and depends on `smol-toml`. Provider CLIs are external. Generated files under `.build/` and `dist/` are disposable; edit their source instead. Reused-source revisions and notices are in [source provenance](source-provenance.md).
