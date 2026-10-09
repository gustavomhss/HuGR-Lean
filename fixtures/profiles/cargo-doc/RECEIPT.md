# C05 bounded cargo-doc verification receipt

## Cold-review correction (supersedes historical receipt below)

Checkpoint reviewed: `32c4ecf5c65ed2de09c48150b9673cde67c91f2b`.
Current public disposition: every capture exact. Unsafe leading progress deletion removed;
all validated rows are required. Compiling/Checking prefixes and matching Documenting source
collisions retain output. Diagnostic matching uses exact ASCII native-column slice; unsupported
non-ASCII/tab alignment refuses. --bins refuses until independently bound to targets/artifacts.
Grammar authenticates structure only, never producer identity. Captured artifact hashes cannot
establish runtime per-row producer boundary. C05 reduction requirement remains BLOCKED pending
human scope decision or genuine producer boundary. No boundary was invented.

Current corpus expectation: 11,215 UTF-8 bytes in and out, zero removable bytes. Historical 2,661-byte
reduction below is withdrawn. cases.json references raw identity expectations for formerly reduced
cases; old expected.txt proposals remain archived, rejected. Native streams/recipes/hashes unchanged.

Historical author closure was not repeated. Focused affected checks passed (19 selected tests):

```sh
npx --no-install tsx --test --test-name-pattern='^C05 (default producer boundary blocked exact|flat completed native provenance and literal economy|known warning later progress finish and artifacts remain mandatory|optional offline and generic package profile features target path values|UTF-16 spans and UTF-8 economy preserve astral path|progress producer collisions preserve unrelated prefix and matched Documenting|diagnostic exact native column refuses displaced item and unsupported alignment|bins unbound artifacts refuse entire output without fixture hardcodes|(default|no-deps|workspace|package|features|explicit-target|private-items|workspace-warning|checking-warning|three-warning|profile-path) independent public custom-filter golden)$' tests/profile-cargo-doc.test.ts
npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --types node src/profiles/cargo-doc.ts tests/profile-cargo-doc.test.ts
```

Separate production mutations, each run only with its protecting exact name:

| Mutation | Exact test name (prefix C05) | Red evidence | Restored same test |
| --- | --- | --- | --- |
| Start required/piece span after first row | progress producer collisions preserve unrelated prefix and matched Documenting | actual span start 46, expected 0 | passed |
| Replace exact column slice with includes | diagnostic exact native column refuses displaced item and unsupported alignment | malformed frame parsed as [0,877], expected undefined | passed |
| Remove opts.bins refusal | bins unbound artifacts refuse entire output without fixture hardcodes | unbound default output parsed as [0,425], expected undefined | passed |

Each command was `npx --no-install tsx --test --test-name-pattern='^C05 <exact name>$' tests/profile-cargo-doc.test.ts`.
All mutations restored with apply_patch; restored runs selected one test each. Parser assertions
make diagnostic and bin refusal observable even though public filter preserves output regardless.
No full file/package suite, build, smoke, benchmark, or CI run for this correction.

## Historical author receipt (unsafe reduction claims withdrawn)

Base: `07ffe15e2263c2925778022194c5385807216603`; branch `campaign/native-v2/C05`;
PR https://github.com/gustavomhss/HuGR-Lean/pull/92 targets campaign/native-integration.
Lead approved bounded grammar and exclusive src/profiles/cargo-doc.ts,
tests/profile-cargo-doc.test.ts, fixtures/profiles/cargo-doc/** ownership.

Public filter is exercised with custom `familyProfiles`; no default registry or installed-route claim.
Empty familyProfiles baseline: named `C05 default independent native golden positive` failed,
actual passthrough versus expected reduced. The same independent literal golden passed after implementation.
First compiling implementation checkpoint `c5d5508` was pushed after owned positive and typecheck.

Native witnesses: 15 completed original commands, pinned versions/source/recipes in SOURCES.md.
Every raw SHA, byte length, recipe hash, explicit case ID, literal expected proposal and artifact count
is inspected by the owned suite. An in-memory appended-byte corruption differs from each pinned SHA.
Measured corpus economy: 11,215 UTF-8 input bytes, 8,554 output bytes; 2,661 removed (23.73%),
including zero savings for cache, opaque log, failed syntax and filename-collision cases.
No runtime/benchmark or universal reduction claim. Source spans are JavaScript UTF-16 offsets;
astral project-path and source-snippet test checks independent expected text and UTF-8 byte metrics.

Destructive probes, applied separately to owned production file only:

| Mutation | Focused test | Observed result |
| --- | --- | --- |
| Delete requested-target consistency guard | C05 artifact path target/profile and generated counters guard | red: reduced instead of passthrough |
| Delete warning-summary/frame count equality | C05 diagnostic frames source context and warning counters guard | red: reduced instead of passthrough |
| Drop all post-diagnostic progress from both pieces and required spans | C05 three-warning independent public custom-filter golden | red: literal golden missing beta/gamma Documenting rows |

All three mutations restored via apply_patch. Full owned test file and npm run typecheck rerun afterward.
No core, registry, shared helper, global docs, CI or existing Cargo corpus edits. No full repository
tests/build/check/smoke/benchmark or CI dispatch. Shared integration and cold lead review remain pending.
Checking remains exact, not positive support; unobserved warning formats/profile optimization/minute
timings/flags and unsafe producer collisions remain exact. Stop for lead review; never merge.
