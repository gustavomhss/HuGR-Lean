# Benchmark and installed-package proof

## Current campaign boundary

Native integration baseline `20ce6cd` has not run the final benchmark or final package CI.
Lead measures after freeze using the unchanged budgets below; historical timing is not
current acceptance. The two focused Actions captures ([builtin bench](https://github.com/gustavomhss/HuGR-Lean/actions/runs/37979866069),
[rustdoc](https://github.com/gustavomhss/HuGR-Lean/actions/runs/37989424550)) prove native Rust evidence only.

**Withdrawal annotation:** historical Jest/Vitest timing/marker savings, their family
distributions and aggregate savings below describe old behavior, not current support.
Plaintext outputs now retain complete source rows and equal raw inputs; historical
reports/artifacts remain unchanged. Current registry/corpus scope is [coverage](COVERAGE.md).

## Reproduction

Use Node >=22 and npm. Build separately before packing; smoke never runs prepack/build.
Run from the package root. For isolated, bounded CI/build/test calls, use the exported
`withIsolation`, `npmProcess` and `isolatedProcess` helpers, as used for this verification:

```sh
node --input-type=module -e '
import { ROOT } from "./scripts/benchmark.mjs";
import { withIsolation, npmProcess } from "./scripts/package-smoke.mjs";
await withIsolation(async isolation => {
  for (const args of [["ci"], ["run", "check"]]) {
    const result = await npmProcess(args, { cwd: ROOT, isolation, timeout: 120000 });
    console.log(result.stdout); if (result.stderr) console.error(result.stderr);
  }
});'
node scripts/benchmark.mjs
OPENCODE_BIN=/absolute/path/to/opencode node scripts/package-smoke.mjs --opencode
```

Finish other local test/build/benchmark processes before timing. Process/HOME isolation
does not isolate CPU contention; concurrent measurements are not isolated acceptance runs.

Focused tests: `node --import tsx --test tests/package-smoke.test.ts` through
`isolatedProcess`. Missing binary/build/notices/exports/profiles, empty corpus/goldens,
unreduced or incorrect success output and failed pack/install are failures, not skips.
`--no-cli`, or absence of `--opencode`, always reports incomplete release proof.

## Measurement contract

The actual default `filter(observation)` and `createAfterHook({raw:false})` come from
local compiled `dist/core`, `dist/profiles` and `dist/opencode`; no injected engine,
profiles or raw store. `createAfterHook` is internal, never a package-root export.
Each case receives 20 warmups and 100 measurements. Core timing brackets synchronous
filtering; adapter timing includes fresh host-result construction and the awaited hook.
Assertions, module loading, corpus reads and generation are outside timers. JSON reports
wall and process user+system CPU p50/p95/mean in milliseconds, hardware/runtime/OS and
timestamp. CPU includes sampling overhead and process/GC work, not isolated attribution.
Percentiles use nearest rank; reduction median averages the middle two for even lists.
Budget failure prints full measured JSON and exits 1. Budgets are p95 wall time:

| Input | Core | Raw-off adapter |
| --- | ---: | ---: |
| 256 KiB | <=5 ms | <=10 ms |
| 1 MiB | <=25 ms | <=35 ms |

### Corpus and synthetic workloads

Every `.txt` fixture in `fixtures/runners` and `fixtures/formats` must be measured;
registry/fixture coverage is bijective by family, IDs unique, counts derived from arrays.
Independent `fixtures/installed-goldens.json` pins exact evidence for every reduced
fixture; missing, stale or empty goldens fail. Runner CRLF checkouts retain source line
endings. Native captures and pinned TRS fixtures are separately labeled; donor path,
commit, license and modification records are in the goldens and each `SOURCES.md`.
JSON records each command/status/reason, UTF-8 input/output/saved bytes, byte reduction
and latency. Per-family and corpus min/median/max/mean include passthrough **zeros**.
Current reader also includes authenticated utility evidence and the 41-family native index,
with explicit 25-family exact ledger and registry set correspondence. T01 tsc has bounded
timestamp-only reductions; its legacy diagnostic fixture stays exact. Synthetic Cargo workloads use one linear
allocation pass, unique names, consistent `running N tests`/`N passed` rows and exact
finish/executable/summary retention. They are generated loads, not new native captures.
Exit 101, unknown exit, timeout, truncation and unknown completeness deliberately reuse
reducible success grammar. Unsupported command and Unicode/CRLF unknown output also run.
Every operation checks exact passthrough/no replacement/equal bytes, or exact golden.

## Installed artifact proof

Packing snapshots prebuilt `dist`, manifest, README, notices and selected documentation, never runtime source code,
`.npmrc` or source `node_modules`. Snapshot, tarball and consumer live in `os.tmpdir()`
outside source ancestry. Actual `npm pack --ignore-scripts --pack-destination isolated-dir`
and `npm install tarball --ignore-scripts` run with isolated HOME/USERPROFILE/XDG/npm cache
and empty npm config files. Every spawn uses the host's existing bounded detached-pipe
helper and a whitelisted environment; NODE_PATH/NODE_OPTIONS/credentials are excluded.
Npm, compiler and inspection use absolute Node; timeout failures preserve diagnostics.
Installed package-name imports verify default-only root and `./server` resolving that
same function, real `/core` fixture goldens and `/raw` tempfile recovery/purge of Unicode,
CRLF, ANSI, NUL and a lone surrogate. No expected output comes from the inspected filter.
Nonempty `LICENSE`, `NOTICE` and exactly one `licenses/TRS-MIT[.txt]` must match source
bytes. This checks shipment. CLI checks the physical npm shim/bin mapping, invokes the
installed compiled target with absolute Node, and verifies exact version/doctor facts;
POSIX also calls the shim, while Windows checks its mapping and uses Node for execution.
`--opencode` requires a real absolute OPENCODE_BIN and runs existing host smoke with
HUGR_PLUGIN set to installed `dist/index.js`. Optional HUGR_SMOKE_DEPS accepts only an
isolated temporary `config/opencode` SDK install, never user cache/config/credentials.
The fixture executable named `cargo` proves wiring, not broad Cargo compatibility.
Whole host sessions include startup/SDK/provider/native work. Provider-request windows
would exclude startup but not isolate adapter CPU. Neither is reported as adapter latency.
Mechanical byte reduction is not a token estimate or causal LLM cost/quality benefit.

The manifest allows all fixture SOURCES.md, but smoke's closed snapshot currently copies
only runner/format and four utility notes, not native-family notes. Installed native cases
are supplied as external evidence JSON; replay does not prove shipment of every provenance
note. Final normal-pack contents/notices/link inspection remains a lead-owned artifact check.

## Historical baseline: 2026-09-30T07:17:05.204Z

Run: `node scripts/benchmark.mjs`, compiled application
baseline `546873e`, proof implementation `2172fbd`. Hardware: Intel Core i7-9750H
2.60 GHz, 12 logical CPUs, 16 GiB RAM, x64 macOS/Darwin 24.3.0
(`xnu-11215.81.4~3/RELEASE_X86_64`). Runtime: Node v22.17.1,
V8 12.4.254.21-node.27, npm 10.9.2. No concurrent local test/build was run during
measurement. All figures below are measured, rounded to three decimals.

Actual registry: `cargo-test`, `cargo-build`, `pytest`, `go-test-verbose`, `jest`,
`vitest`, `git-status`, `rg`, `tsc`: 9 unique profiles. 14 fixtures + 7 preservation
controls + 2 synthetic workloads = 23 cases, 12 reduced and 11 exact passthrough.
The fixture-only distribution (including 4 passthrough zeros) is min **0%**, median
**6.759%**, max **66.038%**, unweighted mean **20.025%**.

### Synthetic workloads: latency and actual bytes

| Input | Generated cases / native passed count | Output bytes | Byte reduction |
| --- | ---: | ---: | ---: |
| 262,144 bytes / 256 KiB | 7,702 / 7,702 | 251 | 99.904% |
| 1,048,576 bytes / 1 MiB | 30,832 / 30,832 | 252 | 99.976% |

| Workload | Path | Wall p50 / p95 / mean ms | Process CPU p50 / p95 / mean ms |
| --- | --- | --- | --- |
| 256 KiB | Core | 3.602 / 4.191 / 3.714 | 3.605 / 4.492 / 3.774 |
| 256 KiB | Adapter, raw off | 3.612 / 4.376 / 3.768 | 3.606 / 4.575 / 3.820 |
| 1 MiB | Core | 18.352 / **26.263** / 18.778 | 26.072 / 52.155 / 26.968 |
| 1 MiB | Adapter, raw off | 18.815 / 25.781 / 19.281 | 26.646 / 51.062 / 27.705 |

**Budget failure:** 1 MiB core p95 26.263 ms exceeds 25 ms. The script printed the
report and exited 1 with `Benchmark p95 budget exceeded; measured report printed above`.
Both adapter budgets and the 256 KiB core budget were met. These are separate sample
distributions, so the adapter p95 being below core p95 does not establish negative
overhead. This run is not a latency acceptance pass.

### Fixture measurements

Files below are under `fixtures/runners/` (first seven) or `fixtures/formats/`.
All passthrough rows remained exact in both core and adapter.

| Fixture | Family | UTF-8 bytes in -> out | Reduction | Core / adapter p95 ms |
| --- | --- | ---: | ---: | ---: |
| `cargo_test_success.txt` | cargo-test | 517 -> 303 | 41.393% | 0.043 / 0.041 |
| `cargo_build_success.txt` | cargo-build | 212 -> 72 | 66.038% | 0.013 / 0.015 |
| `pytest_success.txt` | pytest | 435 -> 334 | 23.218% | 0.019 / 0.030 |
| `go_test_success.txt` | go-test-verbose | 195 -> 89 | 54.359% | 0.025 / 0.029 |
| `build_cargo_errors.txt` | cargo-build | 464 -> 464 | 0%, exact | 0.009 / 0.010 |
| `cargo_test_real_failures.txt` | cargo-test | 2,531 -> 2,531 | 0%, exact | 0.030 / 0.034 |
| `pytest_real_default.txt` | pytest | 1,334 -> 1,334 | 0%, exact | 0.019 / 0.012 |
| `jest_all_passed.txt` | jest | 335 -> 317 | 5.373% | 0.033 / 0.048 |
| `jest_native.txt` | jest | 242 -> 235 | 2.893% | 0.022 / 0.022 |
| `vitest_all_passed.txt` | vitest | 221 -> 203 | 8.145% | 0.027 / 0.030 |
| `vitest_native.txt` | vitest | 322 -> 318 | 1.242% | 0.019 / 0.020 |
| `git_status_mixed.txt` | git-status | 532 -> 282 | 46.992% | 0.025 / 0.028 |
| `grep_single_file_multiple_matches.txt` | rg | 114 -> 79 | 30.702% | 0.020 / 0.041 |
| `lint_tsc_errors.txt` | tsc | 303 -> 303 | 0%, exact | 0.006 / 0.007 |

| Family | Fixtures reduced / passthrough | Total bytes in -> out | Reduction min / median / max / mean % |
| --- | ---: | ---: | --- |
| cargo-test | 1 / 1 | 3,048 -> 2,834 | 0 / 20.696 / 41.393 / 20.696 |
| cargo-build | 1 / 1 | 676 -> 536 | 0 / 33.019 / 66.038 / 33.019 |
| pytest | 1 / 1 | 1,769 -> 1,668 | 0 / 11.609 / 23.218 / 11.609 |
| go-test-verbose | 1 / 0 | 195 -> 89 | 54.359 / 54.359 / 54.359 / 54.359 |
| jest | 2 / 0 | 577 -> 552 | 2.893 / 4.133 / 5.373 / 4.133 |
| vitest | 2 / 0 | 543 -> 521 | 1.242 / 4.694 / 8.145 / 4.694 |
| git-status | 1 / 0 | 532 -> 282 | 46.992 / 46.992 / 46.992 / 46.992 |
| rg | 1 / 0 | 114 -> 79 | 30.702 / 30.702 / 30.702 / 30.702 |
| tsc | 0 / 1 | 303 -> 303 | 0 / 0 / 0 / 0 |

## Historical optimized measurement: 2026-09-30T08:29:49.414Z

Application `795df94` merged into proof `a9d3e77`, rebuilt before measurement. Same
hardware/runtime, workload bytes/counts, 20 warmups/100 samples and reduction distributions
as above. All cases were validated against independent goldens. This sequential recheck
called actual `runBenchmark()` and asserted `budgetsMet`; no concurrent local test/build.

| Workload | Path | Wall p50 / p95 / mean ms | Process CPU p50 / p95 / mean ms |
| --- | --- | --- | --- |
| 256 KiB | Core | 3.301 / 4.346 / 3.518 | 3.302 / 5.397 / 3.697 |
| 256 KiB | Adapter, raw off | 3.329 / 4.162 / 3.465 | 3.331 / 5.282 / 3.624 |
| 1 MiB | Core | 18.683 / 19.608 / 18.275 | 27.822 / 32.551 / 27.012 |
| 1 MiB | Adapter, raw off | 18.200 / 23.789 / 18.009 | 25.849 / 42.453 / 25.321 |

**All four p95 budgets met.** Earlier optimized run 2026-09-30T08:25:38.663Z exited 1:
256 KiB core/adapter p95 17.374/9.057 ms; 1 MiB 24.658/24.446 ms. That 256 KiB miss
remains a failure; the recheck does not erase it. Separate distributions cannot establish
negative adapter overhead. The original 26.263 ms miss above also remains historical.

## Installed proof and verification: 2026-09-30T08:28:39.211Z

Full `--opencode` smoke returned `proved`, `releaseComplete: true`: actual prebuilt
`hugr-lean-0.2.0.tgz`, default-only root/server, all 14 fixtures, exact raw recovery,
physical CLI shim and compiled version/doctor. LICENSE/NOTICE/TRS-MIT: 1066/443/1065 bytes.
Real OpenCode 1.18.17 consumed installed plugin output 1058 -> 248 bytes with exact native
summary/metadata/title/command. Exit-101 Cargo (1058 bytes) and unknown text (52 bytes)
remained exact. Used the retained successful isolated SDK 1.18.17 at
`/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/hugr-opencode-q6clGa/config/opencode`
via HUGR_SMOKE_DEPS; retained hook evidence was checked before reuse. Node consumer
`hugr-lean/server` resolution is proven; package-name host loading remains a separate route.
Historical baseline `546873e` smoke failed `Packed artifact missing: NOTICE`; lead
`795df94` supplied actual notices/bin. Earlier fixture-only notices were not release proof.

Isolated `npm ci`, focused tests and final local macOS `npm run check` passed typecheck, **195 tests,
zero skipped**, and build. Controls include absent dist/exports/notices/CLI/host, empty
or corrupt fixtures/goldens, byte-smaller non-Cargo `x`, undeclared TypeScript import,
stub plugin, HOME-writing prepack nonexecution, ignored install hook and held-pipe timeout.
Enabled prepack/install controls actually failed; prepack wrote only isolated HOME.
Removing the independent golden equality check made its `x` regression fail with
`Missing expected rejection.` Removing failed-output equality likewise failed; both restored.
Forced compiled exit-zero and bad-root-export mutations failed then restored positive proof.
Real-tree `cargo-test` removal failed registry coverage and named the profile; restored.
CI discovers these teeth tests, not latency or real-host proof; CI green alone is neither.
Historical `a9d3e77` Windows push run 36689547295 failed the existing raw concurrency
lock-timeout test; sibling PR run 36689553315 passed. Smoke controls passed in both.

## Cargo streaming verification: 2026-09-30T11:35:28.366Z

Code `9303380`, based on `012bd14`, replaces Cargo's materialized row array with an
`iterateLines(output)` current/take cursor. Only finish, executable, ignored rows and
summary are retained as evidence; passing rows are validated and discarded, while the
name Set still rejects duplicates. `lines(text)` remains `Array.from(iterateLines(text))`;
pytest and Go retain their array parsers. UTF-16 spans and raw line endings are unchanged.

Lead-reported pre-streaming measurements at `012bd14`: 1 MiB core p95 **25.14 ms** and
**25.26 ms**, including a standalone check, both exceeding **25 ms**. These remain
failures alongside the historical misses above; budgets and measurement code are unchanged.

Local `npm ci`, 69 focused line/runner/combined tests (zero skipped), typecheck, build and
structure check completed. Runner acceptance/rejection helpers also exercise the actual
default registry. Coverage includes 1,000 unique Unicode passing rows plus ignored
evidence, CRLF and unterminated summaries, duplicate names, inconsistent counts, empty
suites, unknown/captured output and extra suites after 1,000 blank tail rows. Build still
requires immediate EOF. Unknown rows at every native record boundary still decline.
Mutation probes omitted ignored evidence and removed Cargo's final unknown-tail check:
both runner and default-registry combined tests failed, then passed after restoration.
An eager generator mutation failed the first-request scan oracle (`9 !== 0`); restored.
That oracle instruments newline searches and source slices, not elapsed time.

Compiled default-registry verification checked all 14 independent fixture goldens and
both exact-size synthetic workloads: 262,144/1,048,576 input bytes, 7,702/30,832 passing
tests, 251/252 output bytes. A byte-smaller `x` replacement failed golden verification.
This was correctness verification only, not a latency measurement.

Hardware/runtime checked directly: Intel Core i7-9750H 2.60 GHz, 12 logical CPUs,
16 GiB RAM, x64 Darwin 24.3.0 (`xnu-11215.81.4~3/RELEASE_X86_64`), Node v22.17.1,
V8 12.4.254.21-node.27. The compiled benchmark uses the unchanged actual default
core filter and raw-off adapter, 20 warmups/100 samples per path and case, nearest-rank
p95, independent goldens, and the 5/25 ms core and 10/35 ms adapter budgets above.

Initial measurement was held when process inspection found unrelated orphan
`bun test --timeout 30000`, PID 43714, running for over three days at approximately
100% CPU in `orchestra-canonical/packages/opencode`. The subsequent run below followed
the explicit request to measure once under the recorded background load.

## Cargo streaming measurement, non-isolated: 2026-09-30T11:49:13.095Z

Run once: `node scripts/benchmark.mjs`, compiled code `9303380` at branch head `3159d5e`,
baseline `012bd14`. The report used the hardware/runtime and actual core/adapter method
above, 20 warmups and 100 samples per path and case. All 23 cases (14 fixtures, seven
preservation controls, two synthetic workloads) checked exact independent goldens or
passthrough on every operation. Results: 12 reduced, 11 exact passthrough; fixture
reduction min/median/max/mean 0/6.759/66.038/20.025%.

**Non-isolated background load:** PID 43714 remained active, observed at 100.0% CPU
before and 99.2% after timing. Host 1/5/15-minute load averages were 5.64/5.58/5.35
before and 3.74/5.06/5.16 after. This agent ran no concurrent test/build during timing;
the foreign process was not paused, killed or otherwise modified. These are under-load
budget observations, with no quiet-machine claim.

| Workload | Path | Wall p50 / p95 / mean ms | Process CPU p50 / p95 / mean ms |
| --- | --- | --- | --- |
| 256 KiB | Core | 3.458531 / **4.583775** / 3.692463 | 3.461 / 5.172 / 3.936 |
| 256 KiB | Adapter, raw off | 3.456865 / **4.082128** / 3.542390 | 3.450 / 4.451 / 3.586 |
| 1 MiB | Core | 16.135757 / **17.246847** / 16.004777 | 18.144 / 20.766 / 18.205 |
| 1 MiB | Adapter, raw off | 16.327256 / **17.438423** / 16.143651 | 18.629 / 22.077 / 18.272 |

The synthetic inputs remain exactly 262,144/1,048,576 UTF-8 bytes, with 7,702/30,832
unique passing rows and 251/252 output bytes (99.904251/99.975967% byte reduction).
**All four p95 budgets met under recorded load; exit 0, `budgetsMet: true`.** This was
the first and only post-streaming timed run; no budget waiver or repeat-until-green.
Core and adapter use separate distributions, so their relative p95 values do not measure
adapter overhead by subtraction.

### Historical main versus streaming observation

At main baseline `012bd14`, `lines(output)` retained every Cargo row object and span
array through parsing. Streaming code `9303380` validates and discards passing rows
through a current/take cursor, retaining the same required evidence and duplicate-name
Set. The 1 MiB core comparison is:

| Code / observation | Core p95 ms | Gap to streaming ms | Lower observed p95 % |
| --- | ---: | ---: | ---: |
| `012bd14`, lead-reported check 1 | 25.140000 | 7.893153 | 31.397 |
| `012bd14`, lead-reported check 2 | 25.260000 | 8.013153 | 31.723 |
| `9303380`, this non-isolated run | 17.246847 | 0 | 0 |

These are separate historical sample runs, not a paired same-load experiment. The
25.14/25.26 ms failures and all earlier misses remain recorded above.
