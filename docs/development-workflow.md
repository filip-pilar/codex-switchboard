# Development workflow

Use [AGENTS.md](../AGENTS.md) for shared rules and [the specification](implementation-plan.md) for product contracts. This page maps existing commands to their actual prerequisites and effects; it is not a mandatory checklist. Run commands from the repository root. Build instructions are in [README](../README.md).

## Select checks for the change

| Change or question | Existing check | Prerequisites and effects |
| --- | --- | --- |
| Instructions/docs only | Review diff, local references, and remaining obligations | No app build, login, or inference needed. |
| Gateway routing/config/discovery normalization | `node --test test/*.test.mjs` or the affected test file | Installed dependencies; fixtures and loopback servers. No live provider inference. |
| Native account/RPC behavior | `node bin/test-native.mjs` | Swift toolchain; wrapper sets fixture paths and path-specific caches. Installed-runtime test expects `/Applications/ChatGPT.app/Contents/Resources/codex`; private scratch home. |
| Installed Codex catalog/protocol compatibility | `node bin/check-codex-runtime.mjs` | Installed Codex and dependencies. Reads native catalog cache or bundled metadata; CLI request is answered by a local fixture in an isolated home. |
| Helper packaging | `node bin/check-packaging.mjs` | Defaults to `.build/macos/switchboard-helper`; optional first argument selects another helper. Needs port 9477 free and a Node runtime exporting `node:zlib`'s `zstdCompressSync` (the package's Node >=20 floor alone is insufficient). Uses missing-provider fixtures and scratch restore state. |
| Devin discovery/startup | `node bin/check-discovery.mjs`, `node bin/check-provider-start.mjs` | Require `.build/macos/switchboard-helper` and an existing official Devin session. Authenticated network discovery, no inference. Startup check uses an ephemeral private listener. Discovery prints readiness; a zero exit alone does not prove provider availability. |
| Compiled setup/menu/restore transaction | `node bin/check-control-transaction.mjs` | Requires the release app, current normalized app discovery cache, native model cache, valid provider scope, and at least one compatible disabled advertised Devin model. Applies/restores a scratch Codex home, starts port 9477, and does not forward inference. |
| App/UI/build changes | `node bin/build-macos-app.mjs` (or `--debug`) plus affected UI inspection | Builds helper/PTY driver/Swift and signs the local bundle. Replaces the selected output bundle under `dist/`; does not activate integration. |

`node bin/build-helper.mjs` alone defaults to `dist/switchboard-helper`; it does **not** populate the `.build/macos/` default used by several checks. Use its `--output .build/macos/switchboard-helper` option when validating only the helper, or use the app build. Avoid concurrent packaging/control checks: both need port 9477. An occupied listener is a prerequisite conflict, not permission to terminate an existing service.

The Swift wrappers use `--disable-sandbox` for SwiftPM's build subprocess sandbox; this is not a Codex permission setting. Preserve the host's approval/sandbox policy. No check here authorizes changing live integration. UI activation and recovery controls are documented in [setup and recovery](setup-recovery.md).

## Continuing unfinished acceptance

The [implementation checkpoint](implementation-status.md) records local acceptance and two bounded native/Devin text smoke requests on 2026-09-11. Treat its running-app and login statements as last-observed state. Its eight-request/five-minute authorization is historical, not a reusable budget.

The specification's remaining live evidence is broader than those two text requests: Astra command/file/screenshot behavior, a Low-to-Medium menu change affecting the next live alias request, Grok text/tools after login, and a user-assisted two-account handoff. Local UI/transport fixtures and prior upstream Low/Medium evidence do not establish those combined live flows in this app. Activation and Desktop restart also remain user-dependent in the recorded checkpoint. Preserve these obligations until actually observed; do not treat the completed local checklist as full live acceptance.

When continuing product work, update the existing status checkpoint with new outcomes, exact evidence, and remaining work. Keep completed observations under its evidence section and the current next action separate. Do not replay its execution history or renew expired authorization by copying it into a new prompt.

## Source and generated ownership

Ordinary builds use the pinned dependency/patch, not extracted references. For source reuse, [references/README.md](../references/README.md) and its manifest own archive verification; `bin/extract-references.py` verifies hashes/member safety and extracts under the ignored directory. Keep upstream AGENTS/skills there as source evidence. Helper build staging transforms the pinned catalog loader under `.build/helper/`; fix the build source/patch rather than its generated copy. Generated app catalogs contain product-facing instructions from `gateway/core/registry.mjs` and `gateway/codex/catalog.mjs`; they are a separate transport compatibility contract, not repository development instructions.
