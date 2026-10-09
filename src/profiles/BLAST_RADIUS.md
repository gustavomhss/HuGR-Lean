# Profile blast radius

## Dependency edges
- Inbound: [core engine](../core/engine.ts) imports the registry; [runner](../../tests/runners.test.ts)/[format](../../tests/formats.test.ts) tests exercise individual parsers; [plugin tests](../../tests/plugin.test.ts) exercise production composition.
- Outbound: [core lines](../core/lines.ts)/[types](../core/types.ts) and local grammar arrays only; no runtime filesystem/network dependencies.

## Change impact
- Identity or registry edits change command admission, overlap behavior, result profile IDs, and model-visible output through the adapter; CLI filters through core and doctor reads registry IDs directly.
- Grammar edits affect summaries, skips, paths, conflicts, Unicode, ordering, and refusals; run runner/format tests plus [core](../../tests/core.test.ts)/plugin integration.
- There is no persisted profile data; spans are relative to each supplied baseline. Fixture changes affect hash/provenance witnesses in both existing `SOURCES.md` records.
- Wider support claims require new full-stream positive/negative evidence, not an extra ID or stub; keep [manual](MANUAL.md) and [coverage](../../docs/COVERAGE.md) aligned.
- Byte savings alone do not prove preservation; follow [maintenance](MAINTENANCE.md) and review required declarations as well as emitted text.
- Vitest whole-row retention withdraws legacy plain-stream savings (221→221 and 322→322 bytes). Affected closure is named Vitest format/combined/evidence tests and [configured-reporter regression](../../tests/vitest-preservation.test.ts); installed goldens are raw exact. Reporter-looking grammar is not producer authentication.
