# Profiles

Internal, pure full-stream parsers for narrow native success grammars; the core owns final size acceptance.

## Scope
- [runners.ts](runners.ts) is the barrel for [cargo.ts](cargo.ts), [pytest.ts](pytest.ts) and [go.ts](go.ts); shared refusal/span helpers live in [runner-utils.ts](runner-utils.ts).
- [node-test.ts](node-test.ts): direct Node/tsx flat and bounded nested TAP 13, registered as `node-test`.
- [formats.ts](formats.ts): `jest`, `vitest`, `git-status`, and `rg`; `tsc` is an identity-only passthrough stub.
- [index.ts](index.ts) registers nine reducers plus inert `tsc` (10 IDs); registration does not imply support for every invocation/output variant.
- Reducers return source-backed `Reduction` or `undefined`; unknown lines, unsupported diagnostics, inconsistent totals, or incomplete/failed observations decline. Closed Go/pytest/Node diagnostic contexts are retained, not discarded.
- No generic deduplication, synthetic runner totals, command execution, or I/O belongs here.
- Native ESLint/Biome/Ruff/Clippy diagnostics and install progress remain optional-v1 passthrough candidates; admission requires full grammar, preservation evidence, and demonstrated material noise.

[Coverage](../../docs/COVERAGE.md), [runner provenance](../../fixtures/runners/SOURCES.md), and [format provenance](../../fixtures/formats/SOURCES.md) record the exact admitted scope and captures.
[Utility evaluation](../../docs/UTILITY_EVALUATION.md) distinguishes the new original local corpus from historical donor fixtures and pending installed/host/latency receipts.
Read [ownership](OWNERSHIP.md), [maintenance](MAINTENANCE.md), [manual](MANUAL.md), and [blast radius](BLAST_RADIUS.md).
