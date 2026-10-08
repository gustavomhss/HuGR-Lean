# Native fixture utility evaluation

This inventory describes the utility candidate based on `b2af5300567e6f4fc96c77a81f599fbdc665916b`.
It is not a final execution receipt. All four parser cold reviews were approved; current full-suite,
installed-package, real-host and latency verification is still being completed by the lead.
The final integrated public code SHA belongs in the delivery PR's external receipt, avoiding a self-hash cycle.

## What the corpus measures

[fixtures/utility](../fixtures/utility) contains native output from **original local MIT fixture projects**,
not representative real-agent sessions or an upstream-project utility survey. Producers deliberately use
long test names and many passing tests to expose removable progress. Savings demonstrate those grammars
on these inputs; they do not establish token/cost savings, adoption value or general workload prevalence.

The frozen inventory is **25 cases: 12 noise, 13 exact**, in four families and six provenance roots.
The artifact inventory is **439 files / 1,193,627 bytes** (about 1.193 MB), including sources and receipts,
not just process output. [Inventory tests](../tests/utility-inventory.test.ts) pin this closed inventory.
The [combined tests](../tests/combined.test.ts) and [installed inspector](../scripts/package-smoke.mjs)
declare **39 cases / 10 profile IDs**: nine reducers plus inert `tsc`. These are coverage inventories,
not fresh passing counts. Earlier family `SOURCES.md` checkpoint status is not current release status.

## Native bytes and independent expected output

The numbers below are frozen original/expected UTF-8 bytes, not newly measured results from this docs lane.
Expected logs were authored from inspected source positions, not production parser output.
Material means **at least 1,024 bytes saved AND at least 10% of input**; core acceptance only requires
strictly smaller output, so the nonmaterial Cargo library case can still reduce.

| Family / native case | Original → expected bytes | Material |
| --- | --- | --- |
| Cargo full | 2,931 → 914 | yes |
| Cargo `--lib` | 1,375 → 478 | no: only 897 bytes saved |
| Go cold / cached | 3,228 → 632 / 3,231 → 635 | yes / yes |
| pytest default / quiet | 2,422 → 1,118 / 2,181 → 901 | yes / yes |
| pytest literal-path / doctest-path | 2,424 → 1,120 / 2,424 → 1,120 | yes / yes |
| Node flat / tsx flat | 5,132 → 123 / 5,133 → 123 | yes / yes |
| Node nested / tsx nested | 6,197 → 792 / 6,198 → 792 | yes / yes |

All 13 exact controls retain the whole original: Cargo failure/warning; Go failure/diagnostic/opaque;
pytest assertion-failure/opaque-summary; Node and tsx failure/opaque/diagnostic. Supported diagnostic
envelopes may survive within a larger reduction; unknown diagnostics never license deleting output.

Native versions and provenance: [Cargo](../fixtures/utility/cargo/SOURCES.md),
[Go](../fixtures/utility/go/SOURCES.md), [pytest](../fixtures/utility/pytest/SOURCES.md),
[Node/tsx](../fixtures/utility/node/SOURCES.md). Captures use Cargo/rustc/rustdoc 1.98.0,
Go 1.27.1 darwin/amd64, Python 3.14.5 with pytest 9.0.3/pluggy 1.6.0,
and Node 22.17.1/tsx 4.23.15. Exact executable/version facts remain in receipts.

Cargo's full capture has native `2m 01s`. Its deliberate 61-second cold `build.rs` delay is native
command work, **not filter latency** or representative build performance. The original collector failed
with `NATIVE_MINUTE_DURATION_MISSING` despite native exit 0; that failure remains recorded. Full
`Cargo.lock` before-bytes are recovered from the pinned producer literal, not a recorded-before file
snapshot; `recordedBeforeSatisfied:false` remains factual. Runtime Rust sources are actual hash-bound files.

## Reader and preservation boundaries

[readUtilityCorpus](../scripts/utility-corpus.mjs) reads the frozen `hugr-lean/utility-corpus/1` schema:
safe family-local artifacts, byte/hash descriptors, receipt facts, source mappings, ordered provenance
parts and occurrence-aware anchors. Unknown fields, missing lists/files, unmapped artifacts, invalid
counts/digests and inconsistent receipt/source facts are named failures, not empty successful reports.
Original/stdout/stderr lengths and immutable receipts are checked; mixed-stream arrival ordering remains
a collector declaration, not an independently authenticated cross-stream chunk sequence.

Node/tsx `externalRuntimes` retain **original collector fingerprints only**: versions, paths, byte lengths,
hashes and recorded tsx lock integrity. Native Node executable and tsx module bytes are not vendored.
The reader does not revalidate current local binaries or supply-chain integrity. Fixture programs and
publisher helpers are original MIT material; existing donor pins and historical goldens remain separate.

Test roles are distinct: family utility tests check grammar and independent retained positions;
[utility-fixtures.ts](../tests/utility-fixtures.ts) checks original raw/golden pins; corpus/inventory tests
check schema, lineage and artifact closure; combined tests check the default registry; installed smoke
checks the actual package. Preservation requires both `Reduction.required` coverage and emitted intact
source pieces, not replacement equality alone. Declaration-only, emission-only and refusal mutants are
controls; UTF-16 source spans and UTF-8 byte metrics must remain distinct.

## Reproduction and pending receipts

From a clean reviewed checkout with dependencies already installed, the lead can build and evaluate:

```sh
npm run build
node scripts/utility-evaluation.mjs --clean-build --root fixtures/utility
```

The evaluator checks compiled identity, core goldens and the raw-off `bash` after-hook without native
execution, historical replay or latency sampling. Private composed-branch proof reports five smoke
passes; final SHA/package checksum, host, full-suite and latency receipts remain pending. This docs
change runs static checks only. [Delivery status](DELIVERY.md) owns the pending operational decisions.

Jest/Vitest still use the existing prefix/per-file-timing strategy; no utility improvement is claimed.
Actual argv, reporter grammar, colors and npm child identity constrain admission. The after-hook handles
only `bash`, keeps presentation unknown, and changes only model-visible text; there is no command rewrite
or core/profile I/O. Architectural expansion requires separate design and evidence, not broader prose.

Historical primary savings remain **471 / 1,272,795 bytes = 0.037005%**, with zero material primary cases:
that corpus failed the practical noise-reduction criterion. Its historical corpus tarball is missing for fresh
replay verification. This native fixture corpus neither rewrites that result nor supplies its missing proof.
