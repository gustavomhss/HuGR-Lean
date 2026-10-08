# C02 Cargo test: approved bounded implementation

State: REVIEW, awaiting independent lead review. Baseline `07ffe15e2263c2925778022194c5385807216603`;
branch `campaign/native-v2/C02`; PR base `campaign/native-integration`.
Lead approved reductions for workspace/package/features/targets/release/controlled-libtest goldens.
`src/profiles/cargo-test.ts` exports only `cargo-test`, prefers valid legacy reductions unchanged, and owns
the bounded delta grammar. Registry integration remains lead-owned. `cases.json.status` is now exercised
through public `filter(observation, { profiles: familyProfiles })`; original `cargoProfiles` stays passthrough
on each new exact argv. The owned acceptance suite ran red before implementation, then passed at checkpoint.

## Native evidence and boundary

Original local fixture programs and collector, MIT; no donor material.
Cargo `1.98.0 (797e8a9bc 2026-08-05)`; rustc/rustdoc `1.98.0 (88d9e12ae 2026-08-18)`.
Platform `darwin/x64`, Rust host/explicit target `x86_64-apple-darwin`.
Native project: two workspace members, no dependencies; offline for every invocation.
Full argv, executable paths, cwd, environment qualifications, start/end, exit, signal/error,
raw UTF-8 byte size/hash, source text/hash before/after and generated lock after are in `provenance/receipt.json`.
The original producer is `provenance/producer.mjs`, pinned by that receipt's SHA-256/size.
Source inventories were recorded before/after execution; the lock was generated and recorded only afterward.
Historical absolute paths remain exact provenance, not reader filesystem requirements.

Boundary: child stdout and stderr share one open regular-file descriptor; native kernel write order,
not stdout/stderr concatenation. stdin ignored, no TTY, 60-second per-command bound; exited/closed
for all cases, no timeout/signal/error/truncation. Presentation remains `unknown` as requested;
`--color never` records actual native color configuration. Blank EOF rows remain native bytes.
Other host environment/Cargo configuration inherited: these captures are not a hermetic-config claim.

## Independent policy and deletion proposal

Goldens were authored with `apply_patch` after reading entire native captures, independently of production code.
The table's 1-based keep rows are an explicit source oracle, not recognition by grammar or output regex.
Keep original Finished row, every executable/suite header, each native summary, and ignored identities/reasons.
Only passing identities from complete, count-consistent, source-known libtest suites may be removed;
remove their `running N` framing, blank rows, and source-known ordinary Cargo compile progress as well.
Summary counts below are passed/ignored/filtered; every suite has zero failed and measured in reduced proposals.
Do not deduplicate workspace suites by `src/lib.rs`: their executable/package associations differ.
No dynamic row is rewritten; retained text/order/newline bytes come from native source rows.
Native compile/summary/finish-looking user logs are never removable merely because their spelling matches Cargo.
Do not transplant this source-known-producer proof to arbitrary host logs without adequate boundaries.

All stems below mean native `<stem>.txt`, independent `<stem>.expected.txt`, stable ID `C02/<stem>`.
Exact argv/status live in `cases.json`; test name is `<stable ID>: public filter native golden; original baseline red or exact witness`
in `tests/profile-cargo-test.test.ts` for every case.
Byte metrics are raw / expected / proposed removed UTF-8 bytes, not runtime performance measurements.

| Stem | New variant / boundary combination | Native counts | Keep rows | Bytes | Proposed disposition |
| --- | --- | --- | --- | --- | --- |
| workspace | `--workspace --lib`; two identical source labels, different executables | alpha 4/2/0; beta 1/0/0 | 3,4,8,9,14,16,21 | 1127/703/424 | reduced |
| workspace-exclude | workspace + `--exclude c02-beta`; cached finish | 4/2/0 | 1,2,6,7,12 | 589/453/136 | reduced |
| package | `-p c02-beta --lib`; member-only executable | 1/0/0 | 1,2,7 | 369/323/46 | reduced |
| features | package + `--no-default-features --features extra`; default removed, extra enabled | 4/2/0 | 2,3,6,9,13 | 709/453/256 | reduced |
| all-features | package + `--all-features`; both feature tests enabled | 5/2/0 | 2,3,6,9,14 | 744/453/291 | reduced |
| target-release | workspace + explicit host `--target` + `--release`; optimized finish and target-triple paths | alpha 4/2/0; beta 1/0/0 | 3,4,7,10,14,16,21 | 1160/736/424 | reduced |
| test-target | package + `--test selected`; selected integration target | 2/0/0 | 2,3,9 | 511/320/191 | reduced |
| bin-target | package + `--bin selected`; `src/bin/selected.rs` suite | 1/0/0 | 2,3,8 | 502/332/170 | reduced |
| exact-filter | package + named filter + `--exact --test-threads=1` | 1/0/5 | 1,2,7 | 371/324/47 | reduced |
| zero-filter | absent exact name; all six tests filtered, native zero run | 0/0/6 | ALL | 343/343/0 | passthrough: no removable material under this policy |
| ignored | select one ignored test + `--ignored --exact`; deferred test executes successfully | 1/0/5 | 1,2,7 | 370/324/46 | reduced |
| include-ignored-skip | `--include-ignored`; two `--skip` selectors; `--test-threads 1` | 4/0/2 | 1,2,10 | 464/324/140 | reduced |
| quiet | `--quiet --test-threads=1`; native `...ii.` has no ignored identity/reason rows | 4/2/0 | ALL | 349/349/0 | negative/refusal: unsafe identity grammar, not promised reduction or no-noise |
| list | `--list`; six requested identities and native `6 tests, 0 benchmarks` | listing, no executed suite | ALL | 387/387/0 | passthrough: requested identities, no removable material |
| nocapture-collision | `--exact --nocapture --test-threads=1`; arbitrary Unicode log and forged progress/finish/pass/summary | real 1/0/5; fake 99/0/0 | ALL | 660/660/0 | passthrough: ambiguous user log; mandatory exact witness |
| show-output-collision | `--exact --show-output`; same logs inside successes section | real 1/0/5; fake 99/0/0 | ALL | 731/731/0 | passthrough: emitted log retention; mandatory exact witness |
| failure | selected ignored failure + `--ignored --exact`; exit 101, panic span/thread/message/help/rerun argv | 0 passed, 1 failed, 5 filtered | ALL | 692/692/0 | passthrough: nonzero, complete diagnostics |

## Approved scope continuation

`provenance/scope-receipt.json` records six new tiny captures, original collector hash, changed source text/hash
before capture, unchanged-after confirmation, actual argv/tool/exit/boundary facts. The disposable project added two
ordinary doctests, a two-test example and `[profile.c02]`; original captures/receipts remained unchanged.
Independent expected files were hand-authored before the implementation. Keep rows:

| Stem | New scope | Keep rows | Required evidence |
| --- | --- | --- | --- |
| doc-target | `-p c02-alpha --doc` | 2,3,9,11 | Finished, Doc-tests, summary, native merged-doctest timing metrics |
| all-targets | `-p c02-alpha --all-targets` | 2,3,7,8,13,15,20,22,28,30,36 | Four distinct lib/bin/integration/example executables, skips, each summary |
| examples | `-p c02-alpha --examples` | 1,2,8 | Finished, example executable, summary |
| example-target | `-p c02-alpha --example selected` | 1,2,8 | Finished, selected example executable, summary |
| custom-profile | `-p c02-beta --lib --profile c02` | 2,3,8 | Exact custom Finished detail, `target/c02/deps` executable, summary |
| multi-package | `-p c02-alpha -p c02-beta --lib` | 1,2,5,6,12,14,19 | Both package executables, skips, suite-local summaries |

### Finite identity and grammar limits

Delta flags before `--`: one `--offline`, one color-never spelling, workspace/excludes or up to eight unique `-p`
names, one selector (`--lib`, `--doc`, `--all-targets`, `--examples`, `--test NAME`, `--bin NAME`, `--example NAME`),
one `--features LIST`/`--no-default-features`/`--all-features`, one `--release` or `--profile IDENTIFIER`,
and `--target TRIPLE`. Identifiers are ASCII letters/underscore followed by letters/digits/underscore/hyphen,
at most 64 characters. Triples contain 2–6 alphanumeric/underscore segments, at most 32 characters each
and 128 overall; JSON target paths remain unclaimed. Features plus all-features, conflicting/repeated selectors,
workspace plus package selection, and feature lists above 16 entries/1024 characters refuse.
Lists contain identifiers or `PACKAGE/FEATURE`, separated
by commas or ASCII spaces within one argv value; quoted space lists keep their exact native command spelling.
Named exact filter goes before `--`; `--exact` goes afterward,
and may also occur without a positional filter to control skip equality. Without `--exact`, skip matching uses substring.
After `--`: `--ignored` or `--include-ignored`, up to eight unique `--skip NAME`, and serial threads exactly
`--test-threads=1` or `--test-threads 1`. `--doc` plus harness arguments is unclaimed and refused.
Quiet/list/nocapture/show-output refuse at identity, even if output appears otherwise reducible.
Unknown argv/lines, duplicate identities/executables, malformed or inconsistent suite totals, unmatched selected
suite kinds, selected executable identities, profile/target paths, filter identity and unsupported metadata refuse complete output.
Source `.rs` paths are structural and independent of target names: custom manifest paths and `src/main.rs` are valid.
Named test/bin/example selectors correlate the normalized target name with a native rustc hash-suffixed executable;
unambiguous name mismatches refuse. Optimization/debug details use finite native syntax, not fixture configuration.
Unicode Rust identities remain valid; punctuation-invalid passing names remain refused.
Zero-filter has no removable passing identity/compile progress and returns undefined, preserving original framing.

## Existing evidence reused, not recaptured

`fixtures/utility/cargo/SOURCES.md` and its authenticated manifest remain regression anchors for default/`--lib`,
multi unit/integration/doctest suites, ignored reasons, native durations, warnings and failures.
`warning/original.log` already has a zero-test doctest suite; this packet adds only a distinct **filtered-zero** variant.
New selected integration/binary/workspace invocations exercise new selectors, not duplicate default captures.

## Checks, controls, and blockers

Capture-phase `npm ci` and `npm run typecheck` completed with exit 0. No production test/check/build/smoke/benchmark/CI
was run in that phase.
A disposable native-project artifact audit checked exact manifest/receipt case correspondence, raw byte/hash fidelity,
source snapshots against native files, producer hash, exact-only golden byte equality, selected-row reduced goldens,
strict byte savings, and one-to-one native/expected file inventory.
It rejected raw truncation and golden final-byte deletion for every case, plus targeted ignored-reason,
forged-passing-identity and diagnostic deletion controls. Controls changed buffers only; disk evidence stayed intact.
The first audit caught missing final blank EOF rows in four hand-authored exact goldens; those goldens were corrected
with `apply_patch`, leaving native captures unchanged. Restored audit completed successfully.
These are capture-fidelity probes, not production parser preservation/admission tests or baseline red/green.

Production checks: only `node --import tsx --test tests/profile-cargo-test.test.ts` and `npm run typecheck`.
The owned file references existing utility full/lib/warning/failure fixtures without copying or editing them.
It checks every native golden, original baseline rejection, UTF-16/CRLF/Unicode, required emitted/declaration spans,
unknown insertions, counters, headers, partial summaries, failed/incomplete metadata, control characters,
closed argv/arity and native-shaped logs. Compiling checkpoint `f9e5ff1` was pushed before production mutation probes.
The final file also checks absolute/relative executable aliases, balanced counter transfers, Unicode passing
identities, doctest names/line indices/timing grammar, and missing selected package suites.

### Production mutation receipts (all restored)

All edits confined to owned `src/profiles/cargo-test.ts`, using `apply_patch`; no fixture/golden mutation.

| Probe | Production mutation | Focused command suffix | Observed failure | Restoration |
| --- | --- | --- | --- | --- |
| count | Delete `uint(result[1]) !== passed` | `--test-name-pattern="C02/package: unknown" tests/profile-cargo-test.test.ts` | exit 1, reduced instead of passthrough for inconsistent passing counter | original comparison restored |
| emitted evidence | Delete `kept.push(test)` from ignored branch | `--test-name-pattern="C02/workspace: public" tests/profile-cargo-test.test.ts` | exit 1, both ignored identity/reason rows missing from golden output | ignored emission restored |
| declared evidence | Replace `reduction(kept)` with emitted spans and empty required spans | `--test-name-pattern="C02/doc-target: public" tests/profile-cargo-test.test.ts` | exit 1, public filter failed_open instead of reduced | source-backed required spans restored |

Each suffix ran with `node --import tsx --test`. Restored full owned-file run and typecheck are the final scoped
checks; no global suite/build/smoke/benchmark or CI dispatch. No mutation is part of the final diff.

**Missing variants (explicitly unclaimed):** benches, standalone native debug `--target` witness (target/release
combination captured), native cross-target or JSON target,
positional substring filters and unrecorded libtest
formats/flags (`--format`, JSON, shuffle, timing). No broader or Cartesian coverage claim; lead owns scope decisions.
Capture collection itself has no tool/version/offline/termination blocker. CI was not dispatched; repository's
candidate-wide manual workflow remains lead-owned and needs one final authorized run after campaign integration.

## Cold-review FIX-FIRST corrections

Named `REVIEW-C02-values`, `REVIEW-C02-paths`, and `REVIEW-C02-exact-skip` tests all failed before the fix,
then passed with the corrected production grammar. Value/path transforms are labeled property evidence,
not native executions: they rename profiles/triples, cover all four supported optimization/debug details,
keep original source-backed headers, and reject argv/output identity mismatches. Exact-prefix skip is a positive;
an emitted fully skipped identity remains a refusal, with substring matching retained when exact is absent.
All original 23 native cases remain byte-unchanged in the owned full-file run. Correction checkpoint `1b62ab5`
was pushed after the named red-to-green tests, full owned-file run and typecheck.

### Tiny native review witnesses

Eight additional native Cargo 1.98 captures use a separate dependency-free project in the disposable native root.
`provenance/review-receipt.json` records source text/hash, exact argv, complete exit-zero/merged boundary facts,
collector hash and generated lock; source files were unchanged during capture. `provenance/review-capture.mjs`
is original MIT evidence, not a golden producer. Expected files were authored with `apply_patch` from full native reads.
The corpus now has 31 native cases, retaining all existing 23; cross-target renames remain labeled properties, not native builds.

| Stem / stable ID `C02/<stem>` | Native fact | Independent keep rows |
| --- | --- | --- |
| review-main-bin | `--bin app` executes `src/main.rs`, basename `app-HASH` | 2,3,9 |
| review-custom-bin | `--bin worker-tool` executes `code/entry.rs`, basename `worker_tool-HASH` | 2,3,9 |
| review-custom-test | `--test verify` executes `checks/custom.rs`, basename `verify-HASH` | 2,3,9 |
| review-custom-example | `--example showroom` executes `code/example.rs`, example artifact | 2,3,9 |
| review-renamed-profile | `--profile review_fast --lib`, custom `code/library.rs`, native `[unoptimized]` | 2,3,10 |
| review-exact-prefix | exact skip `tests::alpha` leaves `alpha_one`, `alpha_two`, `other`; 0 filtered | 2,3,10 |
| review-exact-full | exact skip `tests::alpha_one` removes only that identity; 1 filtered | 1,2,8 |
| review-substring-prefix | non-exact skip `tests::alpha` removes both alpha identities; 2 filtered | 1,2,7 |

Each new case uses its native `.txt` and independent `.expected.txt`, with the same public-filter test naming as above.
The exact-full native output is a valid positive reduction; applying its argv to the prefix capture that still emits
the fully skipped name is the requested negative/refusal witness (`REVIEW-C02-exact-skip`).

### Cold-review production probes, all restored

Each command ran as `node --import tsx --test --test-name-pattern="<name>" tests/profile-cargo-test.test.ts`.
No native capture or golden was mutated. Each probe exited 1 with the named failure, then its production edit was restored.

| Name | Production mutation | Observed red |
| --- | --- | --- |
| REVIEW-C02-exact-skip | Replace exact equality/substring switch with substring-only skips | exact-prefix positive becomes passthrough |
| REVIEW-C02-values | Delete argv versus Finished profile-name comparison | mismatched profile banner incorrectly reduces |
| REVIEW-C02-paths | Delete selected target versus executable-name comparison | mismatched artifact incorrectly reduces |
| C02/review-main-bin: unknown | Delete passing-counter reconciliation | inconsistent summary incorrectly reduces |
| C02/review-renamed-profile: public | Emit spans with empty required declarations | public filter fails_open instead of valid reduction |

Final scoped checks after restoration: complete owned-file suite **92 passed, 0 failed/skipped**, and
`npm run typecheck` exited 0. Bounds tests additionally
exercise a 64-character project-profile rename, invalid/overlong names and triples, and unsupported Finished detail syntax.
Production/test code remains below the 400-line target. No shared files, legacy fixtures/tests, registry/core or CI edits.

## Lead default-path and feature-list gap closure

Legacy success remains preferred, including exact legacy required spans. A legacy refusal now proceeds through the
**complete** closed delta parser instead of ending recognition. Unknown output, pre-Finished warnings, incomplete
metadata, failures and user logs still refuse; refusal is not preserved merely because the old parser lacks a valid variant.

`provenance/default-features-receipt.json` records four new original native cases. The first command is literally
**`cargo test`**, spawned with argv **`["test"]`** in the tiny workspace. No `--workspace`, `--offline` or color flags
were added; offline/color configuration is environment evidence only. This is the missing default-workspace case,
not a recapture of admitted default single-package behavior. Independent keep rows retain every library/bin/test/doc
header, summary, skip reason and native merged-doctest metric, including both distinct `src/lib.rs` executables.

| Stable stem `C02/<stem>` | Native combination / observed evidence | Independent keep rows |
| --- | --- | --- |
| default-workspace | bare default workspace: four executable suites plus two doctest suites; original parser refuses | 3,4,7,9,14,16,21,23,29,31,36,38,44,46,47,51 |
| workspace-feature-comma | workspace/lib/no-default + comma-separated qualified alpha extra/more and beta extra; both members' feature tests run | 3,4,7,8,15,17,23 |
| workspace-feature-space | workspace/lib/no-default + one quoted space-list value; alpha extra/more and beta more run | 2,3,6,7,14,16,22 |
| package-feature-list | package/lib + comma unqualified extra/more and no-default; both feature tests run | 1,2,5,6,13 |

All prior native/expected files remain untouched; corpus now contains 35 cases. Command-to-native-argv equality is
checked explicitly for every case, including quoted space values. Collectors never emit expected files.
Workspace-qualified forwarding is now an explicit native positive. Labeled full-flag properties use different
project names and mixed list separators without imposing fixture-specific names; malformed/overlong entries refuse.

`LEAD-C02-default-fallback` and `LEAD-C02-feature-lists` both went red before the production fix, then passed.
The default test compares legacy successes directly, and rejects warnings before Finished plus genuine log/failure
witnesses even under bare argv. Production guard probes and restored final verification are recorded below after execution.
