# Native fixture utility evaluation

This historical record comes from approved PR #85 and integration `0d28527258c09fe5746dfcbe0e51f45d3b937e4e`.
Its ten-profile/39-case inventory, inert-tsc and earlier Jest/Vitest behavior describe that dated
utility snapshot, not the current native campaign. Current scope is [COVERAGE.md](COVERAGE.md).

Dated local proof: **2026-10-08 UTC**, code baseline `f9d2f6c8540b9bc3479de59cbd301074f1ff80df`.
All four parser cold reviews were approved; private receipts record full-suite, normal installed-package,
actual host and latency outcomes. The repaired reader's fresh 25/25 evaluation and successful three-platform
CI ran at `310666cc4dfcf08d7c91396a562d896c7bb3b965`; original host/latency receipts retain their execution heads.
Source/runtime/package hash bindings belong in the external delivery receipt, avoiding a self-hash cycle.
[Delivery status](DELIVERY.md) records the current result and remaining release items.

## What the corpus measures

[fixtures/utility](../fixtures/utility) contains native output from **original local MIT fixture projects**,
not representative real-agent sessions or an upstream-project utility survey. Producers deliberately use
long test names and many passing tests to expose removable progress. Savings demonstrate those grammars
on these inputs; they do not establish token/cost savings, adoption value or general workload prevalence.

The frozen inventory is **25 cases: 12 noise, 13 exact**, in four families and six provenance roots.
Dated evaluation passed **25/25: 12 reduced, 11 material, 13 exact**.
The artifact inventory is **439 files / 1,193,627 bytes** (about 1.193 MB), including sources and receipts,
not just process output. [Inventory tests](../tests/utility-inventory.test.ts) pin this closed inventory.
The [combined tests](../tests/combined.test.ts) and [installed inspector](../scripts/package-smoke.mjs)
cover **39 cases / 10 profile IDs**: nine reducers plus inert `tsc`; normal installed proof passed
that matrix at the dated code baseline. Earlier family `SOURCES.md` checkpoint status is not release status.

## Native bytes and independent expected output

The numbers below are frozen original/expected UTF-8 bytes, matched by the dated local evaluation;
this docs lane does not rerun it.
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
execution, historical replay or latency sampling. Private `.closure-proof/final-f9d2/summary.json`
records 1,026 passes (0 failures/cancellations/skips/todo), 25 utility passes and normal installed 39/10 proof;
`.closure-proof/host-f9d2-sdk/receipt.json` records actual OpenCode 1.18.17 macOS x64 legacy host proof.
Its 23 scenarios comprise 7 file, 5 preinstalled/cached package-name, 8 four-family baseline/on text replays
and 3 raw scenarios with exact CLI recovery, all using the same normal artifact identified in delivery status.
These private receipts are not public downloads; replay is not upstream recapture or model-quality proof,
and package-name routing does not establish npm availability. This docs change runs static checks only.
The [three-platform CI run](https://github.com/gustavomhss/HuGR-Lean/actions/runs/37861421060)
passed at checkpoint `310666cc4dfcf08d7c91396a562d896c7bb3b965`; the repaired reader also passed a fresh
25-case evaluation there. Package linkage after documentation updates is recorded externally.
Registry publication and historical-corpus recovery remain separate pending items.

Jest/Vitest still use the existing prefix/per-file-timing strategy; no utility improvement is claimed.
Actual argv, reporter grammar, colors and npm child identity constrain admission. The after-hook handles
only `bash`, keeps presentation unknown, and changes only model-visible text; there is no command rewrite
or core/profile I/O. Architectural expansion requires separate design and evidence, not broader prose.

Historical primary savings remain **471 / 1,272,795 bytes = 0.037005%**, with zero material primary cases:
that corpus failed the practical noise-reduction criterion. Its historical corpus tarball is missing for fresh
replay verification. This native fixture corpus neither rewrites that result nor supplies its missing proof.
