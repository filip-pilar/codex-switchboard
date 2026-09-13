# Provider compatibility validation

## Accepted matrix — 2026-09-13

Checks apply to the exact selectors below through the gateway. ✅ means verified or explicitly accepted within the recorded scope, not every workflow or reasoning level. The working installed service has not been activated with this build.

| Model | Text | Reasoning selection | Images | Tool calls | File edits | Subagents | Agent messaging | Live web | Deferred tool search |
|---|---|---|---|---|---|---|---|---|---|
| Devin — Astra | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Devin — Gemini 3.8 Flash | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Devin — GPT-5.6 Sol | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Devin — GPT-5.6 Terra | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Devin — GPT-5.6 Luna | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Devin — SWE-1.7 Lightning | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Devin — SWE-2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Devin — Grok 4.6 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Devin — DeepSeek V4.1 Flash | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Devin — SWE-1.7 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Grok — 4.6 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Astra Low deferred search:** accepted by the user after gateway discovery guidance yielded 4/5 compiled runs with the original prompt, including the last three consecutively. One no-invocation failure remains recorded.

## Selectors and reasoning

| Model | Live-tested budget selector | Advertised reasoning choices |
|---|---|---|
| Devin — Astra | `gpt-6-astra-low` | Low, Medium, High, XHigh, Max |
| Devin — Gemini 3.8 Flash | `gemini-3-8-flash-low` | Low, Medium, High |
| Devin — GPT-5.6 Sol | `gpt-5-6-sol-low` | None, Low, Medium, High, XHigh, Max |
| Devin — GPT-5.6 Terra | `gpt-5-6-terra-low` | None, Low, Medium, High, XHigh, Max |
| Devin — GPT-5.6 Luna | `gpt-5-6-luna-low` | None, Low, Medium, High, XHigh, Max |
| Devin — SWE-1.7 Lightning | `swe-1-7-lightning-medium` | Medium, Max |
| Devin — SWE-2 | `swe-2-medium` | Medium, High, Max |
| Devin — Grok 4.6 | `grok-4-6-low` | Low, Medium, High, XHigh |
| Devin — DeepSeek V4.1 Flash | `deepseek-v4-1-flash-high` | High, Max |
| Devin — SWE-1.7 | `swe-1-7-medium` | Medium, Max |
| Grok — 4.6 | `grok-4.6` | Low, Medium, High, XHigh |

Both SWE-1.7 unsuffixed selectors mean **Max**, not a default or Low setting. Their Medium selectors are explicit. Official labels and UIDs must agree. Unsupported choices fail without substitution. All 39 retained Devin mappings passed discovery → catalog → routing checks; the full reasoning list is not a claim that every level was live-tested. Visible thought output varies by model/turn.

## Evidence and limits

- Ten Devin families passed real compiled-helper read → custom apply_patch → file readback at the listed budget selectors.
- The remaining nine families received 36 integrated image/search/web/peer probes. Initial sweep: 31 passes; five targeted retries brought that to 35/36. Astra deferred search then received the accepted focused follow-up above.
- SWE-2 had earlier integrated image, search, web, two-child and compiled sibling-follow-up passes. Native Grok 4.6 retains its separate earlier gateway verification; it was not rerun in the Devin-only sweep.
- Search passes require discovery, execution of a caller-side laboratory tool and exact random-value delivery. Live web passes require a real completed search and the expected official documentation answer.
- Peer retry passes use explicit readiness and an idle sibling follow-up. Earlier active-wait failures/timeouts remain in the history; arbitrary concurrent queues and mixed-provider task trees are not certified.
- Images are inline fixtures, not every multimodal tool-output form. Image generation is outside this matrix; cached-only search, external private compaction and remote image fetching retain their explicit restrictions.
- Structured web citation fidelity and provider usage-counter accounting semantics remain unverified.
- Native Codex workspace sandbox and approvals remain enforced. Outer test-sandbox nesting caused permission-denied diagnostic runs; approved host execution resolved that without disabling Codex sandboxing.

## Reproduction

See [ACP acceptance instructions](../experiments/acp/README.md) and [development workflow](development-workflow.md). Live inference requires current authorization and existing official CLI sign-in; use private scratch state and at least ten-second gaps. `ACP_EXPLICIT_DISCOVERY=1` selects the diagnostic prompt; ordinary controls leave it unset. A zero CLI exit alone does not count as a pass.

Local metadata evidence: `gateway-acp-matrix-*.json`, `integrated-retest-verified.json`, and `astra-low-discovery-followup.json` under ignored `.build/compat-audit/`. These local files are not shipped. The [historical validation record](compatibility-history.md) preserves provenance, failed attempts and intermediate conclusions; this page supersedes its stale status statements.
