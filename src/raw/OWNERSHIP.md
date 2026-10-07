# Raw ownership

Accountable owner and review contact: `gustavomhss`; the lead assigns an independent persistence/recovery reviewer.

- Owned implementation: [index.ts](index.ts), including options, serialized schema, publication, bounded scan, TTL cleanup, and cooperative lock recovery.
- Responsibilities: exact JavaScript-string recovery, serialized-byte accounting, unexpired retention, identifier validation, and preservation of unrelated files.
- Review evidence: [raw tests](../../tests/raw.test.ts), especially real-process crash/concurrency controls and platform-specific permissions; [plugin tests](../../tests/plugin.test.ts) cover storage failure at the hook boundary.
- Coordinate persistence options/material-save policy with [OpenCode](../opencode/OWNERSHIP.md), and inspection/error reporting with [CLI](../cli/OWNERSHIP.md).
- Schema/TTL/capacity changes need explicit existing-record impact review; ACL restriction on every OS remains the caller's responsibility.
- Follow [maintenance](MAINTENANCE.md), [manual](MANUAL.md), and [blast radius](BLAST_RADIUS.md).
