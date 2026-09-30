# Profile maintenance

Run from the repository root after `npm ci`:
```sh
npx --no-install tsx --test tests/runners.test.ts tests/formats.test.ts tests/core.test.ts tests/plugin.test.ts
npm run typecheck && npm run build
```
1. Reproduce using actual argv/native output and metadata; pin tool version and copied-fixture provenance in the applicable [runner](../../fixtures/runners/SOURCES.md) or [format](../../fixtures/formats/SOURCES.md) record.
2. Add an admitted success control and refused variant; prove full-stream validation, native count consistency, UTF-16 evidence spans, and exact warnings/failures/unknown logs.
3. Preserve each profile's declared identities/summaries. Passing runner names may disappear only as documented; Jest bodies and Git/ripgrep path associations remain evidence.
4. Mutation-probe an omitted required summary/skip row or admission of an unknown line; the corresponding evidence/refusal tests must fail. Restore, rerun focused tests and typecheck/build, and inspect the diff.

File budget: target 400 LOC, allow 600, tolerate 750; above 750 split by grammar family inside this package.
No optional lint/install admission without full native grammar and material-noise evidence; synchronize [manual](MANUAL.md) and [coverage](../../docs/COVERAGE.md).
