# OpenCode ownership

Accountable owner and review contact: `gustavomhss`; the lead assigns an independent host-boundary reviewer.

- Owned implementation: [index.ts](index.ts), [automatic-mcp.ts](automatic-mcp.ts) and [config.ts](config.ts); public root routing is [src/index.ts](../index.ts).
- Responsibilities: proven host metadata mapping, short option validation, exact fail-open mutation behavior, and optional material raw persistence.
- Review evidence: [plugin tests](../../tests/plugin.test.ts), [automatic plugin tests](../../tests/automatic-plugin.test.ts), [host proof provenance](../../fixtures/automatic/host/SOURCES.md), [boundary tests](../../tests/opencode-boundary.test.ts), [host proof](../../docs/OPENCODE.md), and [package smoke](../../scripts/opencode-smoke.mjs).
- Coordinate observation/result changes with [core](../core/OWNERSHIP.md), persistence options with [raw](../raw/OWNERSHIP.md), and package-versus-host diagnostic documentation with [CLI](../cli/OWNERSHIP.md).
- Compatibility expansion requires an actual hook-to-next-model-request proof for that host route; declarations or mocked CI alone do not establish it.
- Follow [maintenance](MAINTENANCE.md); document lifecycle/options in [manual](MANUAL.md) and impact in [blast radius](BLAST_RADIUS.md).
