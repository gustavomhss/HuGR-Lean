# Profile maintenance

Run from the repository root after `npm ci`:
```sh
npx --no-install tsx --test --test-concurrency=2 tests/runners.test.ts tests/formats.test.ts tests/utility-cargo.test.ts tests/utility-go.test.ts tests/utility-pytest.test.ts tests/utility-node.test.ts tests/combined.test.ts tests/core.test.ts tests/plugin.test.ts
npm run typecheck && npm run build
```
1. Reproduce using actual argv/native output and metadata; pin tool version and copied-fixture provenance in the applicable [runner](../../fixtures/runners/SOURCES.md) or [format](../../fixtures/formats/SOURCES.md) record.
2. Add an admitted success control and refused variant; prove full-stream validation, native count consistency, UTF-16 spans and UTF-8 metrics. Independent anchors must be covered by both `required` and emitted source pieces; identical replacement text alone is insufficient.
3. Preserve each profile's declared identities/summaries and supported warning/diagnostic envelopes. Passing runner names may disappear only as documented; Node silent passed leaves are removable, while skips/TODO/diagnostics and ancestor context remain exact. Jest bodies and Git/ripgrep path associations remain evidence.
4. Mutation-probe an omitted required summary/skip row or admission of an unknown line; the corresponding evidence/refusal tests must fail. Restore, rerun focused tests and typecheck/build, and inspect the diff.
5. Evaluation changes also require reader/inventory/evaluation teeth tests. Keep golden bytes and the 25-case native inventory frozen; supplementary in-memory command/format probes are not new native captures.

Documentation-only changes use static scope/link/recipe checks. Parser tests, typecheck, native execution, installation and latency are separate receipts; the commands above are maintenance instructions, not this document's execution record.

File budget: target 400 LOC, allow 600, tolerate 750; above 750 split by grammar family inside this package.
No optional lint/install admission without full native grammar and material-noise evidence; synchronize [manual](MANUAL.md) and [coverage](../../docs/COVERAGE.md).
