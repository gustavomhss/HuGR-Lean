# Raw recovery

Local exact-string recovery, exposed through `hugr-lean/raw`; [index.ts](index.ts) owns the store and locking implementation.

## Scope
- `RawStore` constructs without I/O; `put`, `get`, `list`, and `purge` operate on a dedicated local directory.
- Defaults: `~/.cache/hugr-lean/raw`, 64 MiB aggregate serialized UTF-8 record bytes, seven-day TTL, bounded separate lock metadata.
- Expiry cleanup is lazy. By default, full byte/count capacity rejects new writes after expired
  cleanup. `evict: true` permits removal of the oldest unexpired records to admit new ones.
- In current unreleased source, cooperative writers publish complete JSON atomically before
  evicting unexpired originals. Prepublication failures keep those originals; postpublication
  crash/deletion failures may retain an extra record above normal limits. This is not a disk quota.
- Cleanup keeps ambiguous artifacts and preserves verified ownership on persistent temporary
  cleanup failures. Automatic recovery needs a validated owner whose PID probe returns `ESRCH`,
  not an old timestamp; see [failure behavior](MANUAL.md#publication-eviction-and-failure-recovery).
- POSIX checks current-user ownership and 0700/0600 modes; callers restrict directory ACLs on every OS. Mode checks do not establish extended-ACL isolation or defeat hostile directory swaps.
- OpenCode summarize mode enables storage/eviction by default for lossy summaries. Lossless mode
  keeps storage off unless explicitly configured and uses material-save thresholds. The standalone
  `RawStore` defaults to no eviction; see [adapter manual](../opencode/MANUAL.md).
- Records are unencrypted and may contain secrets. TTL/eviction is temporary retention, not an
  archive or secure erase. See [security guidance](../../SECURITY.md).

Evidence: [fault tests](../../tests/raw-faults.test.ts), [raw tests](../../tests/raw.test.ts), [plugin tests](../../tests/plugin.test.ts). Read [ownership](OWNERSHIP.md), [maintenance](MAINTENANCE.md), [manual](MANUAL.md), and [blast radius](BLAST_RADIUS.md).
