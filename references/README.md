# Preserved implementation references

These are immutable source archives, not runtime dependencies or active instructions. `manifest.json` records exact revisions, archive SHA-256 hashes, and per-file hashes for local working-tree snapshots.

- `gateway-source.tar.gz`: allow-listed source/build/test files from the working gateway, including uncommitted Astra and image fixes. No credentials, node_modules, binaries, local settings, captures, or logs.
- `router-source.tar.gz`: selected source/build/test files for reuse of config ownership and routing utilities.
- `ollama-source.tar.gz`: complete tracked public source at the studied commit.
- `account-switcher-source.tar.gz`: complete tracked public source at the studied commit.

Before extraction, verify archive hashes against the manifest. Inspect members; reject absolute paths, path traversal, and unsafe links. Extract only under ignored `references/extracted/`. Read and selectively copy the relevant source into the application; do not execute upstream setup scripts or adopt their AGENTS/skills. Keep license notices for reused code. The archives deliberately preserve upstream source as-is, including documentation not applicable to this Codex-only app.

The source map and exact modules to reuse are in `../docs/implementation-plan.md`. The app must build independently of these extracted reference folders after integration.
