# Source provenance

The app adapts selected source from the projects below. Original notices remain in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). No sibling repository or archived source is required to build or run the app.

| Source | Revision | Adaptations |
| --- | --- | --- |
| Local gateway | `5536debc025598ae55ead6a9069f7c42ca9ff3da` plus recorded working-tree changes | Grok transport, credential parsing, Codex child-tool compatibility, process/login helpers and build packaging. The old Devin Connect transport has been removed in favor of the official CLI ACP backend. |
| Account switcher | `5f2a0352d33a26b479bbe614b9b80843f4c9cb16` | Native account models/store, official stdio RPC, usage normalization, switch/rollback and normal-quit/reopen flow. File handling was strengthened with ancestor checks, `O_NOFOLLOW`, bounded reads and private atomic writes. |
| Ollama | `b68b112bd8868d6278250d7d4bdfafa5cbf035c8` | Native-provider installation, combined catalogs, fixed-origin native routing, HTTP fallback and config ownership. No approval transformations, full-access rewrites or Ollama runtime. |
| Local router | `20e9cfaf3e8b3bc92e3069b7449cae85978a7e44` | Atomic/compare-before-write configuration, response/header boundaries and explicit hook ownership. Registry-based request routing replaces its catch-all policy. |

[The source manifest](../references/manifest.json) preserves original revisions, archive hashes and local snapshot file hashes. Archives were verified before source reuse and removed from the current tree during cleanup; the archives and original research/implementation records remain in Git history at `50db13b`. Upstream instructions were never adopted as this repository's instructions.

WindsurfAPI `81370f553718153bcd52297251cc565562d85645`, its patch and catalog build transform were used by the former Devin Connect transport. They are no longer dependencies. Historical dependency notices are retained for provenance.

Deferred tool-search research consulted Codex Universal Proxy at `843ac47`, OpenCodex issue 1950, CC Switch issue 6795 and the OpenAI client tool-search contract. No source from those research references was copied into product code; the original research notes remain in Git history.

The helper embeds Bun 1.4.2 (`744846f84`). Its full notice, linked-library inventory and JavaScriptCore source/relink instructions are in `licenses/Bun-LICENSE.md`; the download URL and SHA-256 are in `licenses/provenance.json`. Rebuild with a modified Bun to replace the runtime. The app ships these notices and the `licenses/` directory. Official provider CLIs are not redistributed.
