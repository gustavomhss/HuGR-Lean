# Core maintenance

Run from the repository root after `npm ci`:
```sh
npx --no-install tsx --test tests/core.test.ts tests/command.test.ts tests/normalize.test.ts tests/lines.test.ts tests/automatic-core.test.ts
npm run typecheck && npm run build
```
1. Capture the original command, output, exit/completeness/presentation facts; add a regression plus an admitted positive control.
2. Preserve UTF-16 boundaries, required source evidence, UTF-8 metrics, and absent replacement on refusal; keep filesystem/network/execution outside core.
3. Check unknown grammar and failures before accepting a fix. SGR is conditional; CR redraw collapse remains unsupported.
4. Mutation-probe by bypassing required-span coverage or the nonzero-exit guard; the matching preservation regression must fail. For the automatic core, bypass the contradictory-metadata refusal or the legacy-refusal guard; `tests/automatic-core.test.ts` must fail. Restore the guard, rerun focused tests and typecheck/build, and inspect the diff.

File budget: target 400 LOC, allow 600, tolerate 750; above 750 split validation/rendering or recognition responsibilities within this package.
Review [manual](MANUAL.md) and [blast radius](BLAST_RADIUS.md) when changing types, limits, reasons, or normalization.
