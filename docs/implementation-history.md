> Historical development record. Superseded checkpoints are retained as evidence; use [implementation-status](implementation-status.md) for current status.

# Implementation status

- [x] Verify four archive hashes and recorded local source-file hashes; preserve notices/provenance.
- [x] Import isolated Devin/Grok transports; compile and sign the standalone helper and native app.
- [x] Implement discovery/cache, immutable route/effort mapping, native proxy, credential stripping and compatibility boundaries.
- [x] Implement combined picker catalog, atomic setup/restore, conflict handling, interrupted recovery and legacy hook migration.
- [x] Implement official native login, account store, verified handoff/rollback, usage windows and provider reconnect.
- [x] Observe the native Manage UI and popover; select Low then Medium through actual controls in isolated fixture storage.
- [x] Finish signed release packaging, current-code acceptance checks and setup/recovery documentation.

## Grok 4.5 retirement — 2026-09-13

At the user’s request, Grok 4.5 is no longer supported through the direct subscription connection or Devin’s Grok 4.5 selectors. Discovery marks these entries incompatible, refreshed catalogs omit them, and route validation rejects stale applied entries with `model_retired`. No automatic selection change or fallback occurs. Focused routing/catalog checks and the rebuilt helper’s isolated rejection check cover this change. The running setup remains unchanged.

## Paced matrix follow-up — complete

The user requested spacing rather than treating rate limits as a terminal result. The isolated sequential retest completed: **135/135 remaining Devin selectors passed, zero HTTP 429s, zero retries**. Combined with earlier distinct successes, all 156 advertised exact selectors have passed a basic inference check. Requests had at least 10 seconds between responses and subsequent requests, with `Retry-After` and increasing backoff configured. No account rotation or limiter bypass occurred. Active config/auth fingerprints matched and scratch state was removed. Evidence: `.build/compat-audit/smoke-paced.json` and `smoke-paced-meta.json`.

The pinned adapter also has a local 20-RPM guard for unknown account tiers. The earlier 429s do not, by themselves, establish an upstream Devin rate limit.

## Current compatibility checkpoint — 2026-09-13

- [x] Implement shared external message/agent-envelope normalization and Devin namespaced history preservation.
- [x] Repair Grok signed-in discovery, 4.5/4.6 capabilities, custom-tool grammar/streaming and integer arguments.
- [x] Add official Devin context/effort enrichment without changing existing model identities.
- [x] Retest Grok 4.5 and 4.6 shell, patch, file read, two-child messaging and supported reasoning levels in isolated Codex homes.
- [x] Build/sign the updated app; validate JS/native suites, installed runtime and standalone helper packaging.
- [x] Complete every advertised Devin selector's basic inference check: all 156 now pass after the paced follow-up. Full tool/vision acceptance remains separate.
- [ ] Resolve Devin's upstream rejection of the full Codex patch-tool request. Text, Astra efforts, direct tools and Astra vision pass; full CLI editing does not.
- [x] Investigate Grok 4.5 images: all nine stronger image probes failed, including two direct-endpoint requests and four format/effort remedies; 4.6 read all three random-code controls. Disable 4.5 image capability and reject image requests locally, including stale catalogs. All 22 focused checks passed; release rebuilt/signed and compiled rejection verified in isolation.
- [x] Implement Grok 4.6 deferred search and verify parent and child search/load/MCP-call workflows in isolated installed Codex sessions. All 35 JavaScript checks passed; app rebuilt/signed; the same live MCP workflow passed using the packaged Grok worker.
- [ ] Establish broader connector coverage and Devin deferred search. Cached-only search and image generation remain unavailable on the Grok bridge. [Deferred search research](deferred-tool-search-research.md) records the implementation precedents.

See [compatibility validation](compatibility-validation.md) for test scope, source provenance and remaining limitations. No global activation, Desktop restart, account rotation or provider fallback was performed. Grok sign-in is now complete. The running app/service was not restarted; the rebuilt bundle is ready for a later activation.

## Deliverable

`dist/Codex Switchboard.app`

At the original 2026-09-11 checkpoint, the signed release was running with integration **not applied**, authenticated Devin discovery and Grok **Needs Login**. Those UI observations are historical; see the current checkpoint above. Activation and restore are documented in `docs/setup-recovery.md`.

## Original observed evidence — 2026-09-11

- Signed debug and release app/helper builds passed (Swift 6.2.3, Bun 1.4.2). The final release passed `codesign --verify --deep --strict`.
- Installed ChatGPT.app Codex runtime accepted all three public Switchboard entries and Astra `max`; local sentinel, SSE, `/codex/v1/responses`, and 426 WebSocket-to-HTTP fallback passed with a local fixture (no provider inference).
- 25 native tests passed; the 5 transport tests were rerun after adding awaited, bounded shutdown of owned RPC children. Native account tests passed for ordered handoff/rollback, real private-file restoration, symlink refusal, login completion before start response, timeout/cancellation and actual isolated native runtime reads.
- 21 focused JavaScript checks passed, with affected boundary checks rerun after fixes. Checks passed for route/reviewer separation, model discovery, refresh/removal/preference rules, TOML/comments, restore conflict/migration, images/tool IDs, body limits, cancellation and provider environment isolation.
- Standalone compiled helper ran without Node/Bun on PATH, answered loopback health, isolated missing-provider failures, and passed gzip/zstd/decompressed-size checks.
- The compiled control transaction applied one newly enabled dynamic model, preserved native entries, signalled restart, changed Low → Medium, restored the exact original scratch config and removed only its sentinel. The bundled emergency restore also passed.
- The compiled Devin transport started after discovery, enforced exact selector equality (rejecting a remapping alias), rejected unauthenticated/unused routes, and emitted no raw logs.
- Authenticated **non-inference Devin discovery** returned 152 normalized non-Claude models and all five Astra effort selectors. Grok official CLI discovery needs sign-in attention; no entitlement is inferred from its cached output.

## Original live checkpoint — 2026-09-11

The user authorized up to 8 live Devin/native scratch requests within 5 minutes. Two requests passed on 2026-09-11: native `gpt-6-astra` and Devin `gpt-6-astra-low`, both through the gateway into the installed Codex CLI, with HTTP 200, expected marker received and CLI exit 0 (6 seconds and 5 seconds respectively). The compiled Devin worker served the external request. The scratch proxy used the production source on an ephemeral loopback port. Native transport recorded client cancellation after the CLI received its answer; Devin recorded stream completion. Scratch credentials and configuration were removed; final fingerprints confirmed active config/auth unchanged. Sanitized evidence is in ignored `.build/live-result.json`. Grok inference, browser sign-in and a real two-account handoff remain pending. No global activation, Desktop restart/termination, subscription purchase or publishing has occurred. The earlier menu interaction fixture used `.build/ui-smoke/`; it is stopped. The release now uses normal app storage but remains unapplied. Final private fingerprint comparison confirmed both the active Codex config and native auth file are unchanged.

Checkpoint: implementation, local acceptance, and the authorized native/Devin live smoke checks are complete. Global activation and Desktop restart remain user actions, along with Grok login and a user-assisted native handoff when two accounts are available. The old setup remains in place.

## User-requested model reductions — 2026-09-13

Retired every GLM and Kimi family, GPT-4.1/5.1/5.2, SWE-1.6 and SWE-1.6 Fast, and Gemini 3 Flash/3.5 Flash/3.6 Flash/3.7 Flash. This is a user scope decision, not a failed-quality claim. All reasoning, priority and context variants of these catalog entries are excluded. Official opaque GPT/Gemini IDs are included in the retirement policy.

Discovery marks them incompatible; catalogs omit them; stale direct IDs, exact selector aliases and menu selections return `model_retired` without choosing another provider/model. The table now contains 26 Devin model/variant groups and 109 exact selectors, plus direct Grok 4.6. No native Codex models are affected.

All 36 JavaScript checks passed and the app/helper rebuilt and signed. The packaged helper's isolated retired-model check passed. No live inference, activation or Desktop restart was needed.

### Sol/Terra/Luna Fast retirement — 2026-09-13

At the user’s request, all 18 Devin GPT-5.6 Sol/Terra/Luna priority selectors are retired across their six effort levels. Standard variants remain supported. The table now has 23 Devin model/variant groups covering 91 selectors, plus direct Grok 4.6. Fifteen focused routing/catalog/proxy checks passed; app/helper rebuilt and signed, with compiled stale-catalog rejection verified in isolation. No activation or restart occurred.

## Explicit model allow-list — 2026-09-13

The user reduced support to ten Devin families: standard Astra, Gemini 3.8 Flash, GPT-5.6 Sol/Terra/Luna, SWE-1.7 Lightning, SWE-2, Grok 4.6, DeepSeek V4.1 Flash, and SWE-1.7. They cover 39 currently advertised exact selectors. Direct Grok 4.6 remains supported. Astra Fast and all other external families are excluded; new families require an explicit scope update. Native Codex models are unaffected.

The shared allow-list governs discovery compatibility and stale-catalog routing. It preserves all advertised effort selectors, including SWE-2 Max. The full 36-check JavaScript suite passed; after correcting the SWE-2 selector set against the inventory, 15 focused checks passed again. The temporary Browser table matches the selected families. No activation or restart occurred.

Final scope validation: rebuilt and signature-verified the macOS app after the SWE-2 Max correction. The isolated compiled-helper check passed: a retired model in a stale catalog returned `model_retired` before worker startup, with no global configuration changes.

## SWE-1.7 feature acceptance — partial, upstream blocker, 2026-09-13

- [x] Confirm default and Medium selectors support function call/result history and namespaced custom tools in paced scratch requests.
- [x] Isolate full Codex request failure: no-tools and exec-only controls pass; patch-only and full tools return upstream `CONTENT_BLOCKED`. No policy bypass attempted.
- [x] Verify three random-code images, a no-image control, and a Medium image; add an exact-selector vision overlay respecting explicit provider false metadata.
- [x] Implement client-owned deferred tool search translation for the two SWE-1.7 selectors; 39 JavaScript checks pass.
- [x] Finish live deferred search/load/call on both selectors and packaged-worker vision validation; update and visually verify the Browser matrix with evidence scope.

Built-in live web probe emits a `web_search_call` without search results; it is not a verified search. The pinned Devin handler converts this to a function declaration without a search execution backend. Full native editing and collaboration acceptance remain blocked by the full tool declaration rejection. Independent search/vision implementation and validation are complete. No other model was tested or selected. Full native acceptance requires resolution of Devin’s patch-tool rejection; web needs an actual execution backend.

Final SWE validation: both live search/load/call fixtures passed, production vision passed on both selectors and again with the packaged worker, the rebuilt app signature verified, and the compiled gateway rejected forced unavailable web search before worker startup. Active Codex config/auth fingerprints remained unchanged. The Browser matrix was refreshed and inspected. No activation or restart occurred.

## Official Devin harness comparison — 2026-09-13

Both official Devin CLI 3000.10.21 edit controls passed on GPT-5.6 Luna Low: normal `read`/`edit`/`read`, and `agent.codex_tools` with raw-string `apply_patch`. Exact scratch file contents were verified, normal permission checks retained, and temporary credentials/session state removed. Metadata evidence: `.build/compat-audit/official-devin-normal.json` and `official-devin-codex.json`.

Gateway editing remains unverified after the earlier failures. The adapter's custom-to-JSON conversion and description transport differ from the official execution contract, but the official wire schema and cause of rejection are not established. No production transport changes or activation occurred. Next: establish native custom-tool declarations/history before implementing a protocol correction. See the official harness comparison in `docs/compatibility-validation.md`.

## Upstream follow-up and custom grammar — 2026-09-13

Inspection of WindsurfAPI commit `67b8357031e006e08fa6a110e449cc8236e1866e` confirms its content-block change intentionally rewrites filter-triggering text and moves identity rewriting after preamble injection. It was not adopted; the earlier research recommendation did not distinguish that mechanism clearly enough. The matching report remains diagnostic evidence, not a verified fix in this gateway.

An independent protocol defect was fixed: the pinned Devin Responses converter ignores custom-tool `format`, discarding the grammar. The gateway now retains the full grammar as tool-description guidance, preserves the original description verbatim and leaves client validation unchanged. This applies to declared tools, namespaces and deferred-loaded tools. It neither suppresses provider errors nor rewrites blocked wording. Twenty-three affected regression checks passed. Both live harmless grammar-only fixtures passed: exact output, custom call type, tool name and namespace on default and Medium selectors. The app rebuilt and signature verification passed. The patch/content-policy blocker is unchanged; no activation or restart occurred.

## Low-reasoning Devin edit matrix — eight tested, 2026-09-13

The user authorized real editing tests across retained Devin families, with Low reasoning for budget control. The isolated installed-Codex harness uses the production gateway and original tool descriptions, one family at a time with 10-second request slots. A provider failure terminates that owned scratch CLI after the first error to prevent automatic retry costs. A pass requires a completed native patch event, changed on-disk file contents, a successful shell read and CLI exit 0. No global activation or model selection changes.

Initial set: Astra, Gemini 3.8 Flash, Sol, Terra, Luna and Devin Grok 4.6 at Low; SWE-1.7 and Lightning at upstream default. SWE-2/DeepSeek have no Low option; the user was asked whether to skip or use Medium/High. Results: all eight returned `CONTENT_BLOCKED` before a patch call; zero file changes, eight total requests, no HTTP 429s, and global config/auth fingerprints unchanged. SWE-2/DeepSeek were skipped under the Low-only budget preference pending a user exception. Evidence: `.build/compat-audit/edit-matrix-low.json` and matching metadata. No protocol fix or further retries were justified by this shared policy rejection.

## Native contract / ACP checkpoint — 2026-09-13

Static CLI evidence confirms an internal custom-tool configuration including grammar fields, but does not establish wire tags; no speculative native transport patch was applied. A zero-inference official ACP initialization passed with the truthful `codex-switchboard` identity, isolated XDG state, no credentials, and filesystem/terminal callbacks disabled. Image prompts and session loading were advertised. Scratch state was removed. Evidence: `.build/compat-audit/devin-acp-handshake.json`.

Next: test whether official ACP client-mediated filesystem and permission requests can be routed through Codex's tool executor. Initialization alone does not validate editing, arbitrary tools, or child agents. Gateway edit status remains failed; no production changes or activation.

## ACP editing boundary passed — 2026-09-13

- [x] Official Luna Low ACP requested reads and a write through client callbacks.
- [x] Hold write callback; verify unchanged fixture; execute actual Codex `apply_patch`; acknowledge only after verifying expected contents; Devin completes.
- [x] Join permission requests to earlier tool notifications by tool-call ID; reject incomplete/unmatched requests.
- [x] Cancel pending write with no mutation; continue same session with a fresh read after ten seconds.
- [ ] Automatic Responses ↔ ACP session/tool-result adapter and full installed-Codex validation.

Evidence: `.build/compat-audit/devin-acp-edit-pass.json` and `devin-acp-cancel.json`. Prototype only: the successful edit was manually mediated by this task's Codex tool executor. Five prompt turns over four bounded Luna Low runs; scratch credential/session state removed. No production transport change or activation. Gateway table status remains unchanged pending an automatic end-to-end bridge.

## Automatic ACP fixture progress — 2026-09-13

- [x] Automatic Responses tool-call/result handoff for the Luna Low single-file fixture, using installed Codex's actual executor.
- [x] Codex shell reads, completed custom apply_patch, verification reads, exact file contents, final marker and exit 0.
- [x] HTML table adds a separate experimental Luna Low row; production row unchanged.
- [ ] General patch conversion, instruction/tool fidelity, session isolation, usage/streaming/error handling and automatic cancellation before production integration.

Evidence: `.build/compat-audit/devin-acp-responses-pass.json`. Successful run used approved outer-sandbox escalation and retained Codex workspace-write. Seven client actions, eight Responses requests, one ACP prompt; scratch state removed. The script is a fixed-fixture proof of the handoff, not a general model replacement. No activation or app rebuild.

## SWE-2 ACP capability checkpoint — 2026-09-13

Switched experiments to SWE-2 Medium at the user's request (lowest advertised SWE-2 effort). Automatic installed-Codex fixture editing passed. Image forwarding added to the experimental bridge; two code-card inputs and a no-image control all passed through installed Codex/ACP. Direct ACP cancellation preserved the file and same-session continuation performed a fresh read. Six prompt turns across five successful test runs; one preceding image CLI parse failure made no inference request. Scratch state removed, syntax checks passed, no activation.

The refreshed HTML table now includes a separate SWE-2 Medium ACP experiment row: text, images, tool calls and file edits verified. Reasoning switching, arbitrary tools, subagents/messaging, live web and deferred discovery remain unverified. Evidence lives in `.build/compat-audit/devin-acp-swe2-*.json`. Next substantive gap is arbitrary caller-tool exposure through ACP/MCP while preserving Codex execution ownership; the fixed-file bridge is not a production route.

## SWE-2 reasoning and arbitrary-tool path — 2026-09-13

- [x] Discover official SWE-2 effort selectors; switch High/Max/Medium with exact readback and no inference.
- [x] Map Responses effort to ACP model selector and validate before inference; fresh installed-Codex Medium control passes.
- [x] Native configured-MCP server discovery/schema loading/permission/call/random-result cycle on SWE-2 Medium.
- [ ] Relay MCP calls into Codex's executor, then validate deferred search, subagents, messaging and live web.

Session-supplied MCP servers initialized but were not visible to model-side discovery in three attempts. Official CLI MCP configuration inside the temporary profile worked. Exact fixture call permission was retained. Evidence in `swe2-acp-config.json`, `swe2-acp-mcp-configured.json`, and `devin-acp-swe2-vision-control.json` under `.build/compat-audit`. High/Max inference remains untested. The Medium experimental HTML row now verifies reasoning; other unproven columns remain unchanged. No production changes or activation.

## Codex-owned caller-function relay passed — 2026-09-13

- [x] Expose current Codex function declarations to SWE-2 via configured MCP and return calls through Responses.
- [x] Real Codex exec_command read → exact random result.
- [x] Real exec_command → returned session ID → write_stdin → exact result.
- [x] Preserve intentional exit-code-7 failure; Devin reports failure without retry.
- [ ] Multi-session/call isolation and disconnect cancellation, then subagent/messaging validation.
- [ ] Custom/deferred tools, namespace collision handling, media results and production hardening.

Three Medium prompts passed; four caller tool actions across seven Responses exchanges. Evidence: `.build/compat-audit/swe2-caller-relay-{read,poll,error}.json`. The relay is experimental, single-session, and function-tool scoped; no production activation. Scratch credentials and state removed. HTML notes updated without changing unverified columns.

## ACP session isolation / cancellation checkpoint — 2026-09-13

- [x] Reusable experimental session-call state and three focused offline tests.
- [x] Integrate into the scratch relay; normal handoffs preserve pending calls.
- [x] Two timestamped independent Codex/ACP workers overlap for 17.1 seconds and return their own exact values; zero pending sessions at cleanup.
- [x] Inject pre-dispatch disconnect: ACP cancels, no caller action executes, pending state clears. Fix misleading completion fallback on cancelled-session retries.
- [ ] Actual Codex child routing, spawn/wait/messages, running-tool cancellation and production lifecycle integration.

Evidence: `.build/compat-audit/swe2-session-overlap.json`, `swe2-session-disconnect-fixed.json`; code `experiments/acp/session-calls.mjs`, checks `test/acp-session-calls.test.mjs`. Live runs remain SWE-2 Medium. Scratch credentials/config/session state removed. No production integration or activation. Subagent/messaging cells remain unverified.

## Native SWE-2 child routing iteration — 2026-09-13

- [x] Scratch Codex v2 collaboration declarations routed to SWE-2 Medium through configured MCP.
- [x] Distinguish native child requests from parent requests; independent ACP workers share only the scratch work directory.
- [x] Preserve Codex `agent_message` task assignments and follow-ups, which lack a user/developer role. Add focused regression check.
- [x] Remove the old edit-marker restriction from scratch native read-result forwarding.
- [ ] Verify exact child result and asynchronous reply delivery back to the parent before marking subagents/messaging green.

The first v1 catalog did not advertise agent tools. With v2 enabled, child startup worked but exposed three adapter errors: parent/child identity collision, omitted agent_message items, and fixture-only read validation. After fixes, a real child performed a Codex-owned read and accepted two follow-up turns; the parent still missed asynchronous child replies. A bounded Medium retest now forwards those replies with caller-tool results. No production activation. Four focused offline tests pass. Live drivers and metadata evidence remain under `.build/compat-audit/swe2-agent*`; raw responses are not persisted.

Subagent result update: two fresh-child runs now pass exact random-value propagation from child executor to parent (`74a7bf/25f46f` and `2f869e/0d58bd` worker pairs). HTML subagent cell is green and browser refreshed. Combined strict ACK test is not passing: child follow-up returns its earlier answer. A final bounded test sends only new agent messages on continuation instead of replaying initial task context. Messaging stays red pending that evidence.

Final bounded retest (`29fe00/2b0297` worker pair) again verifies child read and parent receipt of the exact random value, normal exits, removed scratch state and zero pending sessions. Sending only new agent-message context did not fix the follow-up ACK transformation. Subagents stays green; messaging, web and deferred search remain red for the SWE-2 experiment. Next investigation: ACP continuation/message-update behavior, including model-selection updates and whether prior message chunks are replayed. No further inference left running.

## Shared ACP model matrix — 2026-09-13 (running)

- [x] Parameterize the previously verified single-conversation caller relay by exact Devin selector and reasoning effort.
- [x] Isolated native Codex caller-tool reads pass on Astra Low, Gemini Flash Low, Sol Low, Terra Low, Devin Grok 4.6 Low and SWE-1.7 Lightning default. Verify random returned value, successful caller execution, selector readback and scratch cleanup.
- [ ] Complete SWE-1.7 default read; run independent edit fixtures on passing models.
- [ ] Refresh table from persisted evidence and record final scope.

Requests run sequentially with ten-second gaps. Default SWE-1.7 selectors do not receive a reasoning check merely because the scratch Codex request says Low. DeepSeek is skipped here because its lowest advertised selector is High; existing low-budget constraint remains. Evidence `matrix-read-*.json` and shared driver `model-relay.mjs` under `.build/compat-audit`. New HTML checks explicitly identify experimental ACP selector scope, not production activation.

Matrix milestone: eight exact selectors now pass caller-tool reads and completed Codex edit fixtures: Astra Low, Gemini Flash Low, Sol Low, Luna Low, Terra Low, Devin Grok 4.6 Low, SWE-1.7 default and Lightning default. Six Low selectors have exact reasoning-selection readback; defaults are not promoted to configurable reasoning. Gemini's two-image and no-image control pass. Remaining image checks run sequentially. Shared reusable files are now `experiments/acp/capability-probe.mjs` and `caller-relay.mjs`; the promoted probe itself passed Luna read/edit. Syntax checks pass. Every completed run removed scratch state.

Final shared matrix: all 28 bounded runs passed (eight reads, eight edit fixtures, six two-image checks and six no-image controls). All Codex exits zero, all scratch profiles removed, zero pending sessions. Six exact Low selector readbacks pass; default SWE selectors make no new configurable-effort claim. Updated the existing family rows with exact-selector ACP scope and reconciled the Luna Low experimental row. Saved the matrix in docs/compatibility-validation.md and refreshed the HTML. Shared probe/relay syntax and git diff whitespace checks pass. No production activation or further inference running.

## Cross-model subagent matrix — 2026-09-13 (running)

The initial Gemini/Sol/Luna/Terra attempts started real children but did not deliver the assigned task. Metadata inspection established a transport boundary: the native child `agent_message` contains readable context plus `encrypted_content`; the extracted readable text lacks the file name, read instruction and exec tool name. This explains why forwarding only readable message text is insufficient.

The bounded one-child probe now retains the plaintext outgoing spawn assignment in memory, forwards it to that child worker, and relays the child's generated reply back to the parent in memory. No decryption, persisted prompts, raw reply logging, provider fallback or live-profile activation. Parent native file reads are explicitly denied, so the random-value proof requires child execution. The bounded stop landed after Grok had already passed and the runner advanced to Lightning; Lightning was therefore cancelled by the harness (not a model failure) and needs a rerun. Only the exact probe-owned scratch Codex process was stopped. Remaining models run with the fix; failed initial models will be rerun once a fresh control passes.

Messaging fix verified: Luna Low completed exact child read → parent followup_task → exact child ACK → exact parent ACK, with no second child read. Gemini, Sol, Terra, Devin Grok 4.6 and Lightning now pass the same complete flow. The previously failed readable-only child assignment path is superseded by the in-memory plaintext relay. Two focused relay tests pass; scope is one real Codex child and parent/child follow-up, not peer-to-peer communication or a production multi-child resolver. Model matrix still running for SWE-1.7, Astra and SWE-2 Medium. HTML updated as evidence arrives.

Final child matrix: all nine corrected parent/child follow-up fixtures pass (27 prompt turns across the successful final fixtures). Child exact-value read, child ACK and parent ACK all verified; zero-exit cleanup checks pass. Six focused offline ACP checks pass. HTML gains 17 newly verified capabilities and merges duplicate Luna/SWE-2 experiment rows into family rows without claiming additional model tests from that consolidation. Remaining work: web/deferred search, peer-to-peer and general multi-child routing, production integration. No inference remains running; no activation.

## Native ACP deferred-search batch — 2026-09-13 (running)

Reused prepareDevinSearch/restoreDevinSearchEvent for native Codex client tool_search declarations and history. Added MCP tools/list_changed notification after search results so Devin refreshes newly loaded caller tools. A random-value search fixture is configured only in the isolated Codex profile. SWE-2 Medium, Gemini Low, Sol Low, Terra Low, Devin Grok Low, Lightning default and SWE-1.7 default pass search → load → actual Codex MCP call → random result. Luna loaded the tool but hit a permission-name mismatch; retry will capture tool-name metadata. Astra is still running. No activation; native CLI state remains isolated.

Installed Devin binary inspection found native web_search implementation/tool identifiers. A separate bounded web probe is prepared to test its actual backend after the deferred-search sequence; a declaration alone will not count as a web pass.

Search/web iteration update: the private MCP bridge now preserves caller namespaces and accepts unique short aliases, denying ambiguous and unknown names. Discovery results explicitly identify the codex relay invocation names to avoid calling a caller-side namespace as a separate Devin MCP server. Initial qualified-name Gemini/Terra failures are retained for diagnosis and queued for corrected retests. Five focused name/schema/stream tests pass. Native live web passes SWE-2, Gemini, Sol, Luna, Terra and Devin Grok so far. An explicit cached-only control is rejected before any inference; native completed searches now produce a Codex web_search item. Native result summaries lack citation URLs, so citation payload fidelity remains unverified. Final sequential matrix continues.

## Completed ACP web/deferred matrix — 2026-09-13

- [x] Nine exact selectors pass native live web and actual Codex deferred discovery/load/call (18 selected passing fixtures).
- [x] Fix namespace/short-name lookup and one redundant relay prefix; Gemini and Terra corrected retries pass. Unknown/ambiguous calls remain denied; six focused tests pass.
- [x] Reject cached-only web before inference; zero-prompt negative control passes.
- [x] All selected runs exit zero, remove scratch profiles and clear pending sessions. No inference remains running.
- [x] Save search-web-summary.json evidence manifest and update HTML with 17 additional checks (90/99 total).

Remaining table crosses: Lightning configurable reasoning and eight DeepSeek capabilities (High minimum skipped). Web citation payload fidelity, general multi-child/peer communication and production integration remain unverified outside these fixture checks. No production activation or working-profile change. See docs/compatibility-validation.md for exact scope and failure history.

Lightning reasoning verification: official catalog confirms Medium/Max for both SWE-1.7 families; unsuffixed means Max, correcting earlier "default" descriptions. One fresh Lightning Medium fixture verifies exact selector readback, upstream reasoning events and a correct real Codex tool result. Clean exit and removed scratch state. HTML now 91/99. Codex reasoning display remains unverified. Production discovery's suffix-only effort parsing misses these unsuffixed Max labels; fix before integration. No new Max inference or activation.

## DeepSeek V4.1 matrix — running

User explicitly requested DeepSeek verification, including its lowest advertised High effort. Bounded isolated read/reasoning, edit, paired-image/control, child/follow-up, deferred-search and native-web fixtures run sequentially with ten-second gaps. Exact selector deepseek-v4-1-flash-high; Max remains untested. Existing ACP probes reused; no activation. Evidence deepseek-*.json and matrix-messages-deepseek-v4-1-flash-high.json under .build/compat-audit.

DeepSeek batch complete: all seven fixtures passed first attempt using existing adapters, yielding all nine capabilities on deepseek-v4-1-flash-high. Added eight green cells; HTML now 99/99. Exact High readback and upstream thought events verified; Codex reasoning UI remains unverified. Child/follow-up scope is unchanged. All scratch profiles removed, zero pending sessions, no inference running. No production change or activation. Evidence and limitations recorded in docs/compatibility-validation.md.

## Gateway ACP integration — in progress

User explicitly requested production-path integration rather than additional standalone fixtures. Added gateway/transport/devin-acp.mjs and gateway/transport/acp modules; source worker now starts ACP and the helper embeds a private --acp-relay entry. Caller functions/custom tools retain namespaces, arguments and IDs, execute in Codex, and return through session-bound pending calls. Official CLI processes use temporary private XDG profiles, bounded sessions and teardown. Caller instructions are preserved instead of replaced by the Connect Astra preamble. Streaming reasoning/text translation and in-memory task assignment routing are implemented but require wider integrated acceptance.

Official label enrichment now identifies unsuffixed SWE-1.7 Max and rejects contradictory UID/label reasoning metadata. Retained Devin families expose ACP image capability. All 56 offline checks pass and .build/acp/switchboard-helper builds. Two isolated live runs through createProxy + actual ACP transport passed real read → custom apply_patch → verify → exact answer on SWE-2 Medium; Codex observed reasoning. The second disables native Devin local tools. Evidence gateway-acp-live.json. Active service/config untouched.

Outstanding: corrected real multi-child test (first test had wrong client collaboration configuration and was cancelled), packaged-worker live acceptance, integrated image/search/web regression, native-web denial enforcement, cancellation/continuation limits, usage reporting and citation fidelity. Do not claim the earlier 99/99 experimental matrix establishes these integrated checks. No activation.

## Gateway ACP integration — implemented and integrated acceptance, 2026-09-13

- [x] Devin source worker and compiled helper use the official CLI ACP transport and bundled private MCP relay. Official CLI discovery replaces the Connect selector gate.
- [x] Preserve caller namespaces/custom input, return tools to Codex execution, stream text/reasoning, accept inline images, translate deferred discovery, and restrict native web to live declarations.
- [x] Bind pending calls to sessions/conversations; retain original task assignments in memory for native children and sibling follow-ups. Disable native local tools/subagents.
- [x] Map all 39 retained exact selectors/efforts through discovery, catalog and routing in offline tests. SWE unsuffixed means Max. Reject unsupported efforts and conflicting metadata. Fresh official discovery returned 35 registry entries (Astra grouped).
- [x] Ten compiled-helper live read/edit fixtures pass: Astra/Gemini/Sol/Terra/Luna/Devin Grok Low; SWE-2/SWE-1.7/Lightning Medium; DeepSeek High. Every run exits zero and cleans private scratch state; requests paced ten seconds apart.
- [x] Integrated SWE-2 image, deferred discovery/load/call, native live web, two children and sibling follow-up pass. Sibling test proves child and parent ACK delivery; final response has extra formatting, so exact-only formatting is not claimed. Native-web-disabled negative test passes.
- [x] Offline real-transport fake-CLI tests verify capacity, foreign conversation rejection without poisoning the rightful session, and cancellation/cleanup.

Evidence: `.build/compat-audit/gateway-acp-{matrix-*,image,search,web,web-denied,agents-verified,peer-final}.json`. The HTML now shows integrated acceptance first and retains the historical 99/99 table in a collapsed section. Untested integrated model/capability combinations remain red; this does not erase historical fixture passes.

Limitations: structured web citation payloads and provider usage-counter semantics remain unverified; arbitrary concurrent agent message queues, every tool-result media shape and every higher-effort live run are not certified. Reasoning means exact selection/readback; several Low runs do not emit a displayed thought event. No installed helper/service, active Codex profile or native account configuration was changed. Activation remains separate from implementation.

Packaged follow-up regression: two successive SWE-2 peer runs exited cleanly but failed value delivery. Metadata showed successful fresh child spawns and repeated reader file calls, with no successful value read or peer send. The source peer pass therefore does not establish packaged reliability. The adapter now explicitly distinguishes private ACP cwd from caller workspace and refuses caller arguments containing its private transport directory, returning a retryable MCP error before Codex execution. The offline transport fixture verifies this rejection and successful retry without the private path. Packaged retest is pending; HTML messaging is red until resolved.

Additional admission validation: final bundled helper discovers 35 entries, accepts swe-1-7-medium and rejects swe-1-7-low. A sixty-second catalog cache is keyed by official account scope; actual ACP selection is still read back per new session. Disconnects during initialization are checked before any prompt is sent. Full offline suite had 59 passes before this final workspace guard; focused transport checks pass afterward.

### Final integration checkpoint

Final **compiled-helper** peer acceptance passes: `.build/compat-audit/gateway-acp-packaged-peer-native-sandbox.json` records exit 0, exact ACK true, value-bearing child `followup_task`, no parent fixture read, and clean teardown. The same harness outside the outer command sandbox succeeds with nested Codex still using `--sandbox workspace-write`; preceding permission-denied runs were a test-environment nesting failure, not evidence of a messaging-model failure. No approval or nested Codex sandbox was weakened. HTML messaging is restored to green with this explicit bundled evidence.

All 59 offline tests pass after the workspace guard. Final isolated helper builds (36 bundled modules), whitespace checks pass. The reusable live driver is now `experiments/acp/gateway-acceptance.mjs`; it uses actual gateway source or the compiled worker. All live runners have completed. Active service/profile remains unchanged. Remaining limits are the per-model integrated capability sweep beyond read/edit/reasoning selection, higher-effort live inference, structured web citations, usage accounting semantics and arbitrary concurrent message queues. The shared implementation is in the gateway; production activation has not occurred.

## Remaining integrated capability retests — running

User requested retesting every previously isolated passing capability still unverified in the compiled gateway. Sequential 36-case batch covers nine remaining Devin selectors: image, deferred search, live web, and two-child peer messaging (the last verifies both subagent and messaging columns). Low where available, SWE Medium and DeepSeek High. Ten-second gaps, four-minute individual bounds, private scratch state, and native Codex workspace sandbox preserved. Manifest `.build/compat-audit/integrated-retest-summary.json`; actual driver `experiments/acp/gateway-acceptance.mjs`. No active-profile changes.

## Remaining integrated retests — complete

36 capability probes across nine remaining Devin selectors completed in 41 bounded live runs, including five targeted retries. Canonical manifest `.build/compat-audit/integrated-retest-verified.json`: 35 passes, one reproduced failure (Astra Low deferred search, declared but not invoked in two attempts). All other remaining cells have passing integrated evidence. Peer retries use explicit readiness followed by idle sibling follow-up; initial active-wait failures remain recorded. SWE-1.7 search also required a retry. Prior intermediate tallies are superseded by this audited manifest.

HTML updated to actual final outcomes, including the preserved native Grok row with prior-verification labeling. Failed native spawn alias cleanup fixed and covered by regression; full suite 60/60, helper build passes. All live batch/retry processes completed with scratch cleanup, including the timed-out first SWE-1.7 peer run. No active service/profile changes. Astra deferred discovery remains a real unresolved capability; do not turn it green based on the historical isolated matrix.

## Astra Low deferred discovery — targeted follow-up running

User authorized additional Astra Low experiments. A compiled-helper run with explicit instructions to list native MCP tools on server codex before searching passed: `gateway-acp-astra-low-explicit-discovery.json` records declared/dispatched/executed/exact-result true, exit zero and scratch cleanup. This establishes that the path can work despite two earlier no-invocation failures.

Added conditional discovery guidance to the gateway ACP prompt when switchboard_tool_search is declared. It directs listing the codex MCP server, invoking discovery, refreshing the list, then executing the loaded tool. Caller schemas/permissions remain unchanged. Five focused production/search tests and helper build pass. Two compiled Astra Low controls with the original user prompt are running; do not update the table based solely on the explicit-prompt diagnostic.

## Astra Low discovery follow-up — complete

Explicit MCP listing instructions passed in a compiled diagnostic. Conditional guidance is now in gateway/transport/acp/protocol.mjs whenever switchboard_tool_search is declared: list the codex MCP server, invoke discovery, refresh, then execute the loaded tool. No permission/schema relaxation, fallback, or synthetic tool execution.

Five fresh compiled-helper controls used the original user prompt at gpt-6-astra-low: runs 1, 3, 4, 5 passed; run 2 ended without discovery invocation. All exits zero and scratch cleanup true. Last three consecutive controls passed. A separate source-path metadata trace also verified list → search → refresh → actual MCP execution. This establishes working capability but not reliable completion: HTML retains an intermittent flag rather than claiming a complete fix. Manifest `.build/compat-audit/astra-low-discovery-followup.json`; individual `gateway-acp-astra-low-gateway-discovery-{1..5}.json` evidence.

Five focused production/search tests and compiled helper build pass. All targeted live runs completed. No installed service/profile activation. Earlier two no-invocation failures remain recorded.

## Astra Low deferred search — user accepted

User explicitly considers the discovery-guidance fix complete. HTML now marks the capability accepted/green. The observed 4/5 focused result, including three consecutive final passes and one no-invocation failure, remains unchanged in the evidence. Acceptance does not imply a new test or activation.
