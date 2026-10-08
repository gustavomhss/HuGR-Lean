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
