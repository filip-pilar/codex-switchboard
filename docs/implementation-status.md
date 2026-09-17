# Implementation status

## Repository polish — 2026-09-17

- [x] Make agent guidance model-neutral and route installation questions to the existing user docs.
- [x] Clarify build prerequisites, source installation, provider setup, experimental limits, and safe bug-report contents.
- [x] Replace the native test wrapper's fixed ChatGPT app path with shared Codex discovery and an explicit override; skip only the installed-runtime test when Codex is absent.
- [x] Validate: JavaScript tests 60/60, native tests 25/25 (including the isolated installed-runtime test), changed-document local links, and `git diff --check`.

This pass changes documentation and test tooling only. No app rebuild, live inference, activation, or public-release security audit was performed. Product acceptance below remains open.

## Current checkpoint — 2026-09-13

The Devin ACP backend and Grok 4.6 gateway changes are implemented and built in the isolated helper. **The installed service and active Codex profile have not been switched to this build.** Earlier signed-app builds predate the final ACP changes; a fresh app package and explicit activation are still needed.

- [x] Route Devin through the official CLI ACP protocol and bundled private MCP relay.
- [x] Discover the retained models through official CLI metadata; map 39 exact Devin reasoning selectors into 35 registry entries (Astra grouped).
- [x] Preserve caller tool namespaces, custom patch input, inline images, reasoning/text streams, cancellation and provider isolation.
- [x] Integrate native Codex subagents, in-memory task assignments, sibling follow-ups, live web and deferred tool discovery.
- [x] Verify real compiled-helper read/edit on all ten retained Devin families at the budget selectors.
- [x] Finish the remaining 36 cross-model capability probes and targeted retries. Preserve initial failures and test scope.
- [x] Add discovery guidance for Astra Low; user accepted the fix after 4/5 original-prompt compiled controls passed, including the final three consecutively.
- [x] Preserve the separate Grok 4.6 gateway's existing coding, reasoning, image, collaboration and search evidence. Grok 4.5 is retired.
- [ ] Build the final macOS app package, review recovery, and activate only with explicit authorization.
- [ ] Verify a real Desktop workflow after activation and a user-assisted native two-account handoff.
- [ ] Establish structured citation fidelity, provider usage accounting semantics and broader concurrent/mixed-provider workflows.

## Validation and acceptance

Fresh publication checks on 2026-09-13: the full JavaScript suite passed 60/60, the isolated helper compiled successfully (36 modules), and all tracked ACP experiment drivers passed JavaScript syntax checks. No new live inference or installed-service activation was performed for publication.

[Compatibility validation](compatibility-validation.md) is the current capability matrix and scope. Astra acceptance preserves the observed failed control; it is not a claim of perfect reliability. Peer retries used a READY turn followed by a direct sibling follow-up; arbitrary active message queues are not certified. No fallback, approval weakening, account rotation or synthetic tool execution was used.

The reusable real-gateway acceptance driver is [gateway-acceptance.mjs](../experiments/acp/gateway-acceptance.mjs). Raw local run artifacts under `.build/compat-audit/` are ignored and are not required for an ordinary build. The committed matrix summarizes their reviewed outcomes without prompts, credentials or raw responses.

See [development workflow](development-workflow.md) for checks, [setup and recovery](setup-recovery.md) for activation/restore, and [implementation history](implementation-history.md) for the full chronological record.
