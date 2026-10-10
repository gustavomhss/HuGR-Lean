# Core ownership

Accountable owner and review contact: `gustavomhss`; the lead assigns an independent PR reviewer.

- Owned implementation: [engine.ts](engine.ts), [command.ts](command.ts), [normalize.ts](normalize.ts), [lines.ts](lines.ts), [types.ts](types.ts), [index.ts](index.ts); automatic core [automatic.ts](automatic.ts), [automatic-types.ts](automatic-types.ts), [automatic-registry.ts](automatic-registry.ts), [automatic-command.ts](automatic-command.ts) and shared [structured-render.ts](structured-render.ts) are lead-owned seams.
- Responsibilities: observation validation, command admission, span integrity, smaller-byte acceptance, and exact fail-open behavior.
- Review evidence: [automatic core](../../tests/automatic-core.test.ts), [core](../../tests/core.test.ts), [command](../../tests/command.test.ts), [normalize](../../tests/normalize.test.ts), and [lines](../../tests/lines.test.ts) tests.
- Coordinate shared type or formatting-vocabulary changes with [profiles](../profiles/OWNERSHIP.md) and metadata/result changes with [OpenCode](../opencode/OWNERSHIP.md).
- Public contract changes affect `hugr-lean/core`; plugin discovery remains the root default export, as defined in [package.json](../../package.json).
- Follow [maintenance](MAINTENANCE.md); route impact review through [blast radius](BLAST_RADIUS.md).
