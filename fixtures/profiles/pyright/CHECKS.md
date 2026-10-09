# L08 bounded implementation verification receipt

Baseline capture checkpoint: `11f6fd80d10564011f8a35a43f96d703d452545f`.
Shared registry/index/helper are unchanged. Tests select `pyrightProfile` explicitly.

## Native red → green

Exact name: `L08 real native JSON success retains independent golden and both LF`.
Command: `npx --no-install tsx --test --test-name-pattern='^L08 real native JSON success retains independent golden and both LF$' tests/profile-pyright.test.ts`.
Before implementation: exit 1, actual `passthrough`, expected `reduced`, reason `no_profile`.
After implementation: first attempt caught the manually authored golden missing its second LF.
The same assertion still failed after an apply_patch EOF edit: patch transport did not retain the blank.
The independent golden was bound to native EOF by `promote.py`; unchanged named assertion passed.
Actual native success: 251 → 171 UTF-8 bytes, every JSON token and both LF retained.

## Focused acceptance

Ten new exact names ran in one anchored alternation, without rerunning the success name:
- `L08 real warning information and multifile Unicode tokens match independent goldens`
- `L08 file-only native manifest authenticates hashes metadata EOF and selected-profile dispositions`
- `L08 finite direct original argv rejects flags wrappers and Unicode command tokens`
- `L08 closed native fields types required messages rules and paths refuse schema drift`
- `L08 zero errors and warning information file totals corroborate all diagnostics`
- `L08 ranges require ordered safe zero-based positions and native file grouping`
- `L08 duplicates noncanonical escapes numbers and mixed producer tails stay exact`
- `L08 metadata nonzero incomplete and terminal presentation remain exact`
- `L08 native two-LF EOF is required retained and never a fake smaller reduction`
- `L08 UTF16 source spans retain every exact data token escapes Unicode and metrics`

All ten passed. Native reductions: success 80, warning 344, information 330, multifile/Unicode 1,093
saved bytes; selected-profile total 1,847. Remaining ten captures pass through whole. Framing:
fourteen manifest cases each supply `file` only; no inline input, duplicate IDs or missing source bindings.

## Scoped typing

Initial exact npx launcher failed before compiler execution:
`npm error npx canceled due to missing packages and no YES option: ["tsc@2.0.4"]`.
No compiler was installed. Reused the main repository existing `node_modules/.bin/tsc`, with main repo
as dependency-resolution cwd and absolute paths to only this worktree owned source/test closure:

```sh
./node_modules/.bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --types node "$WORKTREE/src/profiles/pyright.ts" "$WORKTREE/tests/profile-pyright.test.ts"
```

Compiler exit 0 with the frozen options. No full-package typecheck was run.

## Closure pending at compiling checkpoint

Targeted destructive mutation probes, restoration runs, and the once-only owned-file closure are pending.
No npm test/full check/build/smoke/benchmark/CI. Lead independent review and shared registry/index
integration remain pending. No merge authorization is implied.
