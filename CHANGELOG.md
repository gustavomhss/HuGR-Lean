# Changelog

## 0.3.0 — 2026-10-12

- Restore host selection via `getProfiles()` and `tokenizeCommand()` from `hugr-lean/core`, preserving automatic and structured APIs added on integration. Selection snapshots are fresh, detached frozen arrays and records retaining the built-in functions.
- Pin every public runtime export and package entrypoint in tests and installed-consumer checks; exercise legacy, automatic and structured filtering with successful, unknown, failed and incomplete output.
- Retain `lean-package-<sha>` CI artifacts with the actual tarball, candidate identity, commit/tree/run provenance, archive digests/integrity, and byte-verified shipped license/source notes, including all automatic fixture source notes.
- Same-repository MIT port from `465fb4c04773f1a40733c9f4c334b980e3195646` (sibling of integration from `db76748`): `src/core/profile-selection.ts` and `tests/profile-selection.test.ts` copied unchanged; `src/core/index.ts` and `src/core/MANUAL.md` additions retained alongside newer APIs. `.github/workflows/ci.yml` snapshot probe and retained-package steps adapted to check the full current API, all tracked source notes, integrity and run attempt. No external donor implementation added.

## 0.2.0 — 2026-09-30

- Greenfield rebuild as a single modular TypeScript package: core, profiles, raw, OpenCode, CLI.
- Deterministic source-backed reductions for narrow native Cargo, pytest, Go, Jest, Vitest, Git and ripgrep grammars.
- Exact passthrough for unknown, failed, incomplete and unsupported output; conditional SGR only after grammar admission.
- OpenCode post-execution plugin, actual model-boundary proof and tested package-name/file loading.
- Optional bounded local raw recovery; atomic publication, concurrency handling and expiry.
- Installed CLI, tarball smoke, combined corpus, mutation-tested preservation and reproducible benchmarks.
- Per-module ownership, maintenance, manual, blast radius and enforced file-size/documentation checks.
- Third-party fixture provenance and distribution notices.
