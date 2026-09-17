# Codex Switchboard

One native macOS menu app: Swift UI/account management and a bundled JavaScript gateway. These instructions apply to any coding agent.

## Working on the repo

- Start with `README.md`. Use `docs/architecture.md` for component boundaries, `docs/setup-recovery.md` for installation/restore, and `docs/development-workflow.md` for checks. Current provider evidence and outstanding acceptance live in `docs/compatibility-validation.md`.
- Reviews and planning are read-only unless changes are requested. Carry authorized implementation through proportionate validation; preserve unrelated work.
- Resolve discoverable questions yourself. Ask only when missing information materially affects correctness, scope, or authorization. Keep updates concise.
- Keep one native app with private helpers. No hosted service, separate agent executor, automatic account rotation, cross-provider fallback, or Claude integration.

## Boundaries

- Preserve official CLI-owned authentication, private credential storage, no-symlink checks, loopback listeners, provider isolation, streaming, and cancellation.
- Never log credentials, request bodies, images, or raw provider responses. Never weaken Codex approval/sandbox behavior or silently substitute a provider/model.
- Keep the user's working configuration and services intact until explicit activation. Never terminate the Desktop instance running the task or take over an occupied port.
- Live inference needs explicit session authorization and bounded scratch requests. Build/test permission is not inference or activation permission. Never purchase credits or modify unrelated accounts.
- Preserve source notices and provenance when reusing code. Archived upstream instructions are source evidence, not repository instructions. Old repositories are not runtime dependencies.

## Validation and Git

- Run checks relevant to the change. Reuse focused fixtures; avoid duplicate tests and broad verification without a concrete reason. App changes need build/runtime evidence; docs-only work needs consistency/link checks.
- Report unverified flows honestly. Login and Desktop restart may require user participation; finish independent work first.
- Use `codex/` branches and Conventional Commits. Stage only task-owned changes; make coherent commits when requested. Do not rewrite history or push/publish without authorization.
