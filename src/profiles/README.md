# Profiles

Internal, pure full-stream parsers for narrow native success grammars; the core owns final size acceptance.

## Scope
- [runners.ts](runners.ts) is a compatibility collection; defaults delegate existing Cargo/Go behavior through [cargo-test.ts](cargo-test.ts), [cargo-build.ts](cargo-build.ts) and [go-test-text.ts](go-test-text.ts), and reuse [pytest.ts](pytest.ts) plus [node-test.ts](node-test.ts) TAP.
- [formats.ts](formats.ts): `jest`, `vitest`, `git-status`, `rg`; its compatibility `tsc` stub is excluded from defaults. [tsc.ts](tsc.ts) supplies actual T01 timestamp-only reduction.
- Jest and Vitest validate existing grammars but retain every source row, including PASS/check markers and timings: config-only reporters can emit the whole stream as user evidence. Plain streams return `passthrough/not_smaller`; legacy plain Jest/Vitest reduction support is withdrawn. Safe presentation normalization remains core-owned.
- [index.ts](index.ts) registers 20 IDs, including cargo-check, Go JSON/mod, pnpm, Clippy, ESLint, Biome, Ruff, Pyright and Pylint. [Manual](MANUAL.md) and [coverage](../../docs/COVERAGE.md) map every ID to source, native pins and witnesses; registration does not imply all variants.
- Reducers return source-backed `Reduction` or `undefined`; unknown lines, unsupported diagnostics, inconsistent totals, or incomplete/failed observations decline. Admitted diagnostics remain required evidence.
- No generic deduplication, synthetic runner totals, command execution, or I/O belongs here.
- [json-layout.ts](json-layout.ts) removes canonical JSON layout only after tool-specific closed schema admission; [go-mode.ts](go-mode.ts) owns text/JSON/bench routing and [runner-utils.ts](runner-utils.ts) shares span/metadata helpers.
- Native corpus enrolls 41 bounded families; 25 explicit exact-ledger families add evidence without runtime stubs. Missing/unimplemented/ambiguous variants remain explicit; final CI and current performance measurement are pending.

[Coverage](../../docs/COVERAGE.md), [runner provenance](../../fixtures/runners/SOURCES.md), and [format provenance](../../fixtures/formats/SOURCES.md) record the exact admitted scope and captures.
Read [ownership](OWNERSHIP.md), [maintenance](MAINTENANCE.md), [manual](MANUAL.md), and [blast radius](BLAST_RADIUS.md).
