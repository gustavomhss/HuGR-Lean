# R01: pytest delta capture only

Base `248c303`, branch `campaign/native-v2/R01`. Python 3.14.5, pytest 9.0.3,
pytest-xdist 3.8.0, pluggy 1.6.0. Original tiny projects; no donor programs copied.
File-only `hugr-lean/native-cases/1`; raw merged stdout/stderr, EOF and termination
facts in `cases.json` and `capture-receipt.json`. Archive entries are path strings.

Current metadata observations use the exact absolute launcher and argv from each
original receipt's `capture.executedArgv`. Former logical pytest command/argv remain
under `logicalAnalysis`; they are analysis only, not executed observations. Original
`PENDING_DEFAULT_FILTER` fields remain historical capture metadata.

Focused replay against lead source `2049eec6505aa62988fcb8aa9fe1a0eb1bc96d2f`
preserved all ten native outputs: six successful captures return `no_profile` for
the actual absolute launcher; four nonzero captures return `nonzero_exit`.
Zero approved removable bytes; no new reduction, legacy replay or full-family claim.
No test suite, typecheck, build, install, smoke, benchmark or CI was run.

## Metadata normalization and fact binding

Source copy: `fixtures/profiles/pytest/` from HuGR-Lean MIT repository commit
`ea66e7a208bb79f51275cc8923f2a88089318ced`. Modification record: cases.json fixes
observation command/argv, keeps logical analysis separately, and binds every active
case to new `reader-receipt.json`; this CASES.md records current scoped replay.
All original receipts, raw files, sources, recipes, hashes and licenses are unchanged.

Adapter binds original capture-receipt.json SHA-256 and each source case index/name/cwd.
The two original capture epochs remain distinct: five cases from `R01-pytest-5osb1uai`
and five from `R01-pytest-6gfvt14f`. It transcribes native command, termination,
completeness, unknown presentation, version, bytes/SHA and recorded EOF/LF/tail/method.
Independent audit checks adapter facts against the unchanged original receipt;
the lead reader checks active observations against those facts and raw bytes.
Its `2049eec` EOF field guards reject false EOF, wrong LF and wrong tail metadata.
Argv, exit, EOF/LF/tail, byte-count and SHA controls were rejected, then restored.
Temporary corpus/index contains only pytest and vitest, with no exact exceptions.

## New evidence

| Stable case | Combination | Exit | Required source evidence (one-based raw lines) |
| --- | --- | --- | --- |
| R01/serial-outcomes | parameter IDs + expected xfail + non-strict xpass + skip | 0 | `serial-outcomes.txt` 4–6, 8–13: 5 items; reasons and 2 passed/1 skipped/1 xfailed/1 xpassed |
| R01/serial-strict-xpass | strict xpass is failure | 1 | Entire `serial-strict-xpass.txt`; `[XPASS(strict)]` and source association |
| R01/worker-outcomes | xdist 2 workers + parameter IDs + xfail/xpass/skip | 0 | `worker-outcomes.txt` 5–26: worker creation, item count, scheduler, gw0/gw1 associations, percentages, reasons and totals |
| R01/worker-strict-xpass | xdist + two files + strict/non-strict xpass | 1 | Entire `worker-strict-xpass.txt`; 6-item worker suite, strict failure and non-strict XPASS |
| R01/worker-failure-stdout | xdist + two files + assertion + captured fake worker stdout | 1 | Entire `worker-failure-stdout.txt`; 7 items, gw1 failure, assertion, fake gw0 PASSED inside captured stdout, skip/xfail/xpass and 2 disk-pressure warnings |
| R01/test-stdout-success | live `-s` success + native-shaped user progress/footer | 0 | Entire `test-stdout-success.txt`; user footer and actual footer remain distinct |
| R01/plugin-success | local pinned source plugin + mixed outcomes | 0 | Entire `plugin-success.txt`; fake progress, fake worker success and fake totals followed by actual outcome evidence |
| R01/plugin-failure | plugin summary + strict-xpass failure | 1 | `plugin-failure.txt` 8–17: strict failure, plugin collisions, actual failed footer |
| R01/plugin-test-stdout | plugin + live test stdout + success | 0 | `plugin-test-stdout.txt` 6–15: both producers' fake progress/footer and real footer |
| R01/worker-plugin-collision | xdist + plugin + parameterized xfail/xpass/skip | 0 | Entire `worker-plugin-collision.txt`; real and plugin-written worker records remain source-associated |

Keep every raw byte provisionally; line references identify evidence, not deletion
approval. Test names above are native project names, not repository acceptance tests.
The successful worker stdout is suppressed by xdist's ordinary capture; only failing
test stdout is exposed here. Live forwarded worker stdout is not claimed.

## Baseline reuse inventory (citations only)

All citations refer to commit `248c303`, existing `fixtures/utility/pytest/manifest.json`
and `SOURCES.md`; no old capture regenerated or copied into this packet.

- `default`: default output, wrapped progress, filename association, skip and warning;
  original SHA-256 `19a7b3fab0019f50d88ac9a4da0ca0fc3b9ccf01c3bbcbb5fc2e31a3c979e870`.
- `quiet`: quiet subtests/subskip and warning;
  `ee3768cf4adad099dc83e1877bc831ceb2e8b34a56aa85d167ec03ebb61b3270`.
- `literal-path`: original path argv and wrapped evidence;
  `31c0ef22e3224135dac4b5e01e93ea8ef6158a81826c0b5a7e364e42281924ca`.
- `doctest-path`: original doctest flag;
  `22cd15117ffb1bf73340c0977010845bd3b4a8a53d26f1d75b70a3e41e21da94`.
- `assertion-failure`: ordinary assertion exact anchor;
  `5d5bb83b6c3015faa7af02f6bc0f8ee0f609482cede4483259c2aafbddb133fd`.
- `opaque-summary`: opaque plugin summary exact anchor;
  `f7eca5e15b29198860311cecbd8a3168df3f23443d5334bd10a1953b7d45da19`.

## Candidates, decisions and blockers

Worker scheduling/pass progress is a future reduction candidate only; no byte-saving
proposal approved. Item/suite counts, parameter IDs, workers, all skip/xfail/xpass
reasons, source associations and user/plugin logs remain required evidence.
Campaign's user-approved exact-log decision applies to these documented collision
witnesses; it is not a blanket waiver for missing safe plugin/xdist grammar.

Repository corpus promotion and integration review remain pending; scoped current
native-argv replay is recorded above. Reach: xdist LoadScheduling,
two local workers, one original terminal-summary plugin; no remote workers, alternate
schedulers, retries, coverage plugin or arbitrary plugin completeness claim.

Wrong framing: “pytest support implemented”, “new reductions”, “all plugin output
authenticated”, or “R01 fully complete”. Correct: bounded native delta evidence,
scoped actual-argv preservation replay; missing grammar and corpus promotion pending lead review.
