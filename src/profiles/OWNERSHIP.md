# Profile ownership

Accountable owner and review contact: `gustavomhss`; the lead assigns an independent grammar/evidence reviewer.

- Owned implementation: [registry](index.ts), compatibility [runners.ts](runners.ts)/[formats.ts](formats.ts), Cargo/Go/pytest/Node parsers and family files listed in [manual](MANUAL.md). New family ownership: cargo-build/test/clippy, go-test-text/json/mod, tsc, pnpm-install, eslint, biome, ruff, pyright, pylint. Shared helpers: [runner-utils.ts](runner-utils.ts), [go-mode.ts](go-mode.ts), [json-layout.ts](json-layout.ts); lead owns registry/helper seams.
- Responsibilities: exact identity matching, entire-output admission, summary consistency, critical-evidence declarations, and conservative refusal.
- Review evidence: tests/profile-<family>.test.ts where implemented, existing runner/format/utility tests, independent native goldens and per-family CASES/SOURCES mapped in [coverage](../../docs/COVERAGE.md). Exact-only fixture families do not own new runtime modules. Developer [corpus reader](../../scripts/native-corpus.mjs) is outside pure runtime ownership.
- Coordinate shared span/types/formatting changes with [core](../core/OWNERSHIP.md); coordinate command-coverage claims with [OpenCode](../opencode/OWNERSHIP.md) and [CLI](../cli/OWNERSHIP.md).
- New copied fixtures require repository, pinned commit/path/license, and modification record in the applicable existing `SOURCES.md`; new copying is not implied by this documentation.
- Follow [maintenance](MAINTENANCE.md); update [coverage](../../docs/COVERAGE.md) only when the named grammar and preservation witnesses change.
