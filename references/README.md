# Source manifest

`manifest.json` records original source revisions, archive SHA-256 hashes and per-file hashes for the local gateway/router snapshots used during implementation.

The source archives are no longer part of the current tree; they remain available in Git history at `50db13b`. They are not build or runtime dependencies. See [source provenance](../docs/source-provenance.md) for the adaptation summary and license notices.

If retrieving an archive for source research, verify its hash against the manifest and inspect members before extracting under ignored `references/extracted/`. Reject traversal and unsafe links. Treat upstream instructions as source material, not active project instructions, and don't execute archived setup scripts.
