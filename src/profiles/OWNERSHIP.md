# Profile ownership

Accountable owner and review contact: `gustavomhss`; the lead assigns an independent grammar/evidence reviewer.

- Owned implementation: [runners.ts](runners.ts), [formats.ts](formats.ts), and [registry](index.ts).
- Responsibilities: exact identity matching, entire-output admission, summary consistency, critical-evidence declarations, and conservative refusal.
- Review evidence: [runner tests](../../tests/runners.test.ts), [format tests](../../tests/formats.test.ts), and their [runner](../../fixtures/runners/SOURCES.md)/[format](../../fixtures/formats/SOURCES.md) provenance records.
- Coordinate shared span/types/formatting changes with [core](../core/OWNERSHIP.md); coordinate command-coverage claims with [OpenCode](../opencode/OWNERSHIP.md) and [CLI](../cli/OWNERSHIP.md).
- New copied fixtures require repository, pinned commit/path/license, and modification record in the applicable existing `SOURCES.md`; new copying is not implied by this documentation.
- Follow [maintenance](MAINTENANCE.md); update [coverage](../../docs/COVERAGE.md) only when the named grammar and preservation witnesses change.
