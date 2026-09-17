# Provider compatibility

Last live validation: **2026-09-13**. These results cover bounded gateway checks at the selectors below, not every workflow or reasoning level. Availability depends on the official CLI and account entitlement.

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


All listed models have gateway evidence for text, images, tool calls, file edits, subagents, sibling follow-ups, live web and deferred tool search. The reasoning mappings have local discovery/catalog/routing checks; higher efforts are not all live-tested. SWE-1.7 unsuffixed selectors mean **Max**. Unsupported choices fail without substitution.

## Known limits

- Astra Low deferred search succeeded in 4/5 focused runs; it can fail to invoke discovery.
- Agent messaging evidence covers two children and an idle sibling follow-up. Arbitrary concurrent queues and mixed-provider task trees are unverified.
- Image checks cover inline fixtures. Remote image fetching, image generation, cached-only search and external private compaction are unsupported.
- Structured web citation fidelity and provider usage accounting remain unverified.
- Final app activation, a real Desktop workflow, and a user-assisted native two-account handoff remain outstanding. Local rollback fixtures do not establish live handoff success.

## Verification

Use [development checks](development-workflow.md) for local fixtures and [live acceptance](../experiments/acp/README.md) for explicitly authorized provider checks. A successful process exit alone does not establish a live capability pass; inspect the driver’s mode-specific evidence. Build and test permission does not authorize activation or inference.
