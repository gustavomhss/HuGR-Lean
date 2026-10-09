# R03 interrupted capture checkpoint

Baseline: `248c303cb208f237896c0c6aaba777752aa481f5`.
State: BLOCKED / capture recovery only. No case is promoted into the native corpus.

| Case | Existing evidence | Gap / disposition |
| --- | --- | --- |
| R03-default-projects | Raw RUN v3.2.4; alpha/beta paths; retry attempts 1/2; stdout/stderr; skip/todo totals; duration | Capture receipt lost before final write. Exit code, exact executed argv/environment/platform and process EOF not authenticated. Archive only, completeness unknown. |
| R03-verbose-coverage | Recipe and authored source only | No raw capture or coverage metrics/artifact available. BLOCKED. |
| R03-dot-projects | Recipe only | No raw capture. BLOCKED. |
| R03-json-projects | Recipe only | No raw capture. BLOCKED. |
| R03-junit-projects | Recipe only | No raw capture. BLOCKED. |
| R03-multiple-reporters | Recipe only | No raw capture. BLOCKED. |
| R03-retry-exhausted-coverage | Conditional failing test and recipe only | No failed exit, exhausted retry or failure-coverage evidence. BLOCKED. |
| R03-user-reporter-explicit | Authored native-shaped collision reporter and recipe only | No native reporter invocation witness. BLOCKED. |
| R03-user-reporter-config | Authored config collision and recipe only | No native invocation or baseline-filter golden. BLOCKED. |

Raw evidence required intact: project/file/suite associations; both retry attempt messages;
stdout and stderr bodies; per-file counts; aggregate passed/skipped/todo counts; start/duration.
Source expectation: alpha has two passing tests, one skip, one todo; beta has one passing test,
one explicit skip and one conditional skip. Observed raw agrees with these labels, but cannot
establish captured process termination or complete host boundary.

No removable bytes or new reduction candidate approved. Native-shaped user reporter output is
ambiguous user evidence; exact-preservation scope decision in campaign lines 217–221 applies
after an actual witness and independent review. It does not waive these missing captures.
Public-filter disposition and acceptance tests remain pending; no runtime filter was executed.

## Baseline reuse (citations only)

At the baseline above, reuse `fixtures/formats/vitest_native.txt`, its reproduction inputs and
`fixtures/formats/SOURCES.md` lines 24–40; `vitest_all_passed.txt` remains the pinned donor anchor
documented at lines 5–15. Existing expected outputs live in `tests/formats.test.ts` and
`tests/combined.test.ts`; existing failure/log boundaries in `tests/real-runner-boundaries.test.ts`,
`tests/real-evidence-binding.test.ts` and `tests/real-evidence.test.ts`. No duplicate captures.

## Stop receipt

User halted work after disk exhaustion and harness snapshot interruption: no further installs,
downloads, builds, native captures, full checks, typechecks or CI. This checkpoint preserves existing
bytes and records availability only. No compiling/test-green/completeness claim. Lead review pending.
