# Profile maintenance

During the native campaign, follow [scoped verification policy](../../docs/NATIVE-COVERAGE-CAMPAIGN.md#work-and-checks). Run only changed acceptance names during iteration:
```sh
npx --no-install tsx --test --test-name-pattern='<exact affected names>' tests/profile-<family>.test.ts
```
1. Reproduce actual argv/native output/metadata; pin version, source path/hash and copied-material license/modifications in family CASES/SOURCES. Preserve old captures, failures and rejected proposals; never rewrite commands to make admission pass.
2. Add an admitted success control and refused variant; prove full-stream validation, native count consistency, UTF-16 evidence spans, and exact warnings/failures/unknown logs.
3. Preserve each profile's declared evidence. Passing runner names may disappear only as documented; whole Jest/Vitest rows, JSON tokens/EOF and Git/rg associations remain protected. Collision-shaped text is not producer authentication.
4. Mutation-probe changed preservation/refusal guard with its protecting named test; require failure, restore, rerun that test. Close owned file once; typecheck affected closure with campaign compiler flags. Registry/corpus/installed seams need independent review. Full-package tests/build/benchmark and exact-SHA CI belong to lead freeze; documentation-only audit does not run them.

File budget: target 400 LOC, allow 600, tolerate 750; above 750 split by grammar family inside this package.
Synchronize [manual](MANUAL.md)/[coverage](../../docs/COVERAGE.md) with actual registry, closed grammar and independent evidence. Exact-ledger enrollment is not reducer completion; safe-format gaps need explicit human decisions, not empty stubs.
