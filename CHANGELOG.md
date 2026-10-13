# Changelog

## 0.4.0 — 2026-10-12

- New default `mode: "summarize"` (Lean 2.0). Large tool outputs are summarized instead of passed through exactly: shell output above 4 KiB keeps about 1.5 KiB of head, 1.5 KiB of tail and the failure lines with their continuation lines; file reads cap at 8 KiB with an `offset=` continuation; webfetch caps at 8 KiB. Thresholds are configurable under `summarize`.
- Failures stay whole. When the exit code is nonzero or unknown, every failure line and its continuation block is kept regardless of budget; exit 0 output keeps failure and warning lines within a 4 KiB budget.
- Every lossy summary stores the complete original in the RawStore and ends with `[full output: lean recall <id>]`. Recall is available as the OpenCode tool `lean_recall` (registered by the plugin, optional line range) and as `hugr-lean recall ID [--lines A-B]`. Summaries are dropped (the original is kept) if storage fails or `raw: false`.
- Compound commands, pipes, host-truncated output and nonzero exits are now summarized as well.
- Lossless rewrites without recall: ANSI and carriage-return overwrite stripping, run-length marking of repeated shell lines, and compaction of read `N: ` line-number prefixes into one header line (`summarize.readLineNumbers: true` keeps them).
- A summary is never larger than its input. `RawStore` gains opt-in `evict` (oldest first), which summarize mode enables so a full store keeps admitting new originals.
- Offline replay on the owner's recorded sessions: 41.3% total reduction with the defaults (upper bound before recovery re-reads; see `docs/BENCHMARK_REAL.md`).
- `mode: "lossless"` keeps the 0.3 exact-evidence contract unchanged.
- Packaging for npm: first publication as `hugr-lean`, with description, keywords, homepage/bugs links, `publishConfig` (public access, provenance) and a smaller `files` allowlist (dist, README, CHANGELOG, SECURITY, LICENSE, NOTICE, license and fixture source notes, `docs/BENCHMARK_REAL.md`); internal module docs and `docs/history` no longer ship. The tarball drops from 235 to 191 files (481.5 kB to about 205 kB packed).
- README rewritten for external users; CONTRIBUTING.md and SECURITY.md added.
- `.github/workflows/release.yml`: on a `vX.Y.Z` tag (or manual dispatch with the tag) it checks the tag against `package.json`, CHANGELOG and `docs/RELEASE.md`, runs the full check on Linux, macOS and Windows, packs with a SHA-256, publishes to npm with provenance (secret `NPM_TOKEN`) and creates the GitHub release with the tarball, checksum and the `docs/RELEASE.md` section as notes.
- The real-host smoke expects the summarize default: small unknown output reaches the model with CRLF normalized to LF; failed output and `mode: "lossless"` stay byte-exact.

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
