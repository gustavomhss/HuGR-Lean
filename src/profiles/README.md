# Profiles

Internal, pure full-stream parsers for narrow native success grammars; the core owns final size acceptance.

## Scope
- [runners.ts](runners.ts): `cargo-test`, `cargo-build`, `pytest`, and `go-test-verbose`.
- [formats.ts](formats.ts): `jest`, `vitest`, `git-status`, and `rg`; `tsc` is an identity-only passthrough stub.
- Jest and Vitest validate existing grammars but retain every source row, including PASS/check markers and timings: config-only reporters can emit the whole stream as user evidence. Plain streams return `passthrough/not_smaller`; legacy plain Jest/Vitest reduction support is withdrawn. Safe presentation normalization remains core-owned.
- [index.ts](index.ts) registers eight reducers plus that ninth stub; registration does not imply every invocation or output variant is supported.
- Reducers return source-backed `Reduction` or `undefined`; unknown lines, diagnostics, inconsistent totals, or incomplete/failed observations decline.
- No generic deduplication, synthetic runner totals, command execution, or I/O belongs here.
- Native ESLint/Biome/Ruff/Clippy diagnostics and install progress remain optional-v1 passthrough candidates; admission requires full grammar, preservation evidence, and demonstrated material noise.

[Coverage](../../docs/COVERAGE.md), [runner provenance](../../fixtures/runners/SOURCES.md), and [format provenance](../../fixtures/formats/SOURCES.md) record the exact admitted scope and captures.
Read [ownership](OWNERSHIP.md), [maintenance](MAINTENANCE.md), [manual](MANUAL.md), and [blast radius](BLAST_RADIUS.md).
