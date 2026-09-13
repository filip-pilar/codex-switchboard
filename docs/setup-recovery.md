# Setup, activation and recovery

## Before activation

Build the final app package before activation; earlier signed bundles may predate the latest gateway changes. Open `dist/Codex Switchboard.app`. It starts its private control helper; it does not redirect Codex or start the public listener before Apply. The existing gateway/router remains available during development. The app's service uses **127.0.0.1:9477**, separate from the previous setup.

In Connections, **Import / Refresh Current CLI Session** checks authenticated discovery without an inference request. **Connect / Reconnect** opens the official CLI browser flow. Devin and Grok each use the current official CLI identity. Reconnect pauses that provider, cancels its active requests, and reloads only that worker. Missing CLIs open their official installation instructions; they are not redistributed or automatically upgraded.

Native Codex sign-in is recommended. In Accounts, **Add Account…** signs into a new private file-backed profile without changing the active login. **Import Current Login** verifies both the current runtime identity and a private copy before registering it. A Keychain-only login requires a fresh official sign-in and an explicit file-storage migration in Setup; Switchboard does not scrape Keychain. Usage is read through the official account API and remains unknown/stale when unavailable.

## Apply

1. Select compatible models with **Show in Codex**. New discoveries stay disabled. Provider-advertised support is separate from prior/live verification.
2. Open Setup. Review the effective Codex home under Advanced. An overridden home must match the home Desktop actually uses; resolve any displayed disagreement before applying.
3. For an existing `devin_astra`, router or Ollama configuration, select explicit migration. Switchboard backs up the original owned values and keeps the old provider table. It removes only positively identified legacy native router hooks, retaining unrelated hooks.
4. Choose **Apply and Restart Codex…**. While active work is running, choose **Apply, Restart Later**. This writes the combined catalog, starts the owned loopback service, and sets native-provider `openai_base_url`/`model_catalog_json`. No installed Codex/ChatGPT bundle is patched.
5. Finish active tasks and restart Codex yourself, or use the explicit restart choice when it is safe. The implementation task's Desktop must not be terminated to prove activation. Existing CLI processes also need restarting.
6. After restarting, use **I Have Restarted Codex** to clear the reminder.

Provider-only setup creates a local sentinel only after the official runtime confirms there is no existing native authentication and no auth file exists. It cannot replace a real login. The sentinel is never forwarded upstream; native models and the native approval reviewer require native authentication. Manual approval remains a choice within Codex, not something Switchboard changes.

## Choose models

- **Switchboard selection** follows the app menu on each new request. Menu model/effort changes among applied targets need no global config rewrite or restart.
- **Astra · Devin** takes the request's reasoning choice and maps it to the exact Astra selector. Low/Medium have prior source evidence; higher advertised levels are not labeled live-verified.
- **Grok · xAI** remains the alias of its originally registered upstream model. The supported direct model is Grok 4.6, with Low/Medium/High/XHigh and inline images. Retired 4.5 entries cannot route; new versions get distinct identities.
- **Native Codex models**, including `codex-auto-review`, remain native. Native subagents and existing approval/sandbox settings are retained.

Last request shows the observed provider, actual selector/effort, result and time, separately from the configured menu. It does not claim to identify the foreground task. A missing/unavailable model fails explicitly; it does not silently change provider or model.

Discovery refreshes on connection changes, when stale at launch/during use, and on Refresh Models. Failures keep the last known catalog and enabled preferences. New/changed picker capabilities are staged until Apply and restart. An externally changed official CLI identity invalidates the old availability before another inference is admitted.

## Switch native accounts

Finish Desktop tasks and close existing CLI sessions. **Switch and Restart Codex** asks Desktop to quit normally, pauses native requests, saves the verified refreshed credential, installs and verifies the target, commits selection, and reopens the same app. Refusal to quit, remaining CLI processes, an externally changed identity or unsafe file path stops the handoff. A post-activation verification/commit failure restores the prior credential. A reopen failure leaves the verified selected account in place and is reported.

Browser sign-in and a real two-account handoff require the user's participation. Local rollback fixtures are not evidence of a completed live handoff.

## Restore

Use **Setup → Restore Integration…**. Each owned scalar is compared with the app's last applied value. For conflicts, choose **Keep Current** or **Restore Original** for that key. Later valid native model selections are preserved. If restoring an old external provider would make that native selection unusable, the native provider remains selected; the old provider table is still retained. Saved native profiles and unrelated Codex settings remain intact. Original recognized router hooks are merged back without removing later unrelated hooks.

Restart Codex after restoration. Quitting an integrated app offers Cancel, Quit, or Restore Then Quit; ordinary Quit and Command-Q both use that warning. Quitting stops the helper and workers; no orphan daemon remains.

If the UI cannot open, first quit any Switchboard instance, then run the bundled emergency restore command:

```sh
"/absolute/path/Codex Switchboard.app/Contents/Resources/switchboard-helper" --restore
```

It uses the same ownership checks and refuses unresolved conflicts or an already-running helper. It does not overwrite a broad configuration backup. Reopen the app to resolve listed conflicts. Replace `/absolute/path` with the actual app location.

Private state is under `~/Library/Application Support/Codex Switchboard/` (0700; files 0600). `backups/` holds private config snapshots. Interrupted apply/restore is recovered only when the exact before/after state matches; a foreign edit causes an explicit conflict. Do not delete an ownership record to take over an unknown running process.

## Limits and diagnostics

Inline images for retained Devin families and Grok 4.6, plus caller tool identifiers, are preserved. Remote image fetching is unsupported. Request/image bodies are limited to 10 MiB before and after decompression and depth 100. Oversize content fails explicitly.

External compaction and private continuation that cannot be attributed safely are unsupported. Start a new task when instructed, including when a resumed task contains private state the gateway cannot safely classify after a restart. Native approval failures are explained; the app never fabricates decisions or reduces approval/sandbox requirements.

Copy Safe Diagnostics contains versions/readiness, stable error categories and last-route metadata. It excludes tokens, auth headers, account emails, raw provider errors and request/response bodies. Provider usage is unknown where the official interface does not expose it.

Live inference requires separate session authorization. The bounded acceptance check is Astra text/tool/file/screenshot, Low-to-Medium next-request routing, one explicit native request, Grok text/tools when connected, and a user-assisted account handoff if two accounts are available. No full model sweep or subscription purchase is required.
