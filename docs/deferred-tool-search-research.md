# Deferred tool search: compatibility research

Checked 2026-09-13. The shared adapter is implemented for Grok 4.6 and the retained Devin ACP selectors; integrated discovery/load/invoke workflows are accepted with the documented Astra Low retry evidence; see [validation](compatibility-validation.md). The remaining scope is broader connector/provider coverage.

## Conclusion

A client-executed protocol adapter is feasible and has public implementation precedents. Scope is moderate: request/history translation, response streaming restoration, and catalog capability validation. No independent MCP service or search index should be needed when Codex supplies client-executed search. Codex must retain ownership of discovery, authentication, permissions, and execution.

## Resources inspected

- [Codex Universal Proxy source at 843ac47](https://github.com/bharat2808/codex-universal-proxy/blob/843ac47f572f8146e1d0044c63319f6aea714679/src/proxy.js): `translateInputItem` converts search history into function calls/results; request preparation promotes tools from `tool_search_output`; `translateOutputItem` restores a function call as `tool_search_call` with client execution and object arguments. Its tests cover request promotion and streaming restoration. Code and tests were read, not run. MIT license. Ignored snapshots, source URLs and SHA-256 hashes: `.build/compat-research/tool-search-universal/provenance.json`.
- [OpenCodex issue 1950](https://github.com/lidge-jun/opencodex/issues/1950): reports missing request rewrite and response restoration on the Responses passthrough path despite existing chat-path handling. Useful failure explanation, not our live verification.
- [CC Switch issue 6795](https://github.com/farion1231/cc-switch/issues/6795): specifically discusses xAI OAuth, excessive eager tool counts, withholding deferred tools, restoring search even with an empty namespace map, and leaving execution with Codex. Proposed fix, not evidence that its native Responses implementation is complete.
- [OpenAI client tool-search guide](https://developers.openai.com/api/docs/guides/tools-tool-search): client call/output contract and dynamically returned schemas.

## Implementation sequence and remaining coverage

1. Capture only tool shape metadata from the installed Codex runtime in isolation to confirm its client search schema and event contract. Do not log request bodies or provider transcripts.
2. Rewrite an advertised client search definition as an ordinary external function. Preserve the supplied schema; do not invent a search function if Codex did not register one. Protect against name collisions.
3. Convert replayed search calls/results into provider-compatible function history with stable call IDs. Promote returned definitions in relevance order, deduplicate exact tool identities, and withhold unloaded deferred definitions. Do not silently truncate tools to meet provider limits.
4. Restore streamed and non-streamed external search calls into Codex client search items. Arguments must be an object; handle partial argument deltas and terminal items consistently. Preserve namespaced identities through discovery and subsequent turns.
5. Test a controlled read-only MCP fixture: search, load, invoke, receive result, continue. Include empty results, malformed arguments, cancellation, repeated history, and child-agent discovery. Verify actual Codex behavior before marking the feature supported.
6. Validate Grok first, then Devin's different upstream converter. Success on one provider does not certify the other.

Before this implementation, the catalog derived `supports_search_tool` from ordinary tool support, while the Grok adapter dropped `tool_search`. Grok 4.6 now has the bridge and Grok 4.5 no longer advertises search support; a catalog flag alone cannot implement the feature. Existing `additional_tools` promotion is useful plumbing but does not handle search call/output items.

Confidence is high in the basic translation approach, moderate in complete Desktop/provider parity until the runtime fixture passes. No third-party runtime was installed and no external source was copied into product code.
