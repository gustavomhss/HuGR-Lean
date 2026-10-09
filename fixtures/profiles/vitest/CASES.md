# R03 native delta packet and historical interruption

## Resumed capture: current state

User authorized cleanup and isolated pinned reinstall after disk recovery. `npm ci --ignore-scripts`
used committed lock in a fresh private scratch. `capture-receipt.json` records executed Node/CLI argv,
cwd, environment overrides, exit, version check, platform, merged-pipe EOF, SHA-256, byte length and tail.
`cases.json` is file-only `hugr-lean/native-cases/1`; archives are relative path strings.

Current replay against lead source `2049eec6505aa62988fcb8aa9fe1a0eb1bc96d2f`
preserves all 13 actual complete captures: nine `no_profile`, two `nonzero_exit`,
one direct-default `unsupported_output`, and the configured direct reporter
`not_smaller`. The latter retains the whole 136-byte row, including ` 123ms`.
`R03-direct-reporter-config.golden.txt` is now an archive of historical unsafe
130-byte behavior; it is byte-identical, not an active expected output.

## Metadata normalization and fact binding

Source copy: `fixtures/profiles/vitest/` from HuGR-Lean MIT repository commit
`efad2b6658c3d8355edd78408fb59e9aadf038ae`. Modification record: cases.json binds
all 13 active cases to new `reader-receipt.json`, changes configured direct reporter
to passthrough, removes expectedFile, and archives its old golden; this CASES.md
records the repaired finding. Original raw/receipts/sources/recipes/hashes/licenses,
logical-analysis golden, historical closure and unknown-completeness raw stay unchanged.

Adapter is SHA-linked to original capture-receipt.json and source case index/id/cwd.
It transcribes native id/argv/exitCode/processEOF/version/bytes/SHA/endsWithLF/tailHex
into reader name/command/termination/completeness/unknown presentation/version and
structured boundary facts. Independent audit checks every fact against the original;
lead `2049eec` reader checks observations, raw hashes and exact EOF fields.
Argv, exit, EOF/LF/tail, byte-count and SHA corruption controls were rejected and
restored in a temporary two-family runtime corpus with no exact exceptions.
This is bounded native-argv replay, not full Vitest support or campaign completion.
No suite, typecheck, build, install or CI was run.

## Historical frozen-baseline analysis

| Case | New native evidence / required combination | Historical baseline logical-argv disposition |
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

Frozen baseline: `248c303cb208f237896c0c6aaba777752aa481f5`. Historical `close.mjs` replayed each captured
output through that core using actual executed argv in manifest. Initial matrix launches Node +
pinned Vitest entrypoint; those actual observations stay exact (no_profile or nonzero_exit).
The table additionally shows explicitly labeled logical Vitest argv analysis; it is not a rewritten
native observation or host-adapter claim. Three focused direct Vitest launches use private pinned
node_modules/.bin first in recorded PATH and prove real matching-argv default/collision dispositions.

Configured user reporter collision was a preservation blocker: frozen baseline removed ` 123ms`
from user evidence (136 to 130 UTF-8 bytes). Lead repair now preserves the whole row,
as verified above. `R03-direct-reporter-config.golden.txt` records historical unsafe behavior,
not approved desired deletion or current behavior. Earlier `R03-user-reporter-config-valid.golden.txt` remains archive of logical
argv analysis, not an expected output for its actual Node command. No new reducer or safe reduction candidate proposed.

Source expectation: seven tests, three pass, three skip and one todo at exit 0; failure mode changes
one conditional skip into a failure after two attempts. V8 captures report 100% line/branch coverage
for `src/math.js`; JSON summaries bind exact metrics/artifact paths. Reporter semantics differ:
JSON reports four nested total suites and omits console text, JUnit reports two file suites and
retains console text. Do not infer identical evidence surfaces across reporters.

Historical closure controls rejected corrupted raw hash and missing EOF; its baseline
native-shaped grammar reduced and explicit reporter refused. `close.mjs` and
closure-receipt.json remain historical records, not current repaired-core verification.
Closure first failed because failure marker also occurs in source snippet;
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
