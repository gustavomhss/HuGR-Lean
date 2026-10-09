# R03 native delta packet and historical interruption

## Resumed capture: current state

User authorized cleanup and isolated pinned reinstall after disk recovery. `npm ci --ignore-scripts`
used committed lock in a fresh private scratch. `capture-receipt.json` records executed Node/CLI argv,
cwd, environment overrides, exit, version check, platform, merged-pipe EOF, SHA-256, byte length and tail.
`cases.json` is file-only `hugr-lean/native-cases/1`; archives are relative path strings.

| Case | New native evidence / required combination | Actual baseline logical-argv disposition |
| --- | --- | --- |
| R03-default-projects-resumed | alpha/beta projects; retry success; stdout/stderr; skip/todo totals | exact / unsupported_output |
| R03-verbose-coverage | Named suites/tests/projects/skips/todo; retry logs; V8 text and JSON-summary metrics | exact / no_profile |
| R03-dot-projects | Dot progress + projects/retries/logs/skips/todo totals | exact / no_profile |
| R03-json-projects | Native JSON suites/paths/assertions/counts; successful retry retains first failureMessages | exact / no_profile |
| R03-junit-projects | XML file suites/names/counts/skipped; system-out and system-err include logs/retry attempts | exact / no_profile |
| R03-multiple-reporters | Default human output and JSON in same merged stream | exact / no_profile |
| R03-retry-exhausted-coverage | Two failed attempts; project/suite/source frame/expected/actual; failed totals; coverage on failure | exact / nonzero_exit (1) |
| R03-user-reporter-explicit | Arbitrary reporter emits native-shaped fake results instead of actual seven tests | exact / no_profile |
| R03-user-reporter-config | Duplicate --config failure, preserved as actual recipe-error witness | exact / nonzero_exit (1); not valid collision proof |
| R03-user-reporter-config-valid | Single config loads same arbitrary reporter; output byte-identical to explicit witness | reduced / profile_reduction; unsafe baseline behavior |
| R03-direct-default-projects | Actual direct vitest argv, same projects/retries/logs/skips/todo source | exact / unsupported_output |
| R03-direct-reporter-explicit | Actual direct vitest argv with explicit arbitrary reporter | exact / no_profile |
| R03-direct-reporter-config | Actual direct vitest argv with config-only arbitrary reporter | reduced / profile_reduction; unsafe baseline behavior |

Frozen baseline: `248c303cb208f237896c0c6aaba777752aa481f5`. `close.mjs` replays each captured
output through default core using actual executed argv in manifest. Initial matrix launches Node +
pinned Vitest entrypoint; those actual observations stay exact (no_profile or nonzero_exit).
The table additionally shows explicitly labeled logical Vitest argv analysis; it is not a rewritten
native observation or host-adapter claim. Three focused direct Vitest launches use private pinned
node_modules/.bin first in recorded PATH and prove real matching-argv default/collision dispositions.

Configured user reporter collision is an open preservation blocker: baseline removes ` 123ms`
from user evidence (136 to 130 UTF-8 bytes). `R03-direct-reporter-config.golden.txt` records actual existing reducer behavior,
not approved desired deletion. Human-approved exact ambiguity requires preserving all these bytes;
lead owns runtime fix. Earlier `R03-user-reporter-config-valid.golden.txt` remains archive of logical
argv analysis, not an expected output for its actual Node command. No new reducer or safe reduction candidate proposed.

Source expectation: seven tests, three pass, three skip and one todo at exit 0; failure mode changes
one conditional skip into a failure after two attempts. V8 captures report 100% line/branch coverage
for `src/math.js`; JSON summaries bind exact metrics/artifact paths. Reporter semantics differ:
JSON reports four nested total suites and omits console text, JUnit reports two file suites and
retains console text. Do not infer identical evidence surfaces across reporters.

Closure controls reject corrupted raw hash and missing EOF; positive native-shaped grammar reduces,
explicit reporter refuses. Closure first failed because failure marker also occurs in source snippet;
count fixed to exact log rows, same closure passed. Historical raw hash and unknown completeness remain
unchanged. No full package suite/typecheck/CI. Native runner tests are tiny authored capture inputs.
Finite packet covers named missing variants and these combinations, not all Vitest versions/reporters.

## Historical checkpoint (retained record; superseded only for new captures)

Baseline: `248c303cb208f237896c0c6aaba777752aa481f5`.
State at interruption checkpoint: BLOCKED / capture recovery only. No case then promoted into the native corpus.

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
