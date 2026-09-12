# Architecture

`SwitchboardApp` is a macOS 26+ SwiftUI/AppKit menu app. `SwitchboardCore` holds official native account RPC, private profile storage and verified credential handoff. One bundled Bun executable serves the private newline-delimited JSON control protocol and, when enabled, the public loopback gateway on **127.0.0.1:9477**.

The app installs a hash-checked helper copy under its private Application Support directory. A private ownership lock prevents duplicate helpers. Closing the app's stdin lifeline stops its helper and workers; repeated crashes back off. The helper starts no public listener until integration is applied. It refuses an occupied port.

The helper owns `settings.json`, `gateway-config.json`, revisioned combined catalogs, `install-state.json`, and private configuration backups. Apply stages a complete catalog and routing revision; a small interrupted-operation record permits deterministic recovery. Restore compares owned values, resolves specific conflicts, and preserves unrelated TOML and hooks.

Each inference request snapshots model/provider/effort once. Only registered public Switchboard slugs and applied legacy selectors route externally. `switchboard-selected` snapshots the menu, direct entries use request effort, and `codex-auto-review` always remains native. Unknown external IDs and unavailable accounts fail locally; there is no provider/account fallback.

Native requests use fixed ChatGPT/OpenAI destinations and preserve bytes except for required history conversion. Browser-origin traffic is rejected. External requests receive an allow-listed compatibility header set and the destination worker capability; native credentials/account/cookie headers are stripped. No redirects are followed. Bodies are bounded before and after decompression (10 MiB) and by nesting depth (100). SSE forwards with cancellation; no routine full-response buffering occurs at the gateway.

Devin and Grok run in separate hidden worker processes. Credentials come from protected official CLI files. The Devin worker applies the pinned Connect transport, Astra selector/instruction mapping and image tag 10. The Grok worker applies its fixed xAI subscription Responses contract and a single-flight official CLI refresh on 401 with one retry. Grok failure does not prevent native/Devin routing. Reconnect pauses/cancels only that provider.

Discovery uses authenticated non-inference interfaces. Cache refreshes are deduplicated, bounded and backed off; the last known metadata and preferences survive failure. New compatible models remain disabled until selected by the user and applied to the catalog. A provider identity change invalidates old availability before admission. The dynamic Devin registry is connected to the pinned transport's live selector gate, not just the UI.

Native sign-in uses an isolated, private file-backed Codex profile and official browser RPC. Switching serializes with setup/restore in the app, pauses native streams, quits Desktop normally, refuses remaining CLI sessions, verifies/saves the refreshed current credential, atomically installs/verifies the target, commits and reopens the same app. Target-verification/commit failure restores the original. Keychain-only logins are never scraped; migration requires a fresh official login and an explicit storage choice. Provider-only sentinel creation additionally requires the official runtime to report no existing native authentication.

No request/response bodies, images, auth headers, credentials, account email or raw provider errors are emitted in diagnostics. Account labels are local UI metadata. Last route contains only a validated model ID, provider, effort, outcome and times; it is not identified as the foreground task.
