# Raw blast radius

## Dependency edges
- Inbound: public `hugr-lean/raw`, [OpenCode adapter](../opencode/index.ts), [raw tests](../../tests/raw.test.ts), and CLI recovery/default-directory reporting; core/profiles do not import storage.
- Outbound: Node crypto, filesystem/promises, OS/path, monotonic clock, delay, and PID probes; default storage is outside the package under the caller's home cache.

## Change impact
- Persisted data: `<id>.json` with `format: "hugr-lean/raw/2"`, `id`, `createdAt`, `expiresAt`, `text`; lock owner uses `hugr-lean/raw-lock/1`, PID, ID, and token; `.recovery` serializes reclaimers.
- Schema/serialization/ID changes affect existing records, exact recovery, serialized byte totals, and CLI reads; malformed formats reject rather than silently migrate.
- TTL/cap/scan changes affect retained recovery evidence; locking/publication changes affect concurrent writers and crash boundaries. Run the full raw suite, including real-process tests and platform lanes.
- Adapter material-save or storage-error behavior needs [plugin tests](../../tests/plugin.test.ts); raw errors can suppress model-visible replacement when saving is required.
- Purge/cleanup affect validated record files only; unknown names and ambiguous lock/recovery state must survive. Review [maintenance](MAINTENANCE.md) and [manual](MANUAL.md).
