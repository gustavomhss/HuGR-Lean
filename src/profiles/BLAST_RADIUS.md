# Profile blast radius

## Dependency edges
- Inbound: [core engine](../core/engine.ts) imports the registry; [runner](../../tests/runners.test.ts)/[format](../../tests/formats.test.ts) tests exercise individual parsers; [plugin tests](../../tests/plugin.test.ts) exercise production composition.
- Outbound: [core lines](../core/lines.ts)/[types](../core/types.ts), command tokenization for argv-bound Cargo/pytest modes, and local [runner helpers](runner-utils.ts); no runtime filesystem/network dependencies.

## Change impact
- Identity or registry edits change command admission, overlap behavior, result profile IDs, and model-visible output through the adapter; CLI filters through core and doctor reads registry IDs directly.
- Grammar edits affect summaries, skips, paths, conflicts, Unicode, ordering and refusals; run runner/format and family utility tests plus [combined](../../tests/combined.test.ts)/[core](../../tests/core.test.ts)/plugin integration. Node edits can change ancestor context; Cargo/Go scope edits can misassociate otherwise identical names across suites/packages.
- There is no persisted profile data; spans are relative to each supplied baseline. Fixture changes affect hash/provenance witnesses in both existing `SOURCES.md` records.
- Wider support claims require new full-stream positive/negative evidence, not an extra ID or stub; keep [manual](MANUAL.md) and [coverage](../../docs/COVERAGE.md) aligned.
- Byte savings alone do not prove preservation; follow [maintenance](MAINTENANCE.md) and review required declarations as well as emitted text.
- Shared runner-helper edits reach all four native grammar families. Installed/host proof must bind the integrated package SHA; selected-profile results and private composed-branch smoke cannot certify the final public artifact.
