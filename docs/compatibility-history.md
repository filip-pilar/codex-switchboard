> Historical development record. Superseded checkpoints are retained as evidence; use [compatibility-validation](compatibility-validation.md) for current status.

# Provider compatibility validation — 2026-09-13

The researched conversion fixes are implemented and the macOS bundle is rebuilt. **This is not a claim that every model and tool passes.** Grok's ordinary coding and collaboration workflows now pass; Devin's complete Codex tool declaration is still rejected upstream.

## Changes

- Preserve valid bare Responses messages, translate the installed Codex collaboration envelope to visible messages with sender/recipient context, and retain exact Devin namespaced tool identities in history. Opaque reasoning/compaction rules remain unchanged.
- Accept the official signed-in Grok 0.2 CLI catalog format without accepting partial/error output. Recognize 4.5 and 4.6 with reviewed reasoning levels; advertise image input only for 4.6 on the Grok subscription route. New models remain opt-in; existing IDs and preferences are preserved.
- Enrich Devin entries from exact official CLI model UIDs with context limits and selector-specific reasoning. Existing variant entries remain separate; this is not a new family-grouping UI. Missing CLI metadata leaves capabilities unknown. All 152 entries / 156 unique selectors remain represented; 152 have official context metadata and 139 entries expose reasoning metadata in this run.
- Preserve custom-tool grammar when adapting to Grok functions, restore raw tool input from JSON, and emit decoded custom deltas only after complete arguments arrive. Keep normal text streaming and cancellation. Normalize safe integral `.0` arguments without rewriting quoted strings, fractional values or large integer lexemes.
- Use Codex's standard external tool surface instead of copying an OpenAI model's code-only mode. Keep the installed collaboration protocol and approval requirements. Native catalog entries and routing remain intact.
- Cached-only search never becomes live search. Unsupported cached search and image generation are explained in model instructions/catalog descriptions; deferred search is now supported on Grok 4.6 only; explicitly forcing an unavailable tool fails. Explicit live web search is supported. Already supplied ordinary function/MCP declarations remain available, but arbitrary connector discovery has not been validated.

## Isolated live results

| Check | Result |
| --- | --- |
| Devin catalog | 152 non-Claude entries, 156 distinct exact selectors; no Fusion/router integration |
| Devin text matrix | All 156 unique advertised selectors now have a successful basic inference check. Paced follow-up: 135/135 passed, zero 429s, zero retries. The earlier matrix had 20 passes/3 HTTP 429s/133 skips; SWE-2 Medium also passed separately. |
| Astra reasoning | Low, Medium, High, XHigh and Max each returned the expected marker |
| SWE-2 Medium text | Passed |
| Astra direct function call/result history | Passed |
| Astra namespaced custom call | Passed |
| Astra inline image | Correct red-left / blue-right answer |
| Actual Codex CLI through the Devin gateway with full tools | Failed; isolated upstream `CONTENT_BLOCKED` for the patch-tool declaration. Same captured request with no tools or only exec succeeded. Rejection was not bypassed. Earlier full CLI runs also reported upstream internal failures. |
| Grok model discovery | 4.5 and 4.6 discovered through the production parser, with no diagnostic registry override |
| Grok reasoning | 4.5 Low/Medium/High and 4.6 Low/Medium/High/XHigh all passed |
| Grok direct function call/result and namespaced custom tools | Both models passed |
| Actual Grok shell → patch → read | Both models exited 0; shell marker, completed patch, on-disk file contents and shell read independently verified |
| Actual Grok subagents | Both models spawned two children; child requests, wait calls and a child's `collaboration.send_message` were observed. Parent completed the receiver-confirmation scenario. No child provider errors. |
| Bundled helper | Real Grok 4.6 shell/patch/read workflow also passed using the compiled worker |
| Grok 4.6 image | Correct synthetic fixture answer, including structured output with `detail: original` |
| Actual Codex `view_image` | Grok 4.6 called the tool, consumed its result on the next request and completed without provider errors |
| Grok 4.5 image | Three identical Low-effort repeats: pass / reversed left-right / pass. Seven varied fixtures: 2/7 correct for 4.5 versus 7/7 for 4.6 controls. All completed HTTP 200 with valid structured output; visual reliability is not certified. |
| Grok 4.6 deferred tool search | Installed Codex parent and child sessions passed search → load → MCP call → result. Grok 4.5 and Devin are not certified. |
| Grok cached-only search | Coding/text request completes, no upstream web tool used, unsupported capability explained |
| Grok explicit live search | Passed; upstream web-search events and two server-side search calls observed |
| Cancellation | Client abort observed and owned route cancelled; upstream billing cessation is not measurable here |

The tests used separate temporary Codex homes, scratch workspaces, loopback listeners and the official CLI-owned provider sessions. No native account credentials were copied to external requests. The outer shell sandbox initially prevented nested Codex shell execution; successful tool tests ran outside that outer sandbox while retaining Codex's own `workspace-write` sandbox. Test homes were removed and active Codex config/auth fingerprints matched. CLI runs emitted a startup diagnostic; workflow passes are based on real actions and files, not just exit status or final prose.

## Paced follow-up

At the user's request, the unfinished matrix was resumed with one request at a time and at least 10 seconds between a response ending and the next request. Already successful selectors were skipped; exact selectors were deduplicated. The bounded harness honored `Retry-After` and configured increasing backoff for any further 429, but neither retries nor backoff were needed: **135 attempts, 135 passes, zero 429s**. Together with the previous 21 distinct Devin successes, this covers all 156 advertised selectors. This proves basic response completion for each exact selector, not complete coding/vision/collaboration functionality on each model.

The pinned adapter has its own 60-second RPM window (`src/auth.js`, `TIER_RPM`): unknown accounts are limited to 20 RPM. The earlier fast parallel run could hit that local guard, so its 429s did not establish an official upstream Devin limit. The paced run retained all guards, the same provider/account, and active config/auth fingerprints. Scratch state was removed.

## Local checks and limits

29 JavaScript tests and 25 native tests passed. Installed Codex accepted the combined catalog, Astra Max, local sentinel and SSE path fallback. Standalone helper packaging, compression limits, missing-provider isolation and bundled emergency restore passed. The updated release build passed code-signature verification. No global integration activation or restart of the running Desktop/app/service occurred.

Not established: every tool on every Devin selector, complete Devin CLI editing or actual Devin sibling messaging, all image-capable Devin families, every MCP/app connector, code-mode tooling on external models, mixed-provider parent/child combinations, or Desktop UI interactions under the new models. The local synthetic image checks do not measure general visual reliability. Provider availability and reasoning parameter acceptance do not guarantee task quality.

## Sources and evidence

The implementation uses independent focused changes informed by these pinned source references:

- [Ollama Codex collaboration normalization](https://github.com/ollama/ollama/blob/53fed26112817f7c55f664efb9e3f65f06cab7db/internal/proxy/codex_desktop_normalize.go): explicit agent envelope conversion.
- [WindsurfAPI Responses converter](https://github.com/dwgx/WindsurfAPI/blob/9d83799e26b5734d55c5ae8d16456060bb686b8f/src/handlers/responses.js): valid bare message handling. The product keeps its existing pinned dependency; external preparation fixes that boundary locally.
- [CC Switch xAI sanitization](https://github.com/farion1231/cc-switch/blob/1d5d90f4aba88447d422a16cdec5282ec5331fd7/src-tauri/src/proxy/providers/transform_codex_responses_xai_sanitize.rs): collaboration and numeric-argument compatibility evidence.
- [codex-pool Grok adapter](https://github.com/darvell/codex-pool/blob/deb84b0ae3d9e8eabbc333f546d0dda33a89965b/provider_grok.go): model-specific capability evidence, cross-checked with authenticated discovery and bounded probes.

Ignored local evidence is under `.build/compat-audit/`: `smoke.json`, `smoke-subset.json`, `smoke-paced.json`, `smoke-paced-meta.json`, `features.json`, `grok-efforts.json`, `devin-isolate.json`, `retest-patch-grammar.jsonl`, `retest-grok45-final.jsonl`, `retest-subagents.jsonl`, `retest-grok45-agents.jsonl`, `retest-compiled-grok46.jsonl`, `vision-structured.json`, `vision-original.json`, `retest-view-image.jsonl`, `boundaries-final.json`, `inventory.json` and the `retest-*.log` check outputs. These store outcomes/metadata rather than raw provider transcripts. Source snapshots and hashes are under `.build/compat-research/`.

## Image consistency follow-up — 2026-09-13

The original 160×80 red-left/blue-right fixture passed two of three Grok 4.5 repeats; one reversed the positions. Because a failure remained, seven varied images were tested once per model with Grok 4.6 controls. Requests were sequential, spaced at least 10 seconds after each response, with Low effort and strict structured output.

| Image | Grok 4.5 | Grok 4.6 |
| --- | --- | --- |
| Blue left / red right | Pass | Pass |
| Red top / blue bottom | Incorrect | Pass |
| Solid red | Pass | Pass |
| Solid blue | Incorrect | Pass |
| Green left / yellow right | Positions reversed | Pass |
| Red left / blue right at 640×320 | Incorrect | Pass |
| Red circle / blue square | Shape colors reversed | Pass |

All 17 requests completed HTTP 200 with valid schema output and no rate-limit errors. These are task-accuracy failures rather than request rejection or formatting failures. They are not confined to the original image size or left/right layout. This sample does not isolate model behavior from provider-side image handling or establish general vision accuracy. The binary status matrix keeps Grok 4.5 images unverified and now omits image generation at the user's request.

Evidence: `.build/compat-audit/vision-consistency.json`, `vision-consistency-meta.json`, `vision-variants.json`, and `vision-variants-meta.json`. Both isolated runs confirmed unchanged active config/auth fingerprints and removed scratch state.

At the image-investigation checkpoint, deferred tool search was unsupported. The [official client-executed tool-search protocol](https://developers.openai.com/api/docs/guides/tools-tool-search) suggests a feasible adapter: translate an external function call into a client search event, preserve its call ID, and expose returned tool definitions on the next provider request. This is a design inference, not validated compatibility; the installed Desktop execution mode and a complete search/load/call cycle, including child agents, still need verification.

## Grok 4.5 image investigation and local rejection — 2026-09-13

Three 900×300 PNG fixtures contain independently generated seven-character codes, never included in the prompt. Open text output replaced the earlier forced color choices. The gateway preserves image bytes through its final HTTPS request: hashes captured immediately before sending matched every fixture.

- Grok 4.5: 0/3 original code fixtures read correctly. Grok 4.6: 3/3 correct.
- Both models correctly returned the requested no-image marker on their image-absent controls.
- Bypassing Switchboard and sending two fixtures directly to the same official CLI subscription endpoint: 4.5 0/2 correct. This is not a test of the separately billed public xAI API.
- Four attempted remedies on 4.5: high image detail, original image detail, JPEG, and High reasoning. All failed the exact code check.
- Total: 14 requests, including nine image-bearing 4.5 failures, three 4.6 image passes, and two successful no-image controls. All HTTP 200, completed responses, no rate-limit errors; requests spaced at least 10 seconds after each response. Active config/auth fingerprints were unchanged and scratch state was removed.

The evidence points to unavailable/unreliable image observation on the 4.5 CLI subscription endpoint rather than Switchboard corruption. It cannot prove the provider's internal cause. The earlier 2/7 forced-choice passes do not establish working vision and may be guesses. An [independent gateway report](https://github.com/yoshino-xiao7/dsh-grok-provider/blob/yukiryou/main/docs/12-upstream-image-input-evidence.md) also records unreliable 4.5 image semantics on this endpoint and disables that capability.

No effective request-format fix was found. Grok 4.5 now advertises text input only. Image requests, including images in tool results and requests using stale applied catalogs, fail locally with `grok_vision_unavailable` and guidance to select 4.6. Request validation precedes worker startup; no image stripping or silent fallback occurs. Text/tool capability remains available. Focused registry, proxy and external compatibility checks: 22 passed, including an HTTP rejection check proving zero worker startups.

Evidence: `.build/compat-audit/vision-diagnostic-results.json`, `vision-diagnostic-meta.json`; synthetic fixture expectations under `vision-diagnostic/`. Only outcome metadata, hashes and event types are recorded, not provider transcripts. Further live requests should follow new provider evidence or a specific new hypothesis, rather than repeat these failures.

Deferred search research and concrete precedents: [implementation proposal](deferred-tool-search-research.md). That image follow-up did not implement a deferred-search adapter; see the later checkpoint below.

The updated release app/helper rebuilt and passed signature verification. The standalone compiled helper also returned `grok_vision_unavailable` for a stale-catalog image request in an isolated home, with zero worker starts. The initial compiled-check harness incorrectly queried diagnostics for worker state; corrected to the status operation and passed. No global activation or restart occurred.

## Grok 4.6 deferred search — 2026-09-13

Implemented a Grok 4.6-specific bridge for Codex client-executed search. The exact incoming search schema becomes an ordinary provider function; search call/output history is converted with stable call IDs; returned tools become callable without exposing cold deferred tools. Provider search calls are restored to native Codex search items with object arguments. Streaming function-argument fragments are suppressed for these items. Reserved-name conflicts and conflicting loaded definitions fail explicitly. Codex retains discovery, MCP execution, and approval ownership. No new service or automatic provider fallback was added.

Live checks in separate temporary Codex homes:

- Parent: three inference requests; native `tool_search_call`, returned `tool_search_output`, a namespaced MCP fixture invocation, its result, and the exact marker in the final answer were observed.
- Child: six inference requests; the parent spawned one child and waited; requests with the subagent header performed search, received definitions, invoked the MCP fixture, and returned its marker to the parent. All routed to Grok 4.6. Request starts were spaced at least 10 seconds apart for this run.
- Both completed with exit 0 and matched active config/auth fingerprints. No provider-error events or HTTP 429s were observed. A CLI startup diagnostic is tracked separately from the successful tool workflow.

All 35 JavaScript checks passed, including search history, empty search results, reserved names, forced-choice validation, namespace replay, duplicate definitions, malformed arguments, and fragmented SSE. Existing proxy cancellation checks also passed. The release app/helper rebuilt and passed signature verification.

Ignored evidence: `search-cli.json`, `search-child-cli.json`, `search-mcp-calls.jsonl`, `search-unit-tests.log`, and `search-build.log` under `.build/compat-audit/`. Actual connector catalogs beyond the controlled read-only MCP fixture, Devin deferred search, and new Desktop UI interactions remain unverified.

Packaged adapter follow-up: the installed Codex CLI completed the same three-request search/load/call sequence using the rebuilt standalone Grok worker, with the MCP invocation and exact final marker verified. Requests were spaced at least 10 seconds apart; active config/auth remained unchanged. `search-compiled-cli.json` records the pass. Its only CLI diagnostic occurred before `turn.started` and was classified as a configuration/skill/feature warning; there were no tool-result errors or failed turns. No app activation or Desktop restart occurred.

## Grok 4.5 retired — 2026-09-13

The user subsequently requested removing the entire model, not only vision. Direct Grok 4.5 and Devin `grok-4-5-*` entries are now incompatible and omitted from refreshed catalogs. Routing checks reject old applied entries with `model_retired` before provider startup. Prior 4.5 feature passes above are historical evidence, not current product support. No model/account is automatically substituted.

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

## SWE-1.7 focused acceptance — 2026-09-13

The user authorized making one inexpensive model work before moving on. This pass tested only Devin `swe-1-7` and `swe-1-7-medium`; it did not activate the integration or change the active model.

| Feature | Evidence and remaining scope |
| --- | --- |
| Text / reasoning selectors | Both exact selectors completed fresh function/history and final-answer probes, with reasoning stream events. This verifies selector operation, not reasoning quality or arbitrary effort values. |
| Function/custom tools | Both passed a function call plus matching result replay, and a namespaced custom-tool invocation. |
| Images | Default read all three random seven-character image cards correctly, and said `NO_IMAGE` for the unattached control. Medium read its independent card correctly. Production source requests then passed on both selectors without a capability override. |
| Native file edits | Full installed Codex CLI failed before tool execution. Isolating its captured request showed no-tools and exec-only pass; patch-only and full declarations returned `CONTENT_BLOCKED`. No policy bypass attempted. |
| Native subagents / messaging | Remain unverified; the full Codex tool declaration is rejected upstream before these workflows can begin. No fake or simulated agents counted as a pass. |
| Built-in live web | The pinned handler returned a `web_search_call` but no executed search/result. Source inspection confirms a function conversion rather than an execution backend. The SWE bridge now removes that unavailable declaration with a capability notice and rejects forced requests locally. Client-owned search tools remain separate. |
| Deferred tool search | Fixed native client-call mapping, exact incoming schema, discovered tool loading, namespaced replay, SSE/JSON output restoration and stable call IDs. Both selectors passed three live gateway requests: search → load/call → return a random fixture result. This is a controlled protocol fixture, not full installed Codex/MCP or child certification; the latter remains blocked by the patch declaration. |

Vision overlays apply only to the two exact selectors, and a later explicit provider `images:false` takes precedence. Deferred search adaptation likewise applies only to these selectors. Tests cover catalog/request vision, adjacent-model isolation, immutable declarations, malformed history, namespace/loading identity, UTF-8 stream chunks, JSON responses, credential-preserving proxy integration and unavailable web semantics. The 39-test suite passed before the final proxy/web regressions; all 22 affected checks passed afterward.

All diagnostic probes after the initial installed-CLI baseline used 10-second request slots or response-to-next-request spacing. The initial CLI baseline retried its stream failure automatically. The first vision fixture incorrectly requested Low on a selector without that control and failed locally without inference; the corrected fixture removed the unsupported parameter. One discovery timeout prevented a search harness from starting; a subsequent discovery succeeded. Evidence files contain metadata/outcomes only, not provider transcripts or credentials.

Evidence: `.build/compat-audit/cli-swe-1-7.json`, `swe-features.json`, `swe-isolate.json`, `swe-vision-results.json`, `swe-vision-production-results.json`, `swe-builtins.json`, `swe-search.json` and matching metadata files. The matrix marks deferred search as passing with its fixture scope explicitly stated; it does not mark native editing/collaboration or web as passing. The upstream project's own [image-wire evidence](https://github.com/dwgx/WindsurfAPI/blob/master/README.md) informed the diagnostic; the capability decision rests on this pass's direct tests.

Packaged validation also passed: both production image probes succeeded through the compiled Devin worker, the app rebuilt and signature verification passed, and a full compiled gateway fixture rejected forced unavailable web search before worker startup. No global config/auth changes occurred.

### Custom-tool grammar follow-up

The pinned Devin Responses converter drops `custom.format`. The gateway now retains the full grammar in description guidance for normal and deferred-loaded custom tools, including namespaces. Original descriptions are preserved verbatim; Codex remains responsible for validation. Two fresh paced SWE-1.7/default and Medium fixtures returned the exact random value supplied only by the grammar, with correct custom call type/name/namespace. Evidence: `.build/compat-audit/swe-grammar.json` and `swe-grammar-meta.json`; global config/auth unchanged. All 23 affected regression checks passed, and the release rebuilt and signature-verified.

The separate [upstream content-block change](https://github.com/dwgx/WindsurfAPI/commit/67b8357031e006e08fa6a110e449cc8236e1866e) intentionally rewrites filter-triggering text. It was inspected but not adopted or live-tested. The full native editing/collaboration status remains unchanged; resolving that rejection requires a provider-supported correction or integration contract.

### Low/default editing matrix — 2026-09-13

Fresh installed-Codex editing checks now cover eight retained Devin families: Astra, Gemini 3.8 Flash, GPT-5.6 Sol/Terra/Luna and Devin Grok 4.6 at Low, plus SWE-1.7 and SWE-1.7 Lightning at their upstream default. All eight returned `CONTENT_BLOCKED` before any patch execution. Each used one request; 10-second request slots prevented bursts, and the harness stopped each owned scratch CLI on the first provider failure rather than allowing repeated stream retries. No HTTP 429s occurred. All eight scratch files retained their original contents. SIGTERM in this evidence records deliberate post-error cleanup, not the cause of failure.

SWE-2 and DeepSeek V4.1 Flash do not advertise Low, so they were skipped under the requested budget constraint pending an exception for Medium/High. Direct Grok 4.6 was not retested; this pass concerns Devin routes. This supports a shared request-policy issue across the tested families, not a claim about every reasoning selector or native subagent capability in isolation. No provider-policy evasion or production-code changes were attempted in this matrix pass.

Evidence: `.build/compat-audit/edit-matrix-low.json`, `edit-matrix-low-meta.json` and `edit-matrix.mjs`. Eight requests, zero edit passes, active configuration/auth fingerprints unchanged. The Browser table notes were updated and visually verified. No activation, restart or rebuild was needed.

### Official Devin harness comparison — 2026-09-13

Official Devin CLI 3000.10.21 successfully edited a single scratch file with `gpt-5-6-luna-low` in both configurations:

| Official configuration | Observed tool contract | Verified result |
| --- | --- | --- |
| Normal tools | `read(file_path)` → `edit(file_path, old_string, new_string)` → `read(file_path)` | Exact expected file contents; exit 0 |
| `agent.codex_tools: true` | `apply_patch` with raw string input | Exact expected file contents; exit 0 |

The final Codex-tool run used a corrected hook that handles string input, restricts patches to one fixture, and blocks unrelated tool actions. It recorded two pre-tool events and one completed patch event. Both modes retained normal permission checks with narrow fixture permissions and normal workspace trust. Scratch XDG state, copied credentials and CLI session data were removed; retained evidence contains only tool names, argument types, outcomes and counts. Evidence: `.build/compat-audit/official-devin-normal.json` and `official-devin-codex.json`. Refusal fallback was explicitly unset for these runs.

This establishes model editing ability through the official harness, not successful Codex gateway editing. The pinned adapter converts custom tools to JSON functions with an `input` string, does not emit native `custom_tool` declarations, and moves descriptions into a prompt preamble while using tool names in the wire description field. These are concrete adapter differences; hooks observe execution input, not the official wire schema, so causality for `CONTENT_BLOCKED` remains unproven. No guessed protobuf tags or filter-trigger rewrites were implemented. The next compatibility investigation should establish the native custom-tool declaration and history contract before changing the transport.

Official references: [Codex-tool mode changelog](https://docs.devin.ai/cli/changelog/stable), [configuration](https://docs.devin.ai/cli/reference/configuration/config-file), [hook contracts](https://docs.devin.ai/cli/extensibility/hooks/overview).

### Native contract and ACP investigation — 2026-09-13

Static inspection of installed Devin 3000.10.21 found `ToolDefinition` with `parameters`, `custom_tool`, `defer_loading`, and `strict`, plus `CustomToolConfig` with `grammar`, `grammar_syntax`, and `native_description`. These identify internal fields, not verified protobuf tag numbers or field types. No native wire schema was recovered, and no speculative transport changes were made. The pinned Responses adapter also wraps custom-tool history input in JSON `{input: ...}`, consistent with its function declaration conversion; that conversion alone is not proof of the rejection's cause.

A fresh no-auth, no-inference ACP initialization succeeded using the truthful `codex-switchboard` client identity and protocol version 1. The official CLI advertised session loading, image and embedded-context prompts, and session management. Filesystem and terminal client capabilities were explicitly disabled for this handshake; no session or prompt was submitted. Scratch XDG state was removed. Evidence: `.build/compat-audit/devin-acp-handshake.json` and its bounded runner. This contradicts applying older third-party identity-shim requirements to this installed version; no identity shim is needed for initialization.

ACP is a promising supported harness interface, but initialization does not verify file editing, arbitrary caller-defined tools, Responses turn boundaries, cancellation, or Codex child-agent communication. A bridge would need to return tool actions to Codex for approval/execution and resume the paused Devin session on tool results. It must not quietly execute edits inside a second harness or treat tool notifications as executable tool requests. The next bounded experiment should test client-mediated filesystem actions and permission requests before deciding whether this interface can satisfy the product boundaries.

Public comparison: [acpx Devin adapter notes](https://github.com/openclaw/acpx/blob/main/agents/Devin.md), [Devin ACP client example](https://github.com/QAInsights/devin-mcp). These are implementation references, not evidence of Switchboard compatibility.

### ACP client-executed editing and cancellation — 2026-09-13

A bounded official Devin ACP prototype on GPT-5.6 Luna Low passed the execution-boundary experiment. Devin requested `fs/read_text_file`, requested edit permission, then issued `fs/write_text_file` for the exact fixture. The prototype checked the target and complete expected contents and held the write request unanswered. The file was still unchanged at that point. Codex's actual `apply_patch` tool then changed the scratch file; only after independently verifying the new contents did the prototype acknowledge the ACP write. Devin continued and returned `end_turn`. This was a manually mediated Codex tool action, not an implemented automatic Responses adapter.

Permission requests can contain only `toolCallId`. Their kind and arguments must be joined with earlier `session/update` tool-call notifications. Initial conservative runs rejected incomplete/unmatched requests and left the file unchanged. The corrected prototype merged updates by ID, allowed only the exact fixture edit once, denied unrelated callbacks, and advertised no terminal support. No trust bypass or global permission changes were used.

A separate run cancelled at the pending write callback, returned a cancellation error without executing the write, and received `stopReason: cancelled`. After a ten-second pause, a follow-up prompt in the same session produced a fresh client filesystem read and `end_turn`; the file remained unchanged. This verifies cancellation plus in-process continuation, not persistence across process restarts.

Evidence: `.build/compat-audit/devin-acp-edit-pass.json`, `devin-acp-edit-denied.json`, `devin-acp-cancel.json`, and the bounded `devin-acp-edit.mjs` prototype. Five prompt turns total across four runs, all Luna Low; no parallel inference. Each scratch process had a 90-second cap, isolated XDG state and narrowly scoped callbacks. Temporary credentials and session state were removed after each run. Only metadata/outcomes were retained. Syntax validation passed for the prototype; no production rebuild or activation occurred.

Next implementation boundary: maintain a paused ACP session across Responses tool-call/result turns, map requested writes to caller-declared Codex tools, preserve cancellation and call IDs, and never acknowledge an action before the caller actually executes it. Arbitrary tools, deferred discovery, images, and Codex subagents remain unverified through ACP. Do not mark the production gateway file-edit column as passing based on this prototype.

### Automatic installed-Codex / ACP edit pass — 2026-09-13

The isolated Responses-to-ACP prototype now automates the complete fixture handoff. Installed Codex received real function calls for reads and a custom `apply_patch` call for the edit, executed them under its `workspace-write` sandbox, and submitted tool results on subsequent Responses requests. The prototype held each corresponding ACP callback until the result arrived. Devin verified the edited file and completed its prompt with the success marker. Evidence confirms a completed Codex file-change event, successful verification command output, exact on-disk contents, and Codex exit 0. Seven client actions crossed eight Responses requests within one ACP prompt; those eight HTTP requests are not eight new user prompts.

Two setup problems were resolved: copying the native Luna catalog template omitted tool declarations, so the test now uses Switchboard's external-model catalog generator; the outer execution sandbox prevented the nested Codex shell from returning fixture contents, so the successful run used the approved outer-sandbox escalation while preserving Codex's own workspace-write restrictions. Earlier incomplete runs are not passes.

This is deliberately a single-file experiment: its write translation validates the fixture path/content and emits a fixed matching patch. It is not a general write-to-patch converter, does not forward the complete caller instruction hierarchy or arbitrary tools, and is not registered as a production route. The prototype's final-message buffering, placeholder usage counters, lifecycle and error handling require replacement before production integration. Do not treat this as production compatibility or support for all Luna reasoning levels.

Evidence: `.build/compat-audit/devin-acp-responses-pass.json` and `devin-acp-responses.mjs`. The script passed syntax checking. Scratch credentials, sessions and workspaces were removed. The HTML table gained a separately labelled Luna Low ACP experiment row with text, tool calls and file edits marked verified; the normal Luna row remains unchanged.

### SWE-2 Medium ACP capabilities — 2026-09-13

At the user's request, continued ACP testing on `swe-2-medium`, SWE-2's lowest advertised reasoning level. The installed-Codex automatic editing fixture passed: real shell reads, completed custom patch, verification output, exact file contents, final marker and exit 0. An additional requested write was denied by the narrow fixture permission policy; the completed result remained correct. This is still the fixed-fixture adapter, not general production editing.

Added image-input forwarding to the experimental bridge: Codex data-URL image inputs become ACP image content blocks with the same media type and bytes. Two existing synthetic seven-character cards were read exactly; a separate no-image prompt returned `NO_IMAGE`. All three went through installed Codex and the ACP bridge, used no tool callbacks, and exited 0. The first image invocation failed in CLI argument parsing before inference; adding `--` after the variadic image option corrected it. The successful runs used isolated profiles and scratch copies of the images; no raw responses or image bytes were logged.

Evidence: `.build/compat-audit/devin-acp-swe2-responses.json`, `devin-acp-swe2-vision-0.json`, `devin-acp-swe2-vision-1.json`, `devin-acp-swe2-vision-control.json`; runners `devin-acp-swe2-responses.mjs` and `devin-acp-swe2-features.mjs`. Scratch credential/session/workspace state was removed. Syntax checks passed. No production transport changes, activation or build were performed.

The HTML table gained a separate SWE-2 Medium ACP experiment row with text, images, tool calls and file edits checked. Reasoning-level switching, subagents, messaging, live web and deferred search remain unverified. The ordinary SWE-2 production row is unchanged.

SWE-2's separate ACP cancellation test also passed: cancel at the pending client write, receive `stopReason: cancelled`, verify no mutation, then after ten seconds continue the same session and receive a fresh read plus `end_turn`. Evidence: `.build/compat-audit/devin-acp-swe2-cancel.json`. This is the direct ACP control, not an HTTP disconnect test of the automatic bridge.

### SWE-2 reasoning and MCP discovery — 2026-09-13

Official ACP session metadata exposes `swe-2-medium`, `swe-2-high`, and `swe-2-max` as model selectors, rather than a separate reasoning option. A zero-inference round trip switched High → Max → Medium and verified each returned `currentValue`. Added mapping from Responses `reasoning.effort` to the corresponding exact selector in the experimental bridge; unsupported values fail before inference and selection is checked before the prompt. A fresh installed-Codex Medium control passed with requested and actual `swe-2-medium`. No High/Max inference was performed under the budget preference. This proves routing/selection, not comparative reasoning quality. The explicitly Medium experimental row now marks reasoning verified; the ordinary SWE-2 row remains unchanged.

The first three arbitrary MCP fixtures supplied via `session/new.mcpServers` initialized, but Devin's model-side `mcp_list_servers` did not expose the server and `mcp_list_tools` returned not-found. Configuring the same fixture through official `devin mcp add --scope user` in the isolated XDG test profile fixed discovery. The initial configured run reached the fixture call but was conservatively denied; after adding an exact tool-name/key allow-once check, the sequence passed: list servers → list tool schemas → request permission → call → exact random result. The fixture recorded `tools/list` and `tools/call`; no value was present in the model prompt. Temporary MCP configuration, credentials, workspace and sessions were removed.

This establishes native Devin MCP discovery/execution for a controlled arbitrary tool. It is not the Codex deferred-search protocol or Codex subagent execution. Those columns remain unverified. Next is relaying configured MCP calls to caller-declared Codex tools rather than executing the fixture in Devin's MCP subprocess.

Evidence: `.build/compat-audit/swe2-acp-config.json`, `swe2-acp-mcp-session-failure.json`, `swe2-acp-mcp-configured.json`, and updated `devin-acp-swe2-vision-control.json`. Experimental runners passed syntax checks. No production integration or activation.

### Caller-function relay through installed Codex — 2026-09-13

Added an experimental stdio MCP relay that describes the function tools declared by the current Codex Responses request. It obtains schemas from a private loopback broker and forwards MCP calls to pending Responses function calls. It does not execute shell/file operations itself. The broker preserves the selected name and arguments, restores any declared namespace in the Responses call, correlates results by call ID, and waits for the real caller result before completing the MCP request. The scratch endpoint uses a random capability, rejects browser origins and undeclared tools, and bounds incoming payloads. Flat function tools are the verified scope; namespace collisions, custom tools and dynamic/deferred declarations still need work.

Three sequential SWE-2 Medium runs passed with installed Codex under workspace-write:

| Control | Evidence |
| --- | --- |
| Read unknown random fixture value through MCP → Codex exec_command | One real command, exit 0, exact random value returned by Devin |
| Start delayed command, receive session ID, then call write_stdin | Both declared functions invoked by Devin, results returned through the relay, exact final value |
| Intentional exit 7 | Codex command failed with exit 7; Devin correctly reported that failure, without retry |

The MCP approval grants only dispatch through the relay; actual execution remains Codex-owned. These tests do not certify declined Codex approvals, HTTP-disconnect cancellation, concurrent child sessions or arbitrary media/tool result types. The experimental broker still uses a single session and retains other fixture-only limitations documented above. No production route was added or activated.

Evidence: `.build/compat-audit/swe2-caller-relay-read.json`, `swe2-caller-relay-poll.json`, `swe2-caller-relay-error.json`; runners with matching names and `acp-caller-relay.mjs`. Three prompt turns, seven Responses exchanges, four caller tool actions. Scratch profiles, MCP configuration, credentials and files were removed after each run. Syntax checks passed. The experimental table note now records stronger tool-call evidence; the four unverified columns remain unchanged.

### Session isolation and disconnect lifecycle — 2026-09-13

Added a reusable experimental pending-call component in `experiments/acp/session-calls.mjs` and integrated it into the scratch relay. Opaque session handles own bounded pending calls. Results must match an issued call in that session; premature, cross-session, duplicate and late results are rejected. Cancellation rejects queued and issued calls, closes the handle and notifies ACP. Normal completed SSE tool handoffs retain the pending call until a subsequent Responses request supplies its result. Three focused offline tests passed, covering these boundaries and resource limits.

Two initial live single-session controls passed. A subsequent timestamped pair, started ten seconds apart, overlapped for 17.1 seconds: each returned its own exact random fixture value, exited 0, removed scratch state and ended with zero pending sessions. These are independent Codex/ACP processes; they verify concurrent isolated workers, not child-agent routing through a shared production listener. Evidence: `.build/compat-audit/swe2-session-overlap.json` and `swe2-overlap-{a,b}.json`.

Injected a socket disconnect while a caller tool was pending but before dispatch to Codex. ACP returned `cancelled`, no caller command was emitted/executed, and the pending session count reached zero. The first run exposed an erroneous generic completion fallback on a retry. The driver now rejects requests to cancelled sessions with HTTP 409 / `session_cancelled`. The fresh cancellation run returned ACP `cancelled`, emitted no final success, and removed scratch state; the harness terminated its owned Codex process after 1.5 seconds to stop retries. This is not a test of cancelling an already-running shell process, nor does it certify the Desktop's cancellation UI. Evidence: `.build/compat-audit/swe2-session-disconnect-fixed.json`.

The component remains outside production imports. No app rebuild, activation or live configuration change occurred. Next: associate actual Codex parent/child identities with isolated ACP sessions and wire spawn/wait/message tools. Subagents and messaging remain unverified.

## Native Codex subagent result — 2026-09-13

SWE-2 Medium ACP **subagent fixture passes**: an actual fresh Codex child (`fork_turns=none`) executes a read through the Codex executor, returns a previously unknown random file value, and the parent response contains that exact value. Parent MCP exposure is restricted to collaboration tools, so it cannot substitute its own read. Two successive runs confirm value propagation (`swe2-agent-worker-{1-74a7bf,2-25f46f,1-2f869e,2-0d58bd}.json`, `finalChecks[].hasValue`). Both runs exit normally and remove scratch state with zero pending sessions.

This verifies child execution and result delivery, not the entire combined test: strict final formatting and the requested follow-up `ACK_` transformation fail. The child receives follow-ups but repeats the initial answer. Agent messaging remains red. The HTML SWE-2 Medium experiment row has one new subagent check; ordinary provider rows and production activation are unchanged.


## Shared ACP matrix result — 2026-09-13

The same parameterized bridge was used with installed Codex and official Devin ACP in isolated scratch profiles. Caller-tool tests required a real Codex-executed read and the exact random file value. Edit tests required a completed Codex patch and exact final file contents (bounded BEFORE_EDIT → AFTER_EDIT fixture). Image tests required both ordered seven-character cards and an independent no-image control. The two existing image passes were not rerun.

| Exact Devin selector | Caller tools | File edit fixture | Low selector readback | Images this batch |
|---|---|---|---|---|
| gpt-6-astra-low | Pass | Pass | Pass | Earlier pass; not rerun |
| gemini-3-8-flash-low | Pass | Pass | Pass | Pass |
| gpt-5-6-sol-low | Pass | Pass | Pass | Pass |
| gpt-5-6-luna-low | Pass | Pass | Pass | Pass |
| gpt-5-6-terra-low | Pass | Pass | Pass | Pass |
| grok-4-6-low | Pass | Pass | Pass | Pass |
| swe-1-7-lightning | Pass | Pass | Upstream default; no effort claim | Pass |
| swe-1-7 | Pass | Pass | Upstream default; no effort claim | Earlier pass; not rerun |

Evidence: `.build/compat-audit/matrix-{read,edit,image}-*.json` and `shared-matrix-summary.json`. Reusable probe: `experiments/acp/capability-probe.mjs`, MCP relay: `experiments/acp/caller-relay.mjs`. Sequential starts with ten-second gaps; no provider fallback or working-profile activation. Cleanup checks cover scratch removal and zero pending broker sessions. DeepSeek remains skipped because its lowest advertised effort is High. Subagent/messaging/web/deferred checks were not expanded in this batch. Earlier direct-route CONTENT_BLOCKED failures remain historical evidence for that route; they no longer describe the ACP edit fixture.


## Corrected subagent/messaging matrix — 2026-09-13

Nine exact Devin selectors pass real Codex child execution and an idle-child follow-up round trip: Astra Low, Gemini Flash Low, Sol Low, Luna Low, Terra Low, Devin Grok 4.6 Low, Lightning default, SWE-1.7 default and SWE-2 Medium. Each final fixture used three prompts: parent, initial child, child follow-up. The child performs a Codex-owned read of an unknown random value; parent file reads are denied. The parent then sends followup_task, the child returns ACK_ plus that same value, and the parent returns the acknowledgement. All nine final fixtures exit zero, remove scratch state and leave zero pending sessions.

The readable-only adapter first failed on Gemini/Sol/Luna/Terra. Metadata proved their actual assignments were in encrypted_content; readable text omitted the task. A harness cancellation also interrupted Lightning after the runner advanced, so that attempt is not a model failure. The corrected fixtures above supersede those attempts. The fix retains outgoing plaintext task arguments and generated child replies in memory instead of trying to decode the encrypted blocks.

Code: experiments/acp/{agent-probe,agent-worker,child-relay}.mjs. Evidence: .build/compat-audit/matrix-messages-*.json and agent-matrix-summary.json. Six focused ACP tests pass. Scope is one actual Codex child and parent/child follow-up, not peer-to-peer messaging, a multi-child identity resolver, or production activation. No raw task/reply text is persisted. The HTML merges Luna/SWE-2 experimental duplicates into family rows and preserves exact selector scope. Web/deferred search remain unexpanded in this batch; DeepSeek High remains skipped under the usage budget.

## Native ACP web and deferred-search matrix — 2026-09-13

Nine exact selectors now pass both fixtures: gpt-6-astra-low, gemini-3-8-flash-low, gpt-5-6-sol-low, gpt-5-6-luna-low, gpt-5-6-terra-low, grok-4-6-low, swe-1-7-lightning, swe-1-7 and swe-2-medium. All 18 selected successful runs exit zero, remove scratch state and leave zero pending sessions. Requests were sequential with ten-second gaps. DeepSeek High remains skipped.

Deferred search uses the actual Codex client tool_search declaration, loads a previously deferred MCP tool, executes it in Codex and returns its unknown random value. The bridge reuses prepareDevinSearch/restoreDevinSearchEvent and emits MCP tools/list_changed after loading. Initial naming failures exposed short-vs-qualified caller names and Terra's duplicate relay prefix. The final resolver preserves namespace identity, permits unique short aliases and normalizes at most one redundant relay prefix after exact lookup; unknown/ambiguous names remain denied. Discovery results identify the configured relay. Gemini's corrected retry and Terra's prefix-corrected retry both pass; earlier failures remain saved. Six focused lookup/schema/stream tests pass.

Web checks require an explicitly live-enabled declaration, a completed native Devin web_search, an emitted Responses web_search_call observed as a Codex web_search item, and an answer containing the official MCP documentation URL and notifications/tools/list_changed method. The first diagnostic accidentally used a cached-only declaration; that result is excluded. A subsequent guard rejects cached-only requests before inference (zero prompts), and the final live fixtures pass. Native search summaries lack source URLs, so these checks do not establish citation payload fidelity or every web action.

Evidence manifest: .build/compat-audit/search-web-summary.json. It identifies each exact selected run; web-cached-guard.json records the negative control. Probes: experiments/acp/{search-probe,search-caller-relay,search-fixture,tool-names,web-probe}.mjs. HTML gains 17 checks (SWE-1.7 deferred search was previously green), bringing the displayed matrix to 90/99. The remaining nine crosses are Lightning configurable reasoning and eight DeepSeek capabilities. Family checks retain exact-selector/fixture scope. These experiments are not imported into or activated as production backends; multi-child identity, peer messaging, full instruction fidelity, usage reporting and production lifecycle hardening remain separate work.

## SWE-1.7 reasoning correction and Lightning verification — 2026-09-13

Fresh official `devin models list --format json` labels swe-1-7 and swe-1-7-lightning as **Max**, and their -medium variants as **Medium**. Earlier descriptions of unsuffixed runs as merely "default" were incomplete: those runs used Max despite the scratch client's Low setting. No new Max inference was run for this verification. Catalog evidence: .build/compat-audit/swe17-reasoning-catalog.json.

One isolated Lightning Medium run passed: incoming Codex Medium effort, exact ACP selector set/readback to swe-1-7-lightning-medium, 55 agent_thought_chunk events, real Codex tool execution and exact random-value response. Exit zero, scratch removed and zero pending sessions. Evidence: .build/compat-audit/lightning-reasoning-medium.json. Thought text was not persisted. This establishes upstream reasoning and Medium selection, not reasoning display in the Codex UI. HTML reasoning is now green with that explicit scope (91/99 total). Production discovery currently derives effort from UID suffixes and misses unsuffixed Max labels; that mapping remains to be corrected before production integration.

## DeepSeek V4.1 Flash complete fixture matrix — 2026-09-13

User authorized testing the lowest supported High selector. Exact selector deepseek-v4-1-flash-high passes all nine displayed capabilities: text, reasoning selection, images, caller tools, file edits, one native child, parent/child follow-up, live web and deferred search. Seven sequential fixtures ran with ten-second gaps (the child fixture uses three conversation prompts). All passed on their first attempt with the existing probes; no adapter change was needed.

Reasoning evidence includes exact High selector readback and nine ACP agent_thought_chunk events; Codex reasoning display remains untested. Images require both ordered random-code cards and a no-image control. Edits require a completed Codex patch and exact file contents. Child evidence requires child-only reading, exact value propagation and ACK follow-up. Deferred search verifies real discovery/load/MCP execution with an unknown random value. Web verifies native completion, a Codex web_search item and the expected documentation answer. Each completed profile exited zero, removed scratch state and cleared pending sessions.

Evidence: .build/compat-audit/deepseek-{read,edit,image-pair,image-control,search,web}.json, matrix-messages-deepseek-v4-1-flash-high.json and deepseek-summary.json. Eight new table checks; 99/99 displayed cells are now green. Scope remains exact selectors and bounded experimental fixtures, not all reasoning levels, arbitrary tools, peer/multi-child messaging, citation payload fidelity or production readiness. Max was not tested; no activation or production changes occurred.

## Real gateway integration acceptance — 2026-09-13

Production source paths now implement ACP: `gateway/transport/devin-acp.mjs`, `gateway/transport/acp/`, `gateway/service/worker.mjs`, and the helper's bundled `--acp-relay` entry. Tests below use the actual proxy and transport; packaged runs use `.build/acp/switchboard-helper --worker devin`.

| Acceptance | Exact selector(s) | Result / evidence in `.build/compat-audit/` |
|---|---|---|
| Compiled worker read → custom apply_patch → verify | gpt-6-astra-low, gemini-3-8-flash-low, gpt-5-6-sol-low, gpt-5-6-terra-low, gpt-5-6-luna-low, swe-1-7-lightning-medium, swe-2-medium, grok-4-6-low, deepseek-v4-1-flash-high, swe-1-7-medium | 10/10 pass, `gateway-acp-matrix-*.json`; exit zero, contents verified, cleanup true |
| Input image | swe-2-medium | Pass, `gateway-acp-image.json` |
| Deferred discovery → load → actual caller MCP result | swe-2-medium | Pass, `gateway-acp-search.json`; initial integration failure exposed SWE-only proxy gate, now generalized |
| Native live web → Responses search event → official answer | swe-2-medium | Pass, `gateway-acp-web.json` |
| Native web denied without a live declaration | swe-2-medium | Pass, `gateway-acp-web-denied.json`; no native web call or client search event |
| Two real children, parent does not read value | swe-2-medium | Pass, `gateway-acp-agents-verified.json` |
| Reader child → checker child follow-up → parent ACK | swe-2-medium | Pass semantically, `gateway-acp-peer-final.json`; extra final formatting means exact-only output check false |
| Reasoning mappings | 39 retained selector/effort combinations | Offline discovery → catalog → routing test passes; exact live selection/readback on ten budget selectors |

Low is used where advertised, Medium for both SWE-1.7 families/SWE-2, High for DeepSeek. Sequential requests have ten-second gaps. No installed configuration or active service switch. The initial child probe used incorrect Codex feature configuration; a later peer teardown exposed an unhandled pending-call rejection, fixed by cancellation-safe handling. Foreign/concurrent rejection no longer disposes the rightful active session. These failures remain part of the diagnostic history rather than being counted as passes.

Reasoning mappings are not proof of displayed thought text on every turn. Text-only tool results and inline input images are covered; every multimodal tool-result form is not. Native citation annotation fidelity, usage snapshot accounting and arbitrary simultaneous agent message queues remain unverified. The historical 99/99 fixture matrix is not a claim of 99/99 integrated acceptance.

Packaged diagnostic follow-up: two peer repeats and a two-child repeat failed to read the fixture; metadata-only caller result classification showed permission denials (not missing-file or unknown-tool failures). These diagnostic commands were launched inside the outer command sandbox. A controlled retest runs outside that outer wrapper while preserving the nested Codex `--sandbox workspace-write` setting and approvals. Do not count the denial runs as model incompatibility or mark the retest passed before its evidence arrives. The separate ACP cwd guard is a tested containment improvement, not an established explanation for the permission errors.

**Final packaged result:** `gateway-acp-packaged-peer-native-sandbox.json` passes with exit zero, exact ACK, actual child `followup_task` containing the random value, no parent fixture read, and cleanup true. Running outside the outer command sandbox resolves the prior permission-denied repeats while the nested Codex command retains `--sandbox workspace-write`. This establishes compiled multi-child/sibling-flow acceptance for SWE-2 Medium. It does not establish every model or arbitrary concurrent mailbox workloads. Final offline suite: 59/59; final helper bundle: 36 modules.

## Compiled gateway cross-model retest — 2026-09-13

User requested fresh integrated acceptance for every remaining Devin capability. Final result: **35/36 capability probes pass**, over **41 bounded runs** (31 first-pass successes, five targeted retries, four retry successes). Ten-second gaps; Low where available, Medium for SWE-1.7 families, High for DeepSeek. Every run used the compiled private worker with native Codex workspace sandbox and scratch cleanup. No production activation.

| Exact selector | Image | Deferred search | Live web | Two children / peer follow-up |
|---|---|---|---|---|
| gpt-6-astra-low | Pass | Fail (2 attempts) | Pass | Pass (retry) |
| gemini-3-8-flash-low | Pass | Pass | Pass | Pass |
| gpt-5-6-sol-low | Pass | Pass | Pass | Pass |
| gpt-5-6-terra-low | Pass | Pass | Pass | Pass |
| gpt-5-6-luna-low | Pass | Pass | Pass | Pass |
| swe-1-7-lightning-medium | Pass | Pass | Pass | Pass (retry) |
| grok-4-6-low | Pass | Pass | Pass | Pass |
| deepseek-v4-1-flash-high | Pass | Pass | Pass | Pass |
| swe-1-7-medium | Pass | Pass (retry) | Pass | Pass (retry) |

Astra Low deferred search is a reproduced failure: the client declared tool search, but neither attempt dispatched it or executed the laboratory fixture. Gemini/Sol/Terra/Luna/Lightning/Devin Grok/DeepSeek/SWE-1.7 all completed discovery, actual fixture execution, and exact random-value delivery. The batch scorer was corrected to recognize restored native `tool_search_call` events; the canonical manifest is `.build/compat-audit/integrated-retest-verified.json`, not the initial console scoring.

Peer retries for Astra, Lightning and SWE-1.7 used an explicit READY turn followed by a direct sibling follow-up. Original active-wait failures/timeouts remain in their `previous` evidence entries. SWE-1.7 initial search discovered tools but did not execute the fixture; its retry passed. These passes do not certify arbitrary active message queues.

Fixed a separate failure-handling bug: a failed native spawn without an assigned UUID could leave an ambiguous task alias when retried. Failed-spawn records are now removed; focused regression and full 60-test suite pass. Final helper builds; no installed service/configuration changes.


## Astra Low discovery guidance — focused follow-up

The explicit-discovery compiled diagnostic passed. The gateway now includes conditional guidance for listing the codex MCP server before invoking deferred discovery and refreshing loaded tools. With that change, **4/5 compiled original-prompt controls passed**, including the last three consecutively. Each pass requires client declaration, restored tool-search dispatch, actual laboratory execution, exact random-value answer, zero exit and cleanup. The remaining control ended without discovery invocation. A source-path trace independently shows native mcp_list_tools → switchboard_tool_search → refresh → loaded read_lab_beacon execution.

Evidence: `.build/compat-audit/astra-low-discovery-followup.json` and `gateway-acp-astra-low-gateway-discovery-1.json` through `-5.json`. Explicit diagnostic: `gateway-acp-astra-low-explicit-discovery.json`; metadata trace: `gateway-acp-astra-low-discovery-native-events.json`. This is a small-sample observed result, not an estimated production success rate. Astra remains flagged intermittent. No synthetic calls, provider fallback, permission changes, higher reasoning or activation.
