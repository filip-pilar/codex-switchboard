# ACP experiments

The production implementation now lives in `gateway/transport/devin-acp.mjs` and `gateway/transport/acp/`. These earlier probe drivers remain historical fixtures; the production gateway does not import them. The session-call and tool-name modules here re-export their promoted gateway implementations. Live inference still requires explicit session authorization.

`session-calls.mjs` holds pending calls behind opaque, session-specific handles. Only issued calls may complete; wrong-session, premature and duplicate results are rejected. Cancellation rejects queued/issued calls and closes the handle. Normal completed SSE responses retain pending calls for the next Responses request. Limits bound sessions and pending calls.

`task-context.mjs` preserves child assignments and follow-ups represented by Codex `agent_message` items, which have no user/developer role. This is experimental text transport, not a native instruction hierarchy.

Run the offline checks with `node --test test/acp-session-calls.test.mjs test/acp-task-context.test.mjs`.

The isolated live driver currently remains under `.build/compat-audit/swe2-session-relay.mjs`. It uses official Devin authentication in temporary XDG state, a private MCP relay and installed Codex in a scratch profile. It is not production-ready: one conversation per process, flat function-tool support, fixture-specific helpers, incomplete caller instruction fidelity and usage reporting. Independent overlap alone does not prove child routing. Subsequent corrected native child tests verify execution, random-value delivery and follow-up acknowledgement across nine selectors; the current one-child probe is described below. See `docs/compatibility-validation.md` for evidence and limits.

## Shared capability probe

`capability-probe.mjs` parameterizes the known single-session bridge by `ACP_MODEL` (an exact installed Devin selector) and `ACP_EFFORT`. It uses the installed official CLIs, isolated credentials/configuration, a scratch file and a new loopback port. Nothing is activated in the user's working Codex profile. `caller-relay.mjs` forwards declared function calls to the owning Codex executor.

With fresh session authorization, from the repository root:

```sh
ACP_MODEL=gemini-3-8-flash-low ACP_EFFORT=low ACP_AUDIT_LABEL=probe-gemini-read node experiments/acp/capability-probe.mjs
ACP_MODEL=gemini-3-8-flash-low ACP_EFFORT=low ACP_TEST=edit ACP_AUDIT_LABEL=probe-gemini-edit node experiments/acp/capability-probe.mjs
```

Read checks use an unknown random value. Edit checks remain the bounded BEFORE_EDIT → AFTER_EDIT fixture, including a completed Codex patch and final file verification. Optional image mode depends on the local generated fixtures under `.build/compat-audit/vision-diagnostic/`: `ACP_VISION_CARD=0 ACP_VISION_PAIR=1` attaches two cards; add `ACP_NO_IMAGE=1` for the control. Evidence contains checks and metadata only. Run sequentially and leave at least ten seconds between requests. Low in the Codex request does not imply configurable reasoning for a default-only upstream selector. These probes do not certify all tools, full instruction fidelity, arbitrary edits or production readiness.

## Native Codex child and follow-up probe

`agent-probe.mjs` starts a bounded parent/child test; `agent-worker.mjs` gives each Codex conversation its own ACP worker. Set `ACP_MODEL` and `ACP_EFFORT` as above. Add `ACP_MESSAGES=1` to request an idle-child follow-up that transforms the previously read random value into an exact ACK response.

Codex may place the actual agent assignment in `encrypted_content`. The bridge cannot recover that from readable message text. `child-relay.mjs` instead retains the original plaintext `spawn_agent`/`followup_task` arguments in memory and passes them to the one bound child; generated child replies return through the same private transport. No decryption or disk storage of task/reply text. Incoming client-supplied private relay fields are stripped. This is explicitly a single-child fixture: it is not a general multi-child identity resolver or a peer-to-peer messaging certification. Parent native file reads are denied, and parent MCP exposure is limited to collaboration tools.

Focused checks: `node --test test/acp-child-relay.test.mjs`. They cover assignment/follow-up retention, wrong-sender/target rejection, binding and reply-queue isolation. Live evidence is `matrix-{agents,messages}-*.json` under `.build/compat-audit`.

## Deferred tools and native web probes

`search-probe.mjs` reuses the gateway's client `tool_search` translation and restores native Responses search events. `search-caller-relay.mjs` notifies Devin when discovery loads new tools. The isolated `search-fixture.mjs` returns a random value known only to the Codex MCP executor. A pass requires actual discovery, execution and exact value propagation. `tool-names.mjs` preserves namespaces and accepts a short alias only when it resolves uniquely among loaded tools; unknown or ambiguous tools remain denied. One redundant codex relay prefix is normalized only after exact lookup fails, with no recursive prefix stripping.

`web-probe.mjs` requires an explicitly live-enabled Codex web declaration before calling Devin's native `web_search`. It translates completed native searches into Responses web-search items. The proof requires native completion, a Codex `web_search` event and the expected official documentation URL/method in the answer. Native tool summaries do not expose source URLs, so this does not certify citation payload fidelity. Cached-only requests are rejected before inference. These remain experimental probes, not production gateway backends.

Use `ACP_MODEL`, `ACP_EFFORT` and `ACP_AUDIT_LABEL` as above. Run sequentially with ten-second gaps. Focused checks: `node --test test/devin-search.test.mjs test/acp-tool-names.test.mjs`.

## Integrated gateway acceptance

`gateway-acceptance.mjs` uses the actual gateway proxy/ACP backend, not a probe transport. With explicit live authorization, build the isolated helper and run:

```sh
node bin/build-helper.mjs --output .build/acp/switchboard-helper
ACP_PACKAGED=1 ACP_LIVE_MODEL=swe-2-medium ACP_LIVE_EFFORT=medium ACP_LIVE_LABEL=packaged-edit node experiments/acp/gateway-acceptance.mjs
```

The default checks a random scratch-file read, real caller apply_patch, readback and final answer. `ACP_LIVE_MODE=search` uses the scratch laboratory MCP fixture; `web`/`web-denied` test native web policy. `image` requires existing card-0.png/expected.json under `.build/compat-audit/vision-diagnostic/`. `ACP_LIVE_AGENTS=1` tests two Codex children; `ACP_PEER=1` additionally selects the sibling follow-up case. Each run is bounded to four minutes; evidence contains booleans and tool metadata only. Space requests at least ten seconds apart. The driver removes its scratch profile, worker and transport without changing the active service. A zero process exit alone is not a pass: inspect the mode-specific evidence fields.

The live driver itself must not run inside an outer sandbox that prevents nested Codex's execution sandbox from starting. In that environment, use the host's approved command-execution mechanism for the scratch driver while retaining the driver's `--sandbox workspace-write`. Never work around this by disabling Codex approvals or its sandbox. Permission-denied runs inside a nested outer sandbox are environment failures, not model capability evidence.
