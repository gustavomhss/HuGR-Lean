# Real-world evaluation: 2026-09-30

**HuGR-Lean 0.2.0 preserves the sampled evidence but fails the practical noise-reduction goal on this corpus.**
The primary workload executes 24 ordinary commands in six pinned repositories: itoa, gjson, boltons, ms, ufo and HuGR-Lean. Only two commands reduce (8.333% coverage); neither saves a material amount. Whole-session savings are **471 / 1,272,795 UTF-8 bytes = 0.037005%**.

| Verdict | Result and scope |
| --- | --- |
| Safety | **PASS for this sample:** all 30 native captures pass the calibrated independent evidence checks; five intended failures remain byte-exact. This is not universal safety proof. |
| Practical noise reduction | **FAIL for this corpus:** 2/24 primary cases reduce, 0/24 are material; 22 passthrough zeros remain in the denominator. |
| Speed | **Low overhead in this corrected replay sample:** maximum per-case wall p95 is 3.089/2.279 ms for small inputs and 20.831/27.263 ms for the 1,216,956-byte exact diff (core/raw-off adapter). CPU contention was uncontrolled. |
| Host boundary | **PASS for the sampled OpenCode route:** seven native scenarios plus two strict-oracle control rechecks verify actual model-bound results. |

## Method and provenance

The [workload contract](../scripts/real-world/README.md), [source/license pins](benchmark/real-world-20260930/SOURCES.md) and [compact machine-readable results](benchmark/real-world-20260930/summary.json) define the scope. The existing [fixture/synthetic benchmark](BENCHMARK.md) remains a separate experiment. Production source and profiles were unchanged for this evaluation.

Commands ran literally in isolated pinned checkouts. Setup, downloads, cold-cache preparation and controlled edits are outside filter timing. Capture retains stdout/stderr arrival-order bytes, separate streams, native exit/signal, completeness and command wall duration. Every planned case completed: 24 primary + six controls, no missing case and no skipped case counted as success. `tsc --noEmit` really exited 0 with empty output; only that catalog entry explicitly permits an empty capture.

The compiled default core and `createAfterHook({raw:false})` process the same immutable captures: 20 warmups and 100 samples per path and case. Core timing brackets filtering; adapter timing includes fresh host-result construction and the awaited hook with existing immutable host metadata. Module loading, assertions, oracle checks and disk writes are outside timing. Wall/process user+system CPU p50/p95/mean use nearest-rank percentiles; CPU includes process/GC/sampling work, not isolated attribution. Core and adapter distributions are separate, so subtraction does not measure adapter overhead.

Evidence checks independently identify native summaries, identities, diagnostics, ignored/skipped context, Git facts and ripgrep path/line/content records. Unknown, unsupported, failed and exact surfaces require the whole original. ANSI inspection is only for signal discovery; captured bytes are not stripped. No LLM judge, tokenizer or remote model evaluation is used. Byte/line savings do not establish token savings, model quality, monetary savings or general utility; unchanged source-code reads still count.

## Primary whole-session results

| Workload | Cases / reduced / material | UTF-8 bytes in → out | Saved | Weighted reduction |
| --- | ---: | ---: | ---: | ---: |
| **Primary, all commands** | **24 / 2 / 0** | **1,272,795 → 1,272,324** | **471** | **0.037005%** |
| Controls, separate | 6 / 1 / 0 | 17,770 → 17,520 | 250 | 1.406866% |
| Secondary decomposition: primary excluding only `git-diff-history` | 23 / 2 / 0 | 55,839 → 55,368 | 471 | 0.843496% |

The 1,216,956-byte `git diff HEAD~1` dominates the full session and stays exact. The exclusion above explains that denominator; it is **secondary**, not a replacement primary result or a selected-success score. Even that subset saves only 471 bytes. Material means at least 1,024 bytes **and** 10% of that case's input. Primary per-case reduction min/median/max/unweighted mean is 0/0/67.123288/3.159804%; the high maximum belongs to a 219-byte cold build, not a useful whole-session reduction.

### All 24 primary cases

All exits are 0. `pass` below means exact passthrough; reason names are the actual core decisions. Timing columns are corrected **replay wall p95 milliseconds**, not native command durations. `summary.json` also retains capture durations, line counts and wall/CPU p50/p95/mean.

| Case / project | Actual command | Bytes in → out | Decision / reason | Core / adapter p95 ms |
| --- | --- | ---: | --- | ---: |
| `cargo-build-cold` / itoa | `cargo build` | 219 → 72 | reduced / `profile_reduction` | 0.511 / 0.856 |
| `cargo-build-warm` / itoa | `cargo build` | 72 → 72 | pass / `not_smaller` | 0.590 / 0.157 |
| `cargo-test` / itoa | `cargo test` | 2,385 → 2,385 | pass / `unsupported_output` | 1.870 / 1.441 |
| `cargo-test-lib` / itoa | `cargo test --lib` | 262 → 262 | pass / `no_profile` | 0.027 / 0.040 |
| `go-test-verbose-cold` / gjson | `go test -v ./...` | 6,072 → 6,072 | pass / `no_profile` | 0.104 / 0.480 |
| `go-test-verbose-cached` / gjson | `go test -v ./...` | 6,073 → 6,073 | pass / `no_profile` | 0.014 / 0.042 |
| `go-test-default` / gjson | `go test` | 43 → 43 | pass / `no_profile` | 0.367 / 0.193 |
| `pytest-default` / boltons | `pytest` | 4,995 → 4,995 | pass / `unsupported_output` | 2.890 / 1.134 |
| `pytest-quiet` / boltons | `pytest -q` | 2,633 → 2,633 | pass / `no_profile` | 0.201 / 0.169 |
| `pytest-upstream-doctests` / boltons | `pytest --doctest-modules boltons tests` | 6,515 → 6,515 | pass / `no_profile` | 0.279 / 0.194 |
| `jest-direct` / ms | `jest --env node` | 706 → 706 | pass / `unsupported_output` | 1.524 / 0.742 |
| `jest-npm` / ms | `npm run test:nodejs` | 721 → 721 | pass / `no_profile` | 0.015 / 0.097 |
| `vitest-direct` / ufo | `vitest run` | 1,749 → 1,749 | pass / `unsupported_output` | 0.134 / 0.188 |
| `vitest-npm` / ufo | `npm test` | 2,361 → 2,361 | pass / `no_profile` | 0.116 / 0.036 |
| `ufo-lint` / ufo | `npm run lint` | 120 → 120 | pass / `no_profile` | 0.019 / 0.037 |
| `hugr-build` / hugr | `npm run build` | 51 → 51 | pass / `no_profile` | 0.007 / 0.041 |
| `hugr-typecheck` / hugr | `npm run typecheck` | 45 → 45 | pass / `no_profile` | 0.016 / 0.058 |
| `hugr-tsc-direct` / hugr | `tsc --noEmit` | 0 → 0 | pass / `unsupported_output` | 0.095 / 0.032 |
| `hugr-native-tests` / hugr | `tsx --test tests/core.test.ts tests/runners.test.ts` | 12,554 → 12,554 | pass / `no_profile` | 0.033 / 0.285 |
| `git-status-clean` / hugr | `git status` | 63 → 63 | pass / `unsupported_output` | 0.229 / 0.278 |
| `rg-source` / hugr | `rg -n 'export' src` | 3,719 → 3,395 | reduced / `profile_reduction` | 3.089 / 2.279 |
| `git-diff-history` / hugr | `git diff HEAD~1` | 1,216,956 → 1,216,956 | pass / `unsupported_command` | 20.831 / 27.263 |
| `read-readme` / hugr | `cat README.md` | 4,301 → 4,301 | pass / `no_profile` | 0.028 / 1.384 |
| `ls-repository` / hugr | `ls` | 180 → 180 | pass / `no_profile` | 0.869 / 1.378 |

### All six controls, excluded from primary savings

| Case / project | Actual command | Exit | Bytes in → out | Decision / reason | Core / adapter p95 ms |
| --- | --- | ---: | ---: | --- | ---: |
| `cargo-compile-failure` / itoa | `cargo build` | 101 | 365 → 365 | pass / `nonzero_exit` | 0.026 / 0.897 |
| `go-test-failure` / gjson | `go test -v ./...` | 1 | 6,215 → 6,215 | pass / `nonzero_exit` | 0.361 / 0.041 |
| `pytest-failure` / boltons | `pytest` | 1 | 5,610 → 5,610 | pass / `nonzero_exit` | 0.009 / 0.013 |
| `jest-failure` / ms | `jest --env node` | 1 | 1,239 → 1,239 | pass / `nonzero_exit` | 0.057 / 0.041 |
| `vitest-failure` / ufo | `vitest run` | 1 | 3,925 → 3,925 | pass / `nonzero_exit` | 0.017 / 0.869 |
| `git-status-mixed` / hugr | `git status` | 0 | 416 → 166 | reduced / `profile_reduction` | 0.366 / 0.404 |

All five failure controls contain `BENCH_EXPECTED_FAILURE` bound to native compiler/assertion diagnostics and a failed identity/result, not merely a quoted marker. Git's controlled worktree saves 250 bytes of advice; it is not ordinary-project coverage.

## Preserved failures and instrument corrections

The original `report.json` remains **`state: "failed"`**. Its Jest oracle rejected `FAIL src/bench-expected-failure.test.ts (9.068 s)` because its suite-identity detector did not admit Jest's slow-suite timing annotation. The retained violation is `jest-failure: failure_binding: intended failure lacks framework-bound failed identity, assertion/compiler diagnostics or native failed result`. `analysis.json` rechecks the identical captured bytes with that detector calibrated; it reports all 30 evidence checks passing. This changes the oracle verdict, not the capture or production filter.

Publication verification found a later `analysis.json` inspection at `2026-09-30T23:18:47.518Z`. Its bytes differ from the initially documented `21:43:32.587Z` analysis only in `inspectedAt`: replacing that timestamp in a separate copy exactly reproduces the previously recorded SHA-256. The bundle retains the current file unchanged and adds that byte-exact historical recovery as `analysis-20260930T214332587Z.json`, explicitly identified as reconstructed metadata. Captures, evidence verdicts and timings are unchanged.

A **20-minute outer harness timeout** interrupted the run; it resumed at `2026-09-30T21:30:25.732Z` with 17 completed cases retained. The final capture window is `20:50:58.449Z`–`21:40:22.352Z` (49.398 minutes, including interruption/resumption). Summed native capture wall time is 22.016 minutes primary + 2.676 minutes controls. These durations include native compilation/test work; they are neither filter overhead nor command-runtime p95. Interrupted/unmeasured work was not replaced by empty-success rows.

The original large-diff adapter p95 **137.839509 ms** included `structuredClone` of large host metadata inside the measurement timer. That is an invalid instrument observation for Lean's production hook cost, retained rather than silently discarded. Corrected `replay.json`, recorded at `2026-09-30T21:50:30.050Z`, reuses existing immutable metadata and times fresh result construction plus the actual awaited hook. Every output/decision remains unchanged; this is an instrument correction, not a production optimization or repeat-until-green selection.

| Exact diff, 1,216,956 bytes | Core wall p50 / p95 / mean ms | Raw-off adapter wall p50 / p95 / mean ms |
| --- | --- | --- |
| Original observation | 4.389691 / 26.339952 / 8.327941 | 25.204375 / **137.839509** / 44.692874 |
| Corrected replay | 3.424075 / **20.831101** / 6.539298 | 3.386582 / **27.263047** / 6.719998 |

The other 29 inputs range from 0 to 12,554 bytes. Their maximum per-case p95 is 3.089149 ms core / 2.279075 ms adapter. These are maxima of per-case percentiles, not a pooled session percentile, an isolated acceptance run, or the synthetic 1 MiB budget test.

Captured hardware/runtime metadata: Intel Core i7-9750H 2.60 GHz, 12 logical CPUs, 16 GiB RAM, x64 macOS/Darwin 24.3.0, Node v22.17.1, V8 12.4.254.21-node.27. Native-capture load averages were 190.520/199.051/183.720 before and 365.967/338.834/287.186 after; CPU was not isolated. **Known replay metadata defect:** published `replay.json` copied those original capture load values. They are not replay-time load measurements; no quiet-machine or measured replay-load claim is made.

Tool versions: npm 10.9.2, Cargo/rustc 1.98.0, Go 1.27.1, Git 2.51.0, ripgrep 14.1.1, Python 3.14.5, pytest 9.0.3, Jest 30.0.5, Vitest 4.1.5, TypeScript 5.9.3, tsx 4.23.15, pnpm 10.33.2. ms declares pnpm 10.33.0; the actual 10.33.2 run and verified frozen-lock hashes are recorded. ufo's blocked dependency-build warnings remain in setup logs.

## Actual OpenCode model boundary

OpenCode **1.18.17 on macOS x64** executed native commands through legacy `opencode run`, using isolated HOME/XDG/config, the compiled file plugin with raw off, and a local HTTP/SSE model mock. The mock supplies tool calls, not output. Observer sidecars retain the original after-hook boundary and the model's second request. Native metadata, title, command and full arguments are checked separately from model-visible text.

| Scenario / category | Native command | Boundary bytes → model bytes | Setup / host-session ms |
| --- | --- | ---: | ---: |
| Git status / control | `git status` | 431 → 181 | 6,092.748 / 6,086.575 |
| Source search / primary | `rg -n 'readonly' src` | 3,827 → 3,095 | 5,742.254 / 6,900.928 |
| Diff / primary | `git diff -- README.md` | 544 → 544 | 8,947.805 / 6,903.976 |
| Native Cargo fixture / control | `cargo test` | 499 → 302 | 6,258.625 / 9,774.400 |
| Unknown read / primary | `cat README.md` | 4,340 → 4,340 | 7,247.401 / 7,830.840 |
| Native Git failure / control | `git show missing-HuGR-real-host-ref` | 207 → 207, exit 128 | 9,563.673 / 9,352.729 |
| Upstream truncation stress / control | `git status --untracked-files=all` | 51,311 → 51,311 | 10,450.876 / 9,188.865 |

The Cargo command runs a committed local runner fixture, not another upstream project. Stress generates 1,800 native Git entries: full native output is 171,431 bytes; OpenCode truncates upstream to a 51,311-byte boundary with `truncated: true` and an `outputPath`. Lean preserves that exact boundary with zero savings. The missing 120,120 bytes are host truncation, not Lean reduction or full-stdout recovery.

The strict-oracle recheck separately records Git 431→181 (7,284.270 ms setup / 6,823.818 ms session) and native Cargo 499→302 (5,944.955 / 8,108.152 ms), with full issued/observed/native arguments and Cargo grammar admission. Artifact verification also applies the current strict oracle to the original seven sidecars. These control repetitions are not added to primary savings.

The full host suite takes 122,356.761 ms including preparation; top-level setup is 11,931.871 ms, including fresh pinned-SDK npm bootstrap of 8,811.837 ms. `OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER=1` disables background watching. Host load and bootstrap mode are recorded; CPU remains uncontrolled. **Host-session times include startup, mock traffic and native commands, not filter CPU.** Single hook observations in the artifacts are not a hook-latency distribution.

## Why coverage is low; next priorities

- Cargo: multiple suites/doctests and the `4m 24s` compile-duration spelling are outside the admitted grammar; `--lib` is outside the command identity allowlist.
- Go: `./...` is outside the admitted verbose identity, cached summaries are unsupported, and default `go test` is not a verbose profile.
- Python: warnings, subtest summaries, quiet flags and doctest/path arguments exceed the supported grammar/identity.
- Jest: coverage tables and newer native timing/output variants are unsupported. Vitest 4 emits ANSI/native variants beyond the admitted grammar.
- npm scripts have opaque child-runner identity; build/lint wrappers, Node TAP, reads and listings are unsupported/exact surfaces. Clean Git output also falls outside the current admitted grammar.

Future work should first bind command identity from trustworthy execution metadata, then add complete native grammars for common Cargo/Go/pytest/Jest/Vitest variants with preservation controls. **Never guess a wrapper's child runner from output appearance.** Preserve warnings, diagnostics and unknown rows; rerun the entire declared corpus with the exact diff and passthrough zeros retained. This corpus rejects practical usefulness today even though sampled preservation and low processing overhead are demonstrated.

## Reproduction and verification

The [public evidence bundle](https://github.com/gmhelmold/HuGR-Lean/releases/download/v0.2.0/hugr-lean-real-world-20260930.tar.gz) contains native gzip bodies, failed/corrected reports, host sidecars, setup logs, complete licenses and a read-only verifier. Its [SHA-256 file](https://github.com/gmhelmold/HuGR-Lean/releases/download/v0.2.0/hugr-lean-real-world-20260930.tar.gz.sha256) records `ce98ba7e6f0a6f26d67c861184e93f3ed53a22072f4b0419697a0d7d0c5017b7` (archive: 2,242,474 bytes). A fresh GitHub download passed checksum and complete verification: 638 inventory files, 30 captures, 120 native gzip streams and nine host scenarios. `SOURCES.md` records provenance and retained producer paths; the compact summary excludes raw bodies.

For read-only inspection, download/extract the archive, clone this repository at harness commit `29d2b562ac23bf51a3e83c7afa4c4ac1bd4154ed`, and run `npm ci` then `npm run build` in that checkout. Run `node hugr-lean-real-world-20260930/verify.mjs /absolute/path/to/pinned-checkout`. The verifier reads the archive-local catalog, checks immutable Git-object report pins and recomputes declared metrics; original absolute producer paths are not dereferenced. The bundled report snapshot predates the public download link. Verification runs one core/raw-off adapter evaluation per capture and rechecks retained host evidence; it does not execute native workloads or generate new latency samples. Independent destructive controls reject lost/duplicated host roots, forged historical digests and contradictory advertised metrics.

Build with `npm ci`, `npm run typecheck`, `npm run structure`, `npm run build`. Capture with `node scripts/real-world/run.mjs NEW_OUTPUT_DIR`; host reproduction is `node scripts/real-world/host.mjs NEW_OUTPUT_DIR`. The final runner requires an empty output directory and fresh isolated provisioning; it supports neither `--prepared` nor `--resume`. The historical interrupted/resumed capture above remains evidence of the earlier harness, not a supported reproduction route. Setup/network time remains separate.

`node scripts/real-world/analyze.mjs OUTPUT_DIR` and `node scripts/real-world/replay.mjs OUTPUT_DIR` verify existing captures before writing derived reports. Run these only on archive copies to retain the historical `analysis.json` and `replay.json` as well as the original failed report. The historical report's absolute `setup.root` must point to its retained catalog on the inspecting machine; preserve the original report and record any relocation in the inspection copy.

Report verification decodes and rehashes all 120 native gzip files, checks UTF-8 roundtrips and catalog/capture/replay identity, recomputes aggregates and checks all host sidecars. Positive controls reject missing/duplicate cases, empty aggregates, lost Cargo summaries, lost Jest failure identity, wrong native failure exits and lost Git facts; mutations affect only in-memory copies. Focused existing evidence/host tests exercise additional destructive controls. The structure check covers code roots and module-document presence, not the truth of this report; CI green alone does not prove real-host execution or benchmark usefulness.
