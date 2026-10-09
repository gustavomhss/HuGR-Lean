# R02 Jest: delta captures

Initial capture base `248c303`, checkpoint `56cc2f3`; follow-up branch
`campaign/jest-config-captures`; ownership `fixtures/profiles/jest/**`.
Capture-only packet. `cases.json` uses `hugr-lean/native-cases/1`, 14 file-only inputs,
original argv and desired exact dispositions. Eleven original exact cases remain
`pending-policy`; passing snapshot and two config-only witnesses are `baseline-bug`.
Historical `BASELINE_PRESERVED` reduction was observed, not an approved current golden.
Config-only witness proves its marker substitutions unsafe; current desired status is passthrough.

## Reuse

Reference existing `fixtures/formats/jest_all_passed.txt`, `jest_native.txt`,
`formats/native/jest-native.test.cjs`, `formats/SOURCES.md`, `installed-goldens.json`.
These cover plain all-pass suites and verbose Unicode/nested names; no recopied anchors.
`fixtures/runners/SOURCES.md` and `src/profiles/runners.ts` cover other runner families.
`tests/real-timed-jest.test.ts` is synthetic timed assertion evidence, not failed-snapshot proof.
Actual Jest grammar remains `src/profiles/formats.ts`.

## New coverage

Each input is `captures/<suffix>/input.txt`; ID prefix `R02-`.
Exact expected evidence is the entire raw file, hash-bound by capture receipt.
No acceptance test added or run; lead-owned corpus integration remains pending.

| Suffix | Native evidence / combination | Baseline status/reason | Saved bytes |
| --- | --- | --- | ---: |
| snapshot-written | Native update writes snapshot; counts and update advice | passthrough / unsupported_output | 0 |
| snapshot-passed | Passing nonempty snapshot + verbose Unicode name | desired passthrough; historical reduced / profile_reduction | 0 |
| snapshot-failed | Changed received count; snapshot name/diff/source/caret/stack/summary, exit 1 | passthrough / nonzero_exit | 0 |
| skip-todo | Active test + named skip/todo reasons, counts | passthrough / unsupported_output | 0 |
| log-snapshot-written | Console log/warn + source context + skip/todo + new snapshot | passthrough / unsupported_output | 0 |
| log-snapshot-passed | Same log/skip/todo + passing snapshot | passthrough / unsupported_output | 0 |
| coverage-snapshot | Passing snapshot + text branch metrics + JSON/LCOV/HTML attachments | passthrough / unsupported_output | 0 |
| multiproject-coverage-log-skip-snapshot | alpha/beta suite association + skipped suite + skips/todo/logs + snapshots + coverage | passthrough / unsupported_output | 0 |
| json-default-log-snapshot | Default human stream + requested JSON result path + full JSON attachment | passthrough / unsupported_output | 0 |
| reporter-collision-default | Real default reporter interleaved with custom native-looking progress | passthrough / no_profile | 0 |
| reporter-collision-only | Custom reporter alone emits valid all-pass grammar | passthrough / no_profile | 0 |
| skipped-suite | Entire suite skipped; skip/test/snapshot totals and no passing suite | passthrough / unsupported_output | 0 |
| config-collision | Actual `jest --config=config-collision.cjs`; existing reporter emits 160 bytes | desired passthrough; lead incorrectly reduces to 157 | 0 |
| config-full-collision | Actual `jest --config=config-full-collision.cjs`; reporter emits 196 bytes with ✓ body | desired passthrough; lead incorrectly reduces to 191 | 0 |

## Historical golden and baseline observation

`captures/snapshot-passed/expected.txt` was hand-authored after reading native input:
only `PASS ` becomes `+ ` and success glyph becomes `- `. Every remaining byte stays,
including snapshot count, Unicode, test timing, aggregate estimate and selector summary.
Raw 237 UTF-8 bytes historically became 232. This remains historical bug evidence,
not approved desired output. `historicalExpectedFile` archives it without binding it as
current golden. Historical receipts and `baseline-observations.json` remain byte-identical.

Historical `classify.mjs` called existing public filter once per original capture and recorded results in
`baseline-observations.json`. In-memory changed snapshot diff proves hash control detects
corruption. Reporter-only text under a counterfactual `jest` command reduces: evidence that
grammar alone cannot authenticate reporter identity. Counterfactual is explicitly marked;
native explicit case keeps original `--reporters` argv and exact passthrough.
Do not rerun historical classification against expanded desired-exact manifest.
`config-lead-replay.json` now records actual config-only argv, proving the missing boundary
without a synthetic command substitution. `CONFIG-FINDINGS.md` documents frozen lead replay.
No suite/typecheck/fullcheck/smoke/benchmark/CI or runtime mutation performed.

## Policy and reach

`CANDIDATES.md` lists decisions still needed. Capture does not authorize deletion or waive
missing variants. Tested combinations cover this packet's named variants, not all Jest
reporters, providers, plugins, project configurations, watch mode, platforms or versions.
No terminal/PTY capture or Windows claim. No new runtime compatibility claim.
