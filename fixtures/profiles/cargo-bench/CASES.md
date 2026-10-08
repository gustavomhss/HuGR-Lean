# C06: Cargo bench capture-only packet

Baseline: `07ffe15e2263c2925778022194c5385807216603`.
State: CAPTURED with builtin runtime BLOCKED; not READY or reduction support.
Flat records: `cases.json`, schema `hugr-lean/native-cases/1`.

| Case ID | Required variant / actual evidence | Proposed public-filter disposition |
| --- | --- | --- |
| C06-builtin-stable-1.98 | Named builtin bench target; real E0554 compiler diagnostic | EXACT_FAILURE |
| C06-builtin-filter-ignored-stable-1.91 | Lower installed bound; name filter plus --ignored; compile fails before selection | EXACT_FAILURE |
| C06-builtin-exact-ignored-stable-1.98 | Qualified suite name plus --ignored/--exact; compile fails before selection | EXACT_FAILURE |
| C06-custom-arbitrary-metrics | Actual harness=false executable; arbitrary names, iterations, ns, ops/s, ignored reason, summary and printed artifact path | EXACT_UNSAFE_CUSTOM_HARNESS |
| C06-custom-native-shape-collision | Actual harness=false executable prints fake native finish/path, ns/iter, uncertainty, ignored reason and summary | EXACT_UNSAFE_NATIVE_SHAPE_COLLISION |

## Evidence boundary and goldens

Commands, versions, native facts, complete stdout/stderr and process exits are inline per case.
Capture uses Node spawnSync without shell, separate pipes, UTF-8 decoding, 60-second timeout.
No terminal rendering, merging, path replacement, progress stripping or EOF normalization.
`presentation: unknown`; failure observation uses stderr, success observation uses raw stdout.
These are stream observations, not proof of the OpenCode combined-output host boundary.
Cargo's authentic compile/finish/Running lines remain in each recorded stderr verbatim.

`proposedExpected` contains separately written literal goldens, not filter-generated expectations.
For failures it preserves the entire diagnostic stream. For custom success it preserves all stdout,
including final EOF without LF. No arbitrary metrics are promoted to native measurements.
The custom source performs no benchmark iterations/timing and creates no artifact; numbers are literals.
The collision's leading Finished/Running lines are application data despite their spelling.
No leading-progress removal proposed: no authenticated whole native benchmark grammar was captured.
Required evidence is the complete selected stream. Proposed removable bytes: zero for every case.
No public-filter execution, BASELINE_PRESERVED assertion, red/green claim or test name: CAPTUREONLY.
Lead must add owned preservation tests before calling these records executable acceptance coverage.

## Builtin blocker

`rustup toolchain list` returned stable (active/default), 1.91.1, 1.96.0, 1.97.0 and 1.98.0,
all `x86_64-apple-darwin`. Existing default reports Cargo/rustc 1.98.0.
Explicit installed bounds 1.91.1 and 1.98.0 reject `#![feature(test)]` with E0554, exit 101.
Filter/ignored/exact commands never start the builtin libtest bench harness.
No nightly installed or requested; no RUSTC_BOOTSTRAP override used.
Builtin suites, measured names, timing units/uncertainty, iteration reporting if supported,
ignored/filter counts, finish paths and summaries remain uncaptured. Existing test captures
are regression anchors, not benchmark proof. Custom strings cannot close this blocker.
Further builtin captures need an authorized supported toolchain and bounded workload.

## Receipt / checks

Only `fixtures/profiles/cargo-bench/**` changed. Disposable dependency-free project:
`/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/c06-tiny`.
Repository `npm ci --ignore-scripts` and `npm run typecheck` exited 0 (Node 22.17.1/npm 10.9.2).
Typecheck checks existing TypeScript; it does not validate JSON fixture semantics or Cargo runtime.
No implementation/preservation tests changed, so no production mutation probe performed.
No full checks/build/smoke/repository benchmark or CI dispatch performed. Stop for lead review.
