# Working rules

- Read PLAN.md and src/types.ts first. Keep one small TypeScript package.
- Each coding agent works in its own worktree and only its assigned files.
- Preserve unknown output and failures. No command rewriting or core I/O.
- Source spans use UTF-16 indices; size metrics use UTF-8 bytes.
- Copy donor material only with pinned path/commit/license and modification record.
- Stage named files, never git add -A. No forced pushes, hard resets or skipped hooks.
- Run focused tests and typecheck; mutation-probe preservation tests and restore afterward.
- Push the first compiling commit. Open a PR, verify CI, then stop for lead review; never merge.
