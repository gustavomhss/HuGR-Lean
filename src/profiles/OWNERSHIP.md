# Profile ownership

Accountable owner and review contact: `gustavomhss`; the lead assigns an independent grammar/evidence reviewer.

- Owned implementation: runner barrel [runners.ts](runners.ts), [runner-utils.ts](runner-utils.ts), [cargo.ts](cargo.ts), [go.ts](go.ts), [pytest.ts](pytest.ts), [node-test.ts](node-test.ts), [formats.ts](formats.ts), and [registry](index.ts).
- Responsibilities: exact identity matching, entire-output admission, summary consistency, critical-evidence declarations, and conservative refusal.
- Review evidence: [runner tests](../../tests/runners.test.ts), [format tests](../../tests/formats.test.ts), and their [runner](../../fixtures/runners/SOURCES.md)/[format](../../fixtures/formats/SOURCES.md) provenance records.
- Native utility evidence: `tests/utility-{cargo,go,pytest,node}.test.ts` independently check required declarations and emitted source pieces; [corpus helper](../../tests/utility-fixtures.ts) authenticates frozen raw/golden pins. [Combined tests](../../tests/combined.test.ts) check production registration, not selected-profile support alone.
- Corpus schema/inventory ownership belongs to the evaluation lane; parser authors may not rewrite native captures, goldens or provenance to fit their implementation. Original local sources and runtime-fingerprint limits are recorded in [utility evaluation](../../docs/UTILITY_EVALUATION.md).
- Coordinate shared span/types/formatting changes with [core](../core/OWNERSHIP.md); coordinate command-coverage claims with [OpenCode](../opencode/OWNERSHIP.md) and [CLI](../cli/OWNERSHIP.md).
- New copied fixtures require repository, pinned commit/path/license, and modification record in the applicable existing `SOURCES.md`; new copying is not implied by this documentation.
- Follow [maintenance](MAINTENANCE.md); update [coverage](../../docs/COVERAGE.md) only when the named grammar and preservation witnesses change.
