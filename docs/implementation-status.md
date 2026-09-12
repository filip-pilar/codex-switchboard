# Implementation status

- [x] Verify four archive hashes and recorded local source-file hashes; preserve notices/provenance.
- [x] Import isolated Devin/Grok transports; compile and sign the standalone helper and native app.
- [x] Implement discovery/cache, immutable route/effort mapping, native proxy, credential stripping and compatibility boundaries.
- [x] Implement combined picker catalog, atomic setup/restore, conflict handling, interrupted recovery and legacy hook migration.
- [x] Implement official native login, account store, verified handoff/rollback, usage windows and provider reconnect.
- [x] Observe the native Manage UI and popover; select Low then Medium through actual controls in isolated fixture storage.
- [x] Finish signed release packaging, current-code acceptance checks and setup/recovery documentation.

## Deliverable

`/Users/phil/Documents/forma-code/codex-switchboard/dist/Codex Switchboard.app`

The signed release is running in its normal private app storage with integration **not applied**. The final UI shows authenticated Devin discovery and Grok **Needs Login**. Activation and restore are documented in `docs/setup-recovery.md`.

## Observed evidence

- Signed debug and release app/helper builds passed (Swift 6.2.3, Bun 1.4.2). The final release passed `codesign --verify --deep --strict`.
- Installed ChatGPT.app Codex runtime accepted all three public Switchboard entries and Astra `max`; local sentinel, SSE, `/codex/v1/responses`, and 426 WebSocket-to-HTTP fallback passed with a local fixture (no provider inference).
- 25 native tests passed; the 5 transport tests were rerun after adding awaited, bounded shutdown of owned RPC children. Native account tests passed for ordered handoff/rollback, real private-file restoration, symlink refusal, login completion before start response, timeout/cancellation and actual isolated native runtime reads.
- 21 focused JavaScript checks passed, with affected boundary checks rerun after fixes. Checks passed for route/reviewer separation, model discovery, refresh/removal/preference rules, TOML/comments, restore conflict/migration, images/tool IDs, body limits, cancellation and provider environment isolation.
- Standalone compiled helper ran without Node/Bun on PATH, answered loopback health, isolated missing-provider failures, and passed gzip/zstd/decompressed-size checks.
- The compiled control transaction applied one newly enabled dynamic model, preserved native entries, signalled restart, changed Low → Medium, restored the exact original scratch config and removed only its sentinel. The bundled emergency restore also passed.
- The compiled Devin transport started after discovery, enforced exact selector equality (rejecting a remapping alias), rejected unauthenticated/unused routes, and emitted no raw logs.
- Authenticated **non-inference Devin discovery** returned 152 normalized non-Claude models and all five Astra effort selectors. Grok official CLI discovery needs sign-in attention; no entitlement is inferred from its cached output.

## Remaining user-dependent evidence

The user authorized up to 8 live Devin/native scratch requests within 5 minutes. Two requests passed on 2026-09-11: native `gpt-6-astra` and Devin `gpt-6-astra-low`, both through the gateway into the installed Codex CLI, with HTTP 200, expected marker received and CLI exit 0 (6 seconds and 5 seconds respectively). The compiled Devin worker served the external request. The scratch proxy used the production source on an ephemeral loopback port. Native transport recorded client cancellation after the CLI received its answer; Devin recorded stream completion. Scratch credentials and configuration were removed; final fingerprints confirmed active config/auth unchanged. Sanitized evidence is in ignored `.build/live-result.json`. Grok inference, browser sign-in and a real two-account handoff remain pending. No global activation, Desktop restart/termination, subscription purchase or publishing has occurred. The earlier menu interaction fixture used `.build/ui-smoke/`; it is stopped. The release now uses normal app storage but remains unapplied. Final private fingerprint comparison confirmed both the active Codex config and native auth file are unchanged.

Checkpoint: implementation, local acceptance, and the authorized native/Devin live smoke checks are complete. Global activation and Desktop restart remain user actions, along with Grok login and a user-assisted native handoff when two accounts are available. The old setup remains in place.
