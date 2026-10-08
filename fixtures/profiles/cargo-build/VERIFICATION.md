# C01 implementation verification receipts

Baseline capture SHA: `4e146794e22e962aa22caf2812039628c424adb5` on
`campaign/native-v2/C01`. Lead approved all 11 reduction candidates before implementation.
Commands ran in the assigned worktree. Existing npm dependencies were reused.

## Actual baseline red — original profiles, not a stub claim

```sh
C01_BASELINE=1 node --import tsx --test --test-name-pattern='C01/.*: reduced independent native golden' tests/profile-cargo-build.test.ts
```

The test harness selects the unchanged original `cargoProfiles` in this mode. Actual result:
exit 1, tests 11, pass 0, fail 11, skipped 0. Every positive assertion saw
`actual: 'passthrough'`, `expected: 'reduced'`, command reason `no_profile`.
Failed IDs: release-workspace, custom-package-lib, release-bin-target, release-example,
check-workspace, check-lib-target, check-bin-examples, build-warnings, check-warnings,
check-custom-targets-success, build-all-features-targets. These are the finite approved set;
passthrough witnesses were deliberately excluded from the positive baseline-red run.

## Before mutation

```sh
node --import tsx --test tests/profile-cargo-build.test.ts
npm run typecheck
```

Actual results: test exit 0, tests/pass 46, fail 0, skipped 0; typecheck exit 0.
All 18 native golden dispositions and the original default-build fixture witness executed.
Derived negative/CRLF/metadata inputs are tests, not synthetic native capture labels.

## Meaningful production evidence-loss probe

Temporarily changed the actual parser return from `reduction(rows.slice(keptStart))` to
`reduction(rows.slice(cursor - 1))`: grammar still accepts but warning evidence is discarded.

```sh
node --import tsx --test --test-name-pattern='C01/build-warnings: reduced independent native golden' tests/profile-cargo-build.test.ts
```

Actual result: exit 1, tests 1, pass 0, fail 1, skipped 0. Assertion:
`independent native golden, every byte in order`. Actual replacement contained only
`    Finished \`dev\` profile [unoptimized + debuginfo] target(s) in 0.17s\n`;
expected included the entire Unicode warning/context/note/lib-total block before Finished.
This verifies emitted evidence against an independent golden, not the reducer's own
`required` array. Mutation was restored with apply_patch; native files/goldens never changed.

## Restored gate

```sh
node --import tsx --test --test-reporter=spec tests/profile-cargo-build.test.ts
npm run typecheck
```

Actual restored result: test exit 0, tests/pass 46, fail 0, skipped 0; typecheck exit 0.
The public golden test that rejected the production mutation ran and passed in this full
owned-file rerun. Both source and test files remain below the 400-line target.
No full test/check/build/smoke/benchmark/CI command is part of this packet. No native recapture.
Cold lead review/probes and shared registry integration remain pending.

## Cold-review FIX-FIRST: structural project scope

Pre-fix checkpoint: `f62b356f9f1c2048da5e26bce565ccd970bbc988`. Three genuinely renamed
Cargo captures (original MIT, Cargo 1.98.0) were added, with unchanged original 18 goldens.
See `STRUCTURAL-SOURCES.md` for complete source, native commands, cache and combined-stream
facts. Independent goldens retain the Locking row, both full diagnostics/totals and finish.

Actual pre-fix red, before touching production:

```sh
node --import tsx --test --test-name-pattern='C01/structural-.*: reduced independent native golden' tests/profile-cargo-build.test.ts
```

Exit 1, tests 3, pass 0, fail 3, skipped 0. structural-build, structural-check and
structural-check-buildscript all saw `no_profile`, actual `passthrough`, expected `reduced`.
This run used the actual pre-fix familyProfiles, not original-profile mode or a synthetic stub.

Wrong literal-specific refusal tests were replaced with malformed structural values. Legal
additive selectors, dependency packages/versions, arbitrary profile optimization settings,
source positions/paths/names and multiple printed warning counts now have property tests.
Synthetic transformations are explicitly labelled property inputs, never native captures.

During development, two whole owned-file runs each reported 57 pass / 1 fail (exit 1):
the optional `other?/fast` feature property hit the unchanged core tokenizer's
`unsupported_command`, first unquoted and then quoted. Core accepts neither spelling.
That case now explicitly asserts exact public refusal; no core edit or false support claim.
Corrected argv/diagnostic focused controls ran: tests/pass 2, fail/skipped 0, exit 0.

Production admission mutation removed `count !== pending + duplicates` from native warning
total validation, retaining all emitted evidence but admitting an inconsistent count.

```sh
node --import tsx --test --test-name-pattern='synthetic diagnostic properties' tests/profile-cargo-build.test.ts
```

Actual mutation result: exit 1, tests 1, pass 0, fail 1, skipped 0. Changing the real
two-warning native total to `generated 3 warnings` yielded `actual: 'reduced'`,
`expected: 'passthrough'`, reason `profile_reduction`. The production comparison was restored
with apply_patch; no native fixture/golden was mutated.

Final restored commands:

```sh
node --import tsx --test --test-reporter=spec tests/profile-cargo-build.test.ts
npm run typecheck
```

Actual results: test exit 0, tests/pass 58, fail 0, skipped 0; typecheck exit 0.
This includes all 21 native cases (14 reduced, 7 exact), original delegated build witness,
new-property positive controls and the counter-consistency assertion that killed the mutant.
All source/test modules remain below 400 lines. No full CI/core/registry/legacy writes or tests.
Cold lead review/probes remain pending.

## Second cold-review FIX-FIRST: leading phase and selector semantics

Pre-fix commit: `4718c0d1d50d77df6afe8fd101f9afeed5186cc3`.
The native cfg(test) control and independent golden are documented in `CONDITIONAL-SOURCES.md`.
It actually emits an unpaired lib-test total under all-targets: no invented paired-summary rule.
All earlier native inputs/goldens remain unchanged. Synthetic interleaving goldens now retain
the second package's progress because the first diagnostic already closed deletion.

Before production edits:

```sh
node --import tsx --test --test-name-pattern='phase preservation|selector semantics' tests/profile-cargo-build.test.ts
```

Actual exit 1, tests 3, pass 0, fail 3, skipped 0. Both build/check phase tests lost the
late source progress row before a warning total in the independent byte-exact golden.
The selector test admitted a fake lib-test total under a lib-only invocation: actual
`reduced`, expected `passthrough`, reason `profile_reduction`.

Before mutations, the whole owned test file passed: tests/pass 65, fail/skipped 0, exit 0;
typecheck exit 0. Source-backed later progress is checked before/after totals, in LF/CRLF
with Unicode paths. Malformed progress and progress inside diagnostic bodies refuse.
Selector tests include valid bin/example/default/dependency-lib contexts and test-target
refusals, package/target identity checks, and valid all-targets test contexts. A removed total
for the actual pending cfg(test) warning refuses; optional independent summaries are not inferred.

Production evidence-loss mutation removed `if (!deletionOpen) kept.push(row)`:

```sh
node --import tsx --test --test-name-pattern='phase preservation' tests/profile-cargo-build.test.ts
```

Actual exit 1, tests 2, pass 0, fail 2, skipped 0. Both independent goldens rejected the lost
late Compiling/Checking source row. Mutation restored before the second probe.

Production admission mutation removed the `targetAllowed` check from summary validation:

```sh
node --import tsx --test --test-name-pattern='selector semantics' tests/profile-cargo-build.test.ts
```

Actual exit 1, tests 1, pass 0, fail 1, skipped 0. Lib-only again admitted fake lib-test output:
actual `reduced`, expected `passthrough`. Target check restored with apply_patch. No native
input/golden was mutated.

Final restored commands:

```sh
node --import tsx --test --test-reporter=spec tests/profile-cargo-build.test.ts
npm run typecheck
```

Actual results: test exit 0, tests/pass 65, fail 0, skipped 0; typecheck exit 0.
All 22 native cases (15 reduced, 7 exact), independent phase goldens, target-selector controls,
native conditional-summary control and original delegated build witness executed. Source and
test files remain below 400 lines. No full CI/core/registry/legacy modifications or full suite.
Stop for cold lead review/probes; shared registry integration remains lead-owned.
