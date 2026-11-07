# Raw manual

The failure-handling/eviction details below describe the current **unreleased source**, not
the published 0.4.0 implementation. The public options and record format remain unchanged.

```ts
import { RawStore, defaultRawDirectory } from "hugr-lean/raw";
const store = new RawStore({ directory: dedicatedLocalDirectory });
const id = await store.put(originalText);
const recovered = await store.get(id);
const entries = await store.list();
```
- `RawOptions`: optional nonempty `directory`, positive-safe-integer `maxBytes`/`ttlMs`, boolean `evict`; invalid configuration throws synchronously. Construction does no I/O.
- Defaults: `defaultRawDirectory()` is `~/.cache/hugr-lean/raw`; `maxBytes = 64 * 1024 * 1024`; `ttlMs = 7 * 24 * 60 * 60 * 1000`.
- `put(text): Promise<string>` returns a random 32-character lowercase hexadecimal ID; text must be a string, including empty strings or lone surrogates.
- `get(id): Promise<string | undefined>` validates the ID before I/O; missing/expired records return `undefined`. `raw/2` persists writer `expiresAt`; the earlier writer deadline or reader TTL wins, so CLI defaults cannot extend retention.
- `list(): Promise<RawEntry[]>` cleans expired records and sorts by creation time then ID; entries contain `id`, `createdAt`, and serialized record `bytes`.
- `purge(): Promise<void>` removes all validated store records, including unexpired ones; unrelated names/directories remain untouched. Corrupt store-shaped files cause rejection.
- `maxBytes` counts serialized JSON UTF-8 record bytes, not decoded text or unrelated files;
  small owner/recovery metadata is separately bounded. Full capacity rejects by default.
  Successful writes satisfy admission limits, but transient/failed-cleanup residue can exceed
  them. This is not a strict filesystem disk quota.
- Scans visit at most 10,000 root names and reserve capacity for publication/recovery; lock acquisition has a five-second monotonic deadline. There is no background cleanup timer.
- Caller-restricted directory/ACLs are required on every OS. POSIX validates UID and directory/file modes 0700/0600; Windows ACLs and POSIX extended ACLs remain caller-managed.
- Symlinks, unexpected hard links, unsafe modes, schema/UTF-8 corruption, oversize files, and filesystem errors reject; they do not become a missing-record result.
- Recovery requires validated matching ownership plus `ESRCH`. Live/ambiguous owners, unknown lock contents, and existing recovery claims are preserved; automatic age-based stealing is unsupported.
- Storage errors propagate from this API; the adapter refuses the replacement requiring that
  save and keeps its prior text. CLI raw operations report errors with exit 1 and missing/expired
  get/recall with exit 2; see [CLI manual](../cli/MANUAL.md). A rejected `put` is not proof that
  nothing was published: a later cleanup/deletion error can occur after publication.
- Behavior witnesses: [raw tests](../../tests/raw.test.ts); limits/guarantees are local cooperative-storage guarantees, not a filesystem sandbox.

## Publication, eviction and failure recovery

- With `evict: true` (opt-in for direct `RawStore`; enabled by OpenCode summarize mode unless
  overridden), victims are selected oldest-first without deleting them. The replacement is
  written, synced, closed and atomically published before unexpired victims are removed, all
  under the same cooperative lock. Failures before publication retain unexpired originals;
  ordinary expired-record cleanup can still occur. Unknown names are never eviction victims.
- A crash or deletion failure after publication may leave an extra complete record above normal
  byte/count admission limits. Preserve that evidence rather than assuming rollback. Once safe
  lock recovery/cleanup succeeds, records can be inspected normally. A later successful write
  can evict byte-overflow residue; at the physical scan ceiling, new writes may reject until
  expiry or explicit purge frees a slot. Unknown files still count toward the scan limit.
- Failed owner/recovery metadata initialization cleans only artifacts whose identity and parent
  identity remain verified. Ambiguous, replaced, unreadable or persistently unverifiable
  artifacts are retained, and the error is reported rather than silently stealing a lock.
- Normal lock release validates contents and removes any matching temporary before `owner.json`.
  This allows another validated cleanup attempt after a one-shot temporary unlink failure.
  Persistent temporary cleanup failure preserves ownership for possible later dead-PID recovery;
  it does not promise immediate recovery while that owner is still alive.
- If both an operation and its cleanup fail, `AggregateError` retains both errors. A cleanup error
  can reject an otherwise completed operation. Treat uncertain outcomes as uncertain rather than
  assuming a rejected call was side-effect-free. No timestamp-based lock stealing is added.

## Recall and privacy

- `recallLines(text, range?)` returns the exact text when the range is absent or empty, or the
  selected 1-based inclusive LF-delimited lines for `A-B`, `A-` or `A`, joined with LF. Invalid
  range syntax throws `RangeError`; a line slice is not a byte-range read.
- Standalone `hugr-lean recall`/`raw get` use the same record format. Supply the writer's custom
  directory when applicable. Importing `RawStore` registers no model tool and grants no recipient
  access. Records are plaintext, and recalled content goes wherever the caller sends it.
- Expired files are removed lazily; expiry and purge are not secure erase and do not remove backups.
  Store construction without I/O is not an access-control check. Restrict the directory before use.
