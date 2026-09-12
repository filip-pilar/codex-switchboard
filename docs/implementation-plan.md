# Codex Switchboard: implementation plan

## How to use this specification

This file owns product requirements and full-delivery acceptance criteria. Shared agent workflow and permission boundaries live in [AGENTS.md](../AGENTS.md). Consult the sections relevant to the requested change; use [implementation status](implementation-status.md) for recorded progress and evidence. The source study and original integration sequence below preserve design rationale, not a fresh assignment to rebuild the product. Mechanical adaptations are recorded in `docs/source-provenance.md`.

## Objective and scope

Build **one repository and one native Mac menu-bar application**, working name **Codex Switchboard**, for connecting accounts and bringing subscription-backed models into Codex Desktop and Codex CLI. The existing LLM Local Gateway and Subagent Model Router applications must not be runtime dependencies. Copy/adapt their useful source into the new project. One app may bundle private helper processes; the user installs and launches only one app.

This is the canonical implementation specification. Preserve the current working setup until explicit activation. The completed app must not require patching the installed ChatGPT/Codex application bundle.

Initial deliverable:

- Multiple saved native Codex/ChatGPT accounts, explicit account switching, identity verification, and available usage windows.
- Devin and Grok subscription connections using their official CLIs for authentication. Reuse existing working Astra and Grok transport code.
- Native models and clearly labeled external models in the actual Codex picker.
- A menu selection that can change the next external inference request without changing global Codex configuration each time.
- Setup, restore, connection state, last observed route, and a self-contained signed local app bundle.
- A provider interface supporting later adapters without building a plugin marketplace now.

Scope decisions: macOS 26+, Apple Silicon, Swift 6.2 in Swift 5 language mode, matching the working gateway. No Claude integration, Anthropic public API, separate subagent product, account rotation, load balancing, cross-provider fallback, Windows app, telemetry service, auto-updater, or hosted backend. Native Codex subagents must keep working, but no custom subagent policy editor is required. Native account pools are included. Devin and Grok each initially expose their current official-CLI identity; do not promise multiple independently managed identities for those providers without a verified CLI profile mechanism. Reconnect replaces that provider's active identity. This is a deliberate first-version limit.

## Source study and reuse map

Source was read, not executed, during this study. No native-account changes or inference tests were performed for the study.

| Source | Revision inspected | What to adapt |
| --- | --- | --- |
| `ollama/ollama` | `b68b112bd8868d6278250d7d4bdfafa5cbf035c8` | `cmd/launch/codex_app.go`: native-provider config, combined visible model catalog, restore state, app lifecycle; `internal/proxy/codex_desktop.go`: model routing, HTTP fallback, headers, status; `codex_desktop_normalize.go`: protocol/history handling |
| `liuzhao1225/codex-account-switcher` | `5f2a0352d33a26b479bbe614b9b80843f4c9cb16` | Swift `CodexClient`, `AccountStore`, `SwitchService`, `WeeklyUsageNormalizer`, and AppKit `DesktopController` |
| Local `llm-local-gateway` | HEAD `5536debc025598ae55ead6a9069f7c42ca9ff3da` **plus current uncommitted changes** | Devin/Grok transports, private credentials/state, Astra instruction adaptation, image enablement, Codex child tools, process supervision, Bun helper packaging, path-keyed Swift caches |
| Local `subagent-model-router` | `20e9cfaf3e8b3bc92e3069b7449cae85978a7e44` | Atomic files, config ownership/restoration, body decoding and headers, per-request config loading; do not transplant the full product |
| `dwgx/WindsurfAPI` | pinned `81370f553718153bcd52297251cc565562d85645` and the gateway's patch/lockfile | Retain as pinned build dependency; preserve the exact catalog staging transform |

Pinned source archives are included under `references/`; see `references/README.md` and `references/manifest.json`. Use those preserved sources, including local uncommitted changes, instead of depending on temporary clones or the current state of sibling repositories. Ollama findings concern the inspected main commit, not a claim that every feature is present in release 0.34. Copy relevant MIT notices into `THIRD_PARTY_NOTICES.md`; audit transitive notices for packaged dependencies. Source file hashes are already recorded in `references/manifest.json`; record any adaptations in `docs/source-provenance.md` during implementation.

### Important findings

1. Ollama removes custom `model_provider` selection, sets `openai_base_url`, supplies `model_catalog_json`, and configures desktop reasoning visibility. It preserves the native account route rather than treating all requests as Ollama traffic.
2. Its displayed model catalog and routing allow-list are separate. The former contains native and external entries; the latter determines only external routing. Routing is evaluated per request.
3. Setup/catalog changes have an explicit restart flow. Existing route changes do not establish that Desktop hot-reloads a catalog. Do not claim all changes are restart-free.
4. Our router's catalog currently contains hidden aliases, and its adapter replaces model but not reasoning. Its catch-all main route is unsuitable as the default for a mixed native/provider picker.
5. The account switcher uses `codex app-server --stdio` for `account/login/start`, completion notifications, `account/read`, and `account/rateLimits/read`. Each saved login uses a private Codex home. Switching closes Desktop, saves the current refreshed credential, activates the target, verifies it, commits selection, and reopens Desktop. Failure after activation restores the prior credential.
6. Do not blindly copy its macOS file reader: its `checkPath` protection is Windows-only at this revision. Retain our no-symlink/regular-file checks and restrictive permissions on macOS.
7. Ollama includes approval decision transformations and full-access tool rewrites. **Do not copy those into version one.** Preserve Codex approval and sandbox semantics.
8. xAI login for subscription inference is distinct from X developer OAuth. Existing code uses the official Grok CLI session and its subscription Responses proxy; the account's entitlement is discovered, not inferred from a Premium+ label.

## Architecture and ownership

Use this prepared `codex-switchboard` repository. Do not create a second repository or rename/delete the old repositories. App name `Codex Switchboard`, bundle identifier `dev.codexswitchboard.menu`. These are working identifiers, not a public branding exercise.

Use SwiftUI/AppKit for UI, account management, login orchestration, and process lifecycle. Use JavaScript ESM for the bundled gateway/helper, preserving working transport code rather than rewriting it into Swift or Go. Compile the helper with Bun; users do not need Node or Bun installed. Build dependencies and official provider CLIs are distinct: official CLIs remain necessary for provider authentication. Discover them and provide an install action/instructions when absent; do not redistribute their executables without checking permissions.

```text
Codex Desktop / Codex CLI
       │ native provider redirected once
       ▼
127.0.0.1:9477/codex/v1
       │ request model → immutable route decision
       ├── native identity → ChatGPT backend / existing OpenAI API route
       ├── switchboard-devin-astra → Devin adapter → official Devin session
       ├── switchboard-grok → Grok adapter → official Grok session
       └── switchboard-selected → current menu selection → external adapter

SwiftUI app → private stdio control channel → bundled helper
```

Use port 9477 by default, avoiding both old apps' ports. Refuse to take over an unknown listener. The public listener and any provider-private listener bind only to `127.0.0.1`. The helper executable can launch itself in provider-worker mode so Devin's environment/global upstream state remains isolated. Reuse private capability headers between worker listeners. Grok failures must not prevent native or Devin routing.

The Swift app is the sole owner of account-profile credentials. The helper is the sole writer of its routing configuration/catalog/installation manifest, invoked through a bounded structured command interface. Serialize all setup, account-switch, and restore operations in one Swift coordinator. Share a transaction identifier/status across the two components; do not let two writers race on `config.toml`.

Storage: `~/Library/Application Support/Codex Switchboard/`, mode 0700. Private files mode 0600. Suggested files: `settings.json`, `accounts/registry.json`, `accounts/<uuid>/` private Codex homes, `gateway-config.json`, `models.json`, `install-state.json`, `backups/`, `bin/switchboard-helper`, and redacted rotating service logs. Respect the effective Codex home; default `~/.codex`, explicit override supported in Advanced settings. Detect disagreement between Desktop and CLI homes instead of silently editing the wrong one.

No persistent request/response bodies, images, auth headers, tokens, or raw provider errors in logs. Account labels/emails are local UI metadata, not diagnostic output. No arbitrary web-accessible config mutation endpoint: use app/helper stdio. Reject browser-origin traffic on the proxy and do not provide permissive CORS.

## Model identity and routing contract

Maintain an explicit registry with `id`, display name, provider ID, supported efforts, default effort, upstream selector mapping, context limits, input modalities, tool capabilities, and availability/evidence state.

| Desktop model | Public slug | Route |
| --- | --- | --- |
| Native Codex models | Preserve native slug unchanged | Existing native identity, untouched selection |
| Astra · Devin | `switchboard-devin-astra` | `low/medium/high/xhigh/max` → exact `gpt-6-astra-<effort>` selector |
| Grok · xAI | `switchboard-grok` | Discovered supported Grok selector; advertise only verified effort capabilities |
| Switchboard selection | `switchboard-selected` | Snapshot current external provider/model/effort from menu config |

Only Low/Medium have direct Astra live evidence from our current work. Do not label other advertised levels as live-verified. Astra/Grok are the initial enabled defaults; other discovered compatible models, including SWE, may appear in Manage → Models for optional enabling. Do not make their individual live verification a prerequisite for delivering the app.

### Provider model discovery and updates

Implement discovery as a required provider-adapter operation, not a fixed list shipped in the UI. Each adapter supplies `discoverModels`, capability normalization, and a transport-compatibility decision. Use authenticated official CLI discovery or the existing authenticated catalog endpoint used by that provider. Verify the installed CLI's output format; do not invent a JSON flag or scrape human-readable output without a bounded, version-aware parser. Grok's current CLI may expose less metadata than Devin; preserve that uncertainty.

Refresh after connection/reconnection or account change, on app launch when the cache is older than 24 hours, and through **Refresh Models** in Manage → Models. While the app stays open, refresh stale caches at most once per 24 hours. Deduplicate concurrent refreshes, bound timeout/output, and back off after failure. Discovery must not issue inference requests, automatically upgrade CLIs/dependencies, or consume test quota. Show last successful refresh and a nonblocking failure state; keep the last known catalog on timeout, malformed output, or partial discovery.

Persist normalized metadata only: provider and nonsecret account scope, exact upstream ID, display name/family, available reasoning levels and defaults, context limits, image/tool support, source/version/timestamp, compatibility state, and user enabled/hidden preference. Separate provider-advertised support from actual live verification. A missing field is **unknown**, not false or a guessed capability copied from a native model. A missing reasoning list is also not proof that reasoning is disabled: omit unverified effort controls and use the upstream default only where the transport contract permits it. If essential Codex compatibility cannot be established from metadata or an existing reviewed adapter contract, keep the model discovered but not enableable, with the missing requirement shown.

Use a small reviewed capability/mapping overlay for known models such as Astra and Grok where discovery omits necessary data. Annotate overlay provenance and apply it only to exact supported models/families. Group effort-specific selectors into one picker model only when provider metadata or that reviewed mapping establishes the relationship; do not infer it solely from an arbitrary ID suffix. Unknown families remain separate exact model entries until a mapping is established.

Derive stable public slugs from provider plus upstream identity, never from display name or list position. `switchboard-grok` remains an alias for its original registered model, not whichever future Grok model is newest. New versions get their own stable identities; `switchboard-selected` is the only deliberately changeable destination alias.

New discoveries appear under **New models** in Manage → Models with their provider, reasoning/capabilities, compatibility state, and **Show in Codex** toggle. Compatible models are user-enableable without inference testing. Do not automatically replace the active model, enable every new model, or restart Codex. Models the provider advertises but our pinned transport cannot encode/accept remain visible as **Requires adapter update**. The implementation must connect the dynamic registry through endpoint validation and the pinned transport's catalog allow-list; updating only the UI list does not count as discovery support. New models that fit the existing protocol should not require an app code change just to add their IDs; genuinely new protocols still do.

Successful account-scoped refreshes may mark a previously available model unavailable; retain its identity and preferences, and return an explicit availability error if selected. Do not silently switch providers/models or delete task compatibility entries. Never interpret a failed or incomplete refresh as removal of all models. Refresh under a new login must not present the prior account's entitlement as current.

Enabling a model or changing catalog capabilities stages a new combined picker catalog and shows **Apply and Restart Codex**. Commit routing registry and catalog from one validated revision, retain hidden routing support for disabled entries needed by older tasks where still authorized, and distinguish current applied catalog from pending changes. A discovery-only refresh does not require restart. A normal menu selection between already-applied compatible targets still takes effect on the next request. For newly enabled targets, do not make them selectable through the live alias until its conservative capability contract has been applied too.

For a direct provider slug, honor the request's supported reasoning effort; if omitted, use that model's configured default. Reject unsupported values with a helpful error instead of quietly changing them. For `switchboard-selected`, the menu selection explicitly overrides both model and effort on the next request. Label it “Applies when Codex uses Switchboard selection.” Do not silently redirect native GPT selections. Capture route/config revision at request start; changes never redirect an in-flight stream.

Give the live-selection alias a stable, conservative capability contract: the minimum context limit and common supported tool/input capabilities across its enabled targets. Reasoning is controlled by the menu, not a second competing effort picker. If vision is not common to the initial targets, use the direct “Astra · Devin” entry for image tasks and explain that in the alias description. A request carrying unsupported content must be rejected explicitly. Do not regenerate catalog metadata for every menu selection or falsely advertise one provider's capabilities for another. Adding a new target with a smaller capability contract is a catalog/setup update requiring restart.

Carry native model names unmodified. External slugs must not collide with `gpt-6-astra`. Distinguish protocol response model labels from actual upstream identity: maintain a stable client-facing model where necessary and record the actual wire selector separately. Never pretend that an echoed model label proves provider billing.

Retain explicit compatibility for old `gpt-6-astra-low/medium/...` selectors from already-open tasks, routing them only to Devin. Do not automatically reinterpret unsuffixed native `gpt-6-astra` as Devin. Register the legacy selectors as hidden catalog entries if Desktop needs them for resume. Unknown `switchboard-*` slugs fail locally; other native requests follow the native route, which handles their availability.

## Catalog and global config installation

Generate a combined catalog from the installed Codex runtime/native catalog plus provider entries. Reuse Ollama's metadata pattern: visible entries, reasoning choices, `supported_in_api`, modalities, context window, and tool metadata. Merge desktop reasoning levels with existing settings. Never guess model context capacity from a cloned GPT entry; use documented/discovered provider limits or an explicitly conservative documented value. Preserve native metadata when possible; auth visibility adjustments must follow observed installed-client behavior.

Use a cached native catalog first where valid. When refreshing through the official runtime, avoid recursively loading the app-generated catalog; use a private temporary home and only the minimal protected auth/cache input needed. Ensure temporary credentials are cleaned up on success/failure. Do not scan conversation bodies to count usage.

Install the native-provider mode from Ollama: default native provider, `openai_base_url = "http://127.0.0.1:9477/codex/v1"`, `model_catalog_json` pointing to the combined catalog. Match Ollama's suffix handling and accept the observed installed CLI/Desktop path; cover doubled `/v1` mistakes with a local fixture before live use. No `chatgpt_base_url` override is required by this design. Keep native auth owned by Codex.

Before writes, validate the current TOML, resolve symlinks/ownership safely, preserve comments and unrelated sections, and snapshot all owned scalar values including model, effort, provider selection, base URL, catalog, and desktop effort list. Create a private backup and an ownership manifest. Update only owned keys with an atomic write, reparse, then mark the transaction complete. On interrupted installation, restore or finish the recorded transaction deterministically on next launch. A small single-operation manifest suffices; no general workflow framework.

For an existing working `devin_astra` setup, preserve it as the original state, replace root provider selection only during explicit setup, and retain its provider table for restoration. For an installed third-party router/Ollama configuration, detect ownership conflicts and offer explicit migration; do not overwrite another manager's hooks silently. Remove only positively identified, app-owned Codex routing hooks during an authorized migration. Preserve all unrelated hooks, skills, projects, approvals, and CLI preferences.

Default after installation: `switchboard-selected`, Astra Medium if Devin is connected, otherwise the first supported connected external model, otherwise preserve native selection. Do not point it at a disconnected provider. Initial setup and catalog rebuilds offer “Apply and Restart Codex.” Normal model/effort choices already in the catalog need no configuration rewrite. Mark refreshed catalogs as pending until a restart; do not repeatedly restart for health/usage updates.

Restore uses compare-before-write ownership checks. If another app/user edited an owned key afterward, list the precise conflict and offer a deliberate resolution, not a broad config rollback. Restoring integration does not log out native accounts or delete saved accounts. If root model changed to another valid native model, avoid overwriting that later user choice just to restore unrelated endpoint settings.

## Account and authentication flows

### Native Codex accounts

Adapt the account switcher's Swift JSON-RPC client. Prefer the installed Desktop's compatible bundled runtime, with explicit CLI path and PATH fallback. Feature-check the runtime instead of requiring an invented version number. Handle login-completion notification arriving before its start response, timeouts, cancellation, and unexpected process exit. Suppress raw stdout/stderr outside the RPC parser.

Adding an account uses an app-owned private profile home, browser login through the official runtime, identity read, deduplication using the available account/workspace identity, then registration. Preserve current native login throughout. Per-profile credential storage should explicitly use file mode through supported Codex configuration so the imported switch logic is deterministic. A keyring-only active login must not be guessed or overwritten: offer a fresh official login into a file-backed profile and an explicit migration; never scrape Keychain secrets. Detect an externally changed active identity before switching.

Account switch steps: prevent duplicate operations; show that Codex will restart; ask the app to quit normally; wait for exit and stop if it refuses; pause new native inference while finishing/aborting old native streams explicitly; verify and save the current refreshed credential; atomically activate target; verify target using official `account/read`; commit registry; refresh native model metadata as needed; resume native route; reopen the same detected app. On post-activation failure restore original credentials and surface the failed stage. Never force-kill Desktop or swap credentials under a running CLI that silently retains another account. Explain that existing CLI processes must be restarted.

Use native account/rate-limit RPC for usage. Show stale/unknown and reset timestamps honestly. Do not invent subscription counters from token counts. Avoid multiple runtime instances concurrently refreshing the same profile; serialize profile operations and use active-home reads for the active account.

### Devin and Grok

Connect/import current official CLI sessions by protected path. Reuse the existing native login launchers, including Devin's PTY wrapper where required. Login/refresh/logout remain CLI-owned. App UI opens the official browser flow and reports connected, needs login, unavailable entitlement, or unavailable CLI.

Devin reads the protected `windsurf_api_key` field already used by our adapter; do not replace it with a new OAuth implementation. Grok reads the current xAI access token only, performs the existing single-flight official-CLI refresh on 401 and one retry, and uses the fixed subscription inference endpoint. Explicitly label it “Grok / xAI,” with a note that linked Premium+ entitlement is checked through the CLI. Never request X developer keys or scrape X cookies.

Reauthentication should stop admitting new requests for that provider, finish or cancel its in-flight requests predictably, then reload/restart only its worker. Other providers remain usable. No automatic account rotation or provider fallback after quota errors.

Native sign-in is recommended for the complete experience. If no native credentials exist, support provider-only operation using the local sentinel-auth pattern only after confirming the installed client's behavior; create it exclusively when auth is absent, never overwrite a real login, never forward it upstream, and remove only the exact owned sentinel on restore. Native account actions remain unavailable until sign-in. Do not implement a token proxy across multiple saved Codex accounts: switching remains a verified handoff.

## Request compatibility rules

Reuse our working transport normalization and public limits; delete the unused Anthropic routes rather than advertise them. Retain cancellation, tool call/result identifiers, streaming, image blocks, and stable provider errors. Keep private provider state isolated.

- Native requests: preserve original bytes/headers unless a known cross-provider history conversion is necessary. Match ChatGPT-account headers to the fixed ChatGPT backend and API-key auth to the native API origin. Never derive an upstream URL from a client header. Disable cross-origin redirect credential forwarding.
- External requests: construct an allow-listed header set; remove native Authorization, API-key, account, cookie, and provider-bound headers before attaching only destination-owned credentials. Retain only needed nonsecret Codex compatibility metadata.
- Compression: bounded encoded and decompressed bodies, existing 10 MiB public limit and depth 100 unless a documented change is required. Errors explain oversize image/request instead of dropping data. Streaming responses are not fully buffered for routine forwarding. Respond to WebSocket upgrades with the HTTP fallback behavior validated against the installed client.
- Images: preserve the now-working `DEVIN_CONNECT_IMAGE_TAG=10` configuration in the bundled worker; retain inline images through transformations and tool output. Do not advertise Grok vision until evidenced. Remote image fetching is out of scope; return explicit unsupported-content errors rather than silently discarding it.
- Instructions: preserve the working Astra compatibility preamble for initial parity, scoped to the Devin adapter. Catalog instructions should match this adapter behavior. Document that the static Codex instruction preamble is replaced; do not remove user/developer messages or unrelated tools. Do not try speculative prompt changes during this build without a demonstrated failure.
- History: copy the *principle* of provider-specific filtering, not Ollama ID heuristics. Preserve visible text/tool history; never send native encrypted reasoning to Devin/Grok or external private reasoning back to native. Use observed provider formats and bounded request/response ID ownership metadata. If a compacted/resumed conversation cannot be continued without losing its only context or cannot be classified safely, stop with “Start a new task for this provider” instead of silently discarding the only summary. Same-provider tool loops must continue to work.
- Approvals: keep `codex-auto-review` on its native route and preserve existing approval/sandbox settings. Without a usable native reviewer, surface the failure with an explanation that the user can choose manual approval in Codex. Do not fabricate approval decisions, rewrite decisions, change permission defaults, or route the reviewer through `switchboard-selected`.
- Auxiliary endpoints: native auxiliary paths stay native; do not send third-party request bodies to a native compaction endpoint as an accidental fallback. Unsupported third-party compaction/continuation endpoints fail clearly. Record the limitation in the app help rather than promise unlimited long-running sessions.

## UI and service behavior

Popover layout, top to bottom:

1. Gateway status: Running / Starting / Needs Attention; Open Codex button.
2. **Switchboard selection:** external model picker and its valid reasoning picker; effective-next-request label. Clear hint that Codex must be using the matching picker entry.
3. **Codex account:** active verified account label, usage/reset when available, Switch / Add / Manage.
4. **Connections:** Devin and Grok rows with identity/entitlement status and Connect/Reconnect actions.
5. **Last request:** provider, actual selector/effort, completion/error status and time. Also show configured selection separately; no inference that it identifies the foreground task unless correlation exists.
6. Manage… / integration status / Launch at Login / Quit.

Manage window tabs: Models, Accounts, Connections, Setup. Advanced values are hidden by default. Do not require manual URLs or model slugs for built-in providers. Provide Copy Safe Diagnostics containing versions, readiness, last route and stable error categories only. Provider usage is Unknown when the official interface does not expose it.

Service supervision: one owned helper started by app when integration is enabled. Internal provider workers are hidden implementation details. Restart crashed workers with bounded backoff and display repeated failure; never spawn duplicate gateways. Request handlers retain their route snapshot on config reload. The stable app-managed helper path is version/hash checked and replaced atomically after stopping owned processes. Reuse absolute-path-keyed Swift caches.

Quit warns that Codex is configured to require the app; provide Cancel, Quit, and Restore Then Quit. Do not silently leave an orphan service running, and do not silently restore settings on every app exit. Login-item support opens this same app; no additional visible app or daemon installer is required.

## Repository and original integration sequence

```text
codex-switchboard/
  Package.swift
  Sources/SwitchboardApp/        # SwiftUI, AppKit lifecycle, menu/settings
  Sources/SwitchboardCore/       # accounts, login RPC, controller, secure files
  gateway/core/                 # settings, routes, provider registry, private state
  gateway/codex/                # catalog, config ownership, native proxy, compatibility
  gateway/providers/            # devin, grok, adapter interface
  gateway/service/              # lifecycle, status, JSON control protocol
  bin/                          # helper/app build, check, launch
  patches/                      # pinned dependency patch
  test/                         # focused reused fixtures and contract checks
  docs/                         # architecture, source provenance, setup/recovery
  THIRD_PARTY_NOTICES.md
  package.json, bun.lock
```

The initial integration followed these stages. Use them to understand dependencies when relevant; current remaining work comes from the implementation checkpoint:

1. Use the prepared repo and verified reference archives, retain source notices/provenance, and import the working transport/private-file/build code and small Swift account core. Remove external repo runtime references and Claude code paths. Establish one helper and signed debug app build.
2. Implement the provider registry, authenticated model discovery/cache and compatibility normalization, pure route resolution/effort mapping, native proxy, safe headers and compatibility boundaries. Wire discovered IDs through transport validation. Add route status and provider isolation. Keep current user's endpoint/config untouched while developing on the new port.
3. Implement combined catalog, atomic install/restore manifest and native-provider setup. Add switchboard-selected and direct provider entries. Verify actual installed schema/path behavior using local fixtures and runtime discovery before applying global changes.
4. Implement official Codex account login/usage/switch core and secure file-backed profiles. Wire provider login into the single app. Include the explicit legacy integration import/restore path; do not delete old accounts or repositories.
5. Build popover and Manage UI using the agreed behavior. Wire startup, owned-process updates, reload, restart-required states, and actionable errors. Open the built app and check its actual UI, not only compilation.
6. Finish the limited acceptance run below, repair discovered integration problems, build the release app, and write concise setup/recovery instructions. Deliver app path and actual evidence. Do not report unexecuted identity flows as passed.

Keep the known-working old service available until final cutover. Initial integration cutover should finish by asking the user to restart if the implementing task runs inside that same Desktop instance; the agent must not terminate its own active task to prove restart. Normal account/login flows may require user participation; continue independent implementation while awaiting it. Source completion and successful live activation are separate deliverables if login is unavailable.

## Essential completion evidence, without a test project expansion

Reuse existing focused tests; add small local fixture checks only for new route/config/account failure boundaries. No coverage target, extensive CI matrix, benchmarks, test dashboard, or large live sweep.

Required local checks: signed app/helper build; route/effort separation including reviewer route; credential stripping; catalog visibility and restore conflict; account switch verification/rollback and refusing symlinks; SSE cancellation and compressed-size bounds; preserving inline images and tool IDs.

Cover discovery with small local fixtures: a new compatible model reaches registry/routing/catalog without a hardcoded ID edit; unknown capability metadata remains unknown; a failed refresh preserves cached choices; account-scoped removal does not trigger fallback; existing enabled preferences survive refresh; applying a new catalog preserves native entries and signals restart. No live inference sweep across the discovered catalog is required.

With explicit live-test authorization and already-connected accounts, use a bounded scratch task to verify: Astra text + command/file edit + screenshot; the menu changes Low → Medium on the next switchboard-selected request; explicit native selection remains native; Grok text/tools; a manual native account handoff with the user when two accounts are available. Show safe route metadata and exact pass/fail only. Do not consume inference quota for every UI change or attempt to purchase credits. Cross-provider continuation after compaction may remain explicitly unsupported as specified above.

Done means: one app bundle runs without either old repo/app; a user can connect providers, apply setup, choose clearly labeled models, switch the menu route, inspect the actual last route, and restore configuration; account switching is implemented with a verified handoff or clearly reported pending user login. Runtime dependencies are accurately documented. No made-up usage, silent model fallback, credential leaks, or claim of zero restarts.

## Implementation boundaries that are already decided

- Build the full combined app specified here, not another adapter bolted onto two existing apps.
- Keep native account switching explicit and restart-based; no per-request native account credential substitution.
- Keep menu live selection and explicit provider picker entries separate and predictable.
- Use official CLI auth for Devin/Grok; no browser cookie extraction or new provider OAuth client registration.
- Use our working transport implementation; port selected Ollama logic into ESM rather than bundle the entire Ollama server.
- Copy Swift account functionality with stronger macOS path handling; do not copy Windows/Sparkle/UI wholesale.
- Treat unverified installed-client behavior as a bounded compatibility check with an actionable unsupported state, not a reason to silently change architecture or weaken approvals.
