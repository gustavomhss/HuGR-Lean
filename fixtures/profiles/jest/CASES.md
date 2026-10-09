# R02 Jest: delta captures

Base `248c303`; branch `campaign/native-v2/R02`; ownership `fixtures/profiles/jest/**`.
Capture-only packet. `cases.json` uses `hugr-lean/native-cases/1`, file-only inputs,
original argv and measured baseline dispositions. Eleven exact cases remain `pending-policy`.
Passing snapshot is `BASELINE_PRESERVED`, not fake passthrough or new reduction support.

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
| snapshot-passed | Passing nonempty snapshot + verbose Unicode name | reduced / profile_reduction | 5 |
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

## Independent golden and baseline observation

`captures/snapshot-passed/expected.txt` was hand-authored after reading native input:
only `PASS ` becomes `+ ` and success glyph becomes `- `. Every remaining byte stays,
including snapshot count, Unicode, test timing, aggregate estimate and selector summary.
Raw 237 UTF-8 bytes becomes 232. Baseline already supports this shape.

`classify.mjs` calls existing public filter once per capture and records actual results in
`baseline-observations.json`. In-memory changed snapshot diff proves hash control detects
corruption. Reporter-only text under a counterfactual `jest` command reduces: evidence that
grammar alone cannot authenticate reporter identity. Counterfactual is explicitly marked;
native case keeps original `--reporters` argv and exact passthrough.
No suite/typecheck/fullcheck/smoke/benchmark/CI or runtime mutation performed.

## Policy and reach

`CANDIDATES.md` lists decisions still needed. Capture does not authorize deletion or waive
missing variants. Tested combinations cover this packet's named variants, not all Jest
reporters, providers, plugins, project configurations, watch mode, platforms or versions.
No terminal/PTY capture or Windows claim. No new runtime compatibility claim.
