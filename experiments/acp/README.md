# Live gateway acceptance

Optional maintainer checks using the production gateway. These require explicit live-inference authorization and existing official CLI sign-in; they are not installation steps.

`gateway-acceptance.mjs` uses the actual gateway proxy/ACP backend, not a probe transport. With explicit live authorization, build the isolated helper and run:

```sh
node bin/build-helper.mjs --output .build/acp/switchboard-helper
ACP_PACKAGED=1 ACP_LIVE_MODEL=swe-2-medium ACP_LIVE_EFFORT=medium ACP_LIVE_LABEL=packaged-edit node experiments/acp/gateway-acceptance.mjs
```

The default checks a random scratch-file read, real caller apply_patch, readback and final answer. `ACP_LIVE_MODE=search` uses the scratch laboratory MCP fixture; `web`/`web-denied` test native web policy. `image` requires existing card-0.png/expected.json under `.build/compat-audit/vision-diagnostic/`. `ACP_LIVE_AGENTS=1` tests two Codex children; `ACP_PEER=1` additionally selects the sibling follow-up case. Each run is bounded to four minutes; evidence contains booleans and tool metadata only. Space requests at least ten seconds apart. The driver removes its scratch profile, worker and transport without changing the active service. A zero process exit alone is not a pass: inspect the mode-specific evidence fields.

The live driver itself must not run inside an outer sandbox that prevents nested Codex's execution sandbox from starting. In that environment, use the host's approved command-execution mechanism for the scratch driver while retaining the driver's `--sandbox workspace-write`. Never work around this by disabling Codex approvals or its sandbox. Permission-denied runs inside a nested outer sandbox are environment failures, not model capability evidence.
