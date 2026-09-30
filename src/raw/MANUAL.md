# Raw manual

```ts
import { RawStore, defaultRawDirectory } from "hugr-lean/raw";
const store = new RawStore({ directory: dedicatedLocalDirectory });
const id = await store.put(originalText);
const recovered = await store.get(id);
const entries = await store.list();
```
- `RawOptions`: optional nonempty `directory`, positive-safe-integer `maxBytes`/`ttlMs`; invalid configuration throws synchronously. Construction does no I/O.
- Defaults: `defaultRawDirectory()` is `~/.cache/hugr-lean/raw`; `maxBytes = 64 * 1024 * 1024`; `ttlMs = 7 * 24 * 60 * 60 * 1000`.
- `put(text): Promise<string>` returns a random 32-character lowercase hexadecimal ID; text must be a string, including empty strings or lone surrogates.
- `get(id): Promise<string | undefined>` validates the ID before I/O; missing/expired records return `undefined`. `raw/2` persists writer `expiresAt`; the earlier writer deadline or reader TTL wins, so CLI defaults cannot extend retention.
- `list(): Promise<RawEntry[]>` cleans expired records and sorts by creation time then ID; entries contain `id`, `createdAt`, and serialized record `bytes`.
- `purge(): Promise<void>` removes all validated store records, including unexpired ones; unrelated names/directories remain untouched. Corrupt store-shaped files cause rejection.
- The cap counts published serialized JSON UTF-8 bytes, not decoded text or unrelated files; small owner/recovery metadata is separately bounded. Full capacity rejects instead of evicting unexpired records.
- Scans visit at most 10,000 root names and reserve capacity for publication/recovery; lock acquisition has a five-second monotonic deadline. There is no background cleanup timer.
- Caller-restricted directory/ACLs are required on every OS. POSIX validates UID and directory/file modes 0700/0600; Windows ACLs and POSIX extended ACLs remain caller-managed.
- Symlinks, unexpected hard links, unsafe modes, schema/UTF-8 corruption, oversize files, and filesystem errors reject; they do not become a missing-record result.
- Recovery requires validated matching ownership plus `ESRCH`. Live/ambiguous owners, unknown lock contents, and existing recovery claims are preserved; automatic age-based stealing is unsupported.
- Storage errors propagate from this API; OpenCode catches them and retains original tool text. CLI raw operations report errors with exit 1 and missing/expired get with exit 2; see [CLI manual](../cli/MANUAL.md).
- Behavior witnesses: [raw tests](../../tests/raw.test.ts); limits/guarantees are local cooperative-storage guarantees, not a filesystem sandbox.
