# Raw recovery

Opt-in local exact-string recovery, exposed through `hugr-lean/raw`; [index.ts](index.ts) owns the store and locking implementation.

## Scope
- `RawStore` constructs without I/O; `put`, `get`, `list`, and `purge` operate on a dedicated local directory.
- Defaults: `~/.cache/hugr-lean/raw`, 64 MiB aggregate serialized UTF-8 record bytes, seven-day TTL, bounded separate lock metadata.
- Expiry cleanup is lazy. Full byte/count capacity rejects new writes after expired cleanup and retains every unexpired record.
- Cooperative writers publish complete JSON atomically; automatic recovery requires a validated owner whose PID probe returns `ESRCH`, not an old timestamp.
- POSIX checks current-user ownership and 0700/0600 modes; callers restrict directory ACLs on every OS. Mode checks do not establish extended-ACL isolation or defeat hostile directory swaps.
- OpenCode keeps raw off by default and saves only changes meeting both material thresholds; see [adapter manual](../opencode/MANUAL.md).

Evidence: [raw tests](../../tests/raw.test.ts), [plugin tests](../../tests/plugin.test.ts). Read [ownership](OWNERSHIP.md), [maintenance](MAINTENANCE.md), [manual](MANUAL.md), and [blast radius](BLAST_RADIUS.md).
