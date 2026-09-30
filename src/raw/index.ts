import { randomBytes } from "node:crypto";
import { constants, type Stats } from "node:fs";
import fs, { lstat, open, opendir, realpath, rmdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

export interface RawOptions {
  directory?: string;
  /** Aggregate serialized record bytes; small lock metadata is bounded separately. */
  maxBytes?: number;
  /** Lifetime bound; readers may shorten persisted deadlines. */
  ttlMs?: number;
}

export interface RawEntry {
  id: string;
  createdAt: number;
  /** Serialized record size, not the decoded text size. */
  bytes: number;
}

export function defaultRawDirectory(): string {
  return join(homedir(), ".cache", "hugr-lean", "raw");
}

const ID = /^[a-f0-9]{32}$/;
const FILE = /^([a-f0-9]{32})\.json$/;
const FORMAT = "hugr-lean/raw/2";
const LOCK_FORMAT = "hugr-lean/raw-lock/1";
const LOCK_MS = 5_000;
const SCAN_LIMIT = 10_000;
const POSIX = process.platform !== "win32";
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
type StoredEntry = RawEntry & { expiresAt: number; stat: Stats };
type Owner = { pid: number; id: string; token: string; stat: Stats };

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer`);
  return value;
}

function checkFile(stat: Stats, links = 1): void {
  if (!stat.isFile() || stat.nlink !== links) throw new Error("Raw record must be a regular, single-link file");
  if (POSIX && ((stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid?.())) {
    throw new Error("Raw record must be owned by the current user with mode 0600");
  }
}

function sameFile(a: Stats, b: Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

function checkDirectory(stat: Stats, label: string): void {
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${label} must be a real directory`);
  if (POSIX && ((stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid?.())) {
    throw new Error(`${label} must be owned by the current user with mode 0700`);
  }
}

function deadOwner(pid: number): boolean {
  try { process.kill(pid, 0); return false; } catch (error) { return hasCode(error, "ESRCH"); }
}

/**
 * Local, opt-in recovery. Constructing a store performs no I/O.
 * The caller must restrict this dedicated local directory on every OS, including macOS/POSIX.
 * POSIX mode checks do not establish extended-ACL isolation; Windows ACLs are also caller-managed.
 * Path APIs do not protect against hostile directory swaps. Writers must cooperate with this lock.
 * Full byte/count capacity rejects new records after expired cleanup; unexpired records are retained.
 */
export class RawStore {
  private readonly directory: string;
  private readonly maxBytes: number;
  private readonly ttlMs: number;
  private readonly scanLimit = SCAN_LIMIT;
  private readonly lockMs = LOCK_MS;

  constructor(options: RawOptions = {}) {
    if (options.directory !== undefined && (typeof options.directory !== "string" || !options.directory.length)) {
      throw new TypeError("directory must be a nonempty path");
    }
    this.directory = resolve(options.directory ?? defaultRawDirectory());
    this.maxBytes = positiveInteger(options.maxBytes === undefined ? 64 * 1024 * 1024 : options.maxBytes, "maxBytes");
    this.ttlMs = positiveInteger(options.ttlMs === undefined ? 7 * 24 * 60 * 60 * 1000 : options.ttlMs, "ttlMs");
  }

  async put(text: string): Promise<string> {
    if (typeof text !== "string") throw new TypeError("raw text must be a string");
    return this.locked(async (root, id) => {
      const createdAt = Date.now();
      if (!Number.isSafeInteger(createdAt) || createdAt < 0) throw new Error("Invalid raw creation time");
      const expiresAt = createdAt + this.ttlMs;
      if (!Number.isSafeInteger(expiresAt)) throw new RangeError("Raw expiry time overflow");
      // JSON escapes lone surrogates, preserving the exact JavaScript string on recovery.
      const record = JSON.stringify({ format: FORMAT, id, createdAt, expiresAt, text });
      const bytes = Buffer.byteLength(record, "utf8");
      if (bytes > this.maxBytes) throw new RangeError("Raw record exceeds maxBytes");
      const scanned = await this.scan(root);
      const kept = await this.clean(root, scanned.entries, createdAt);
      const count = scanned.count - (scanned.entries.length - kept.length);
      // Reserve the new record and a recovery claim while .lock is present; unknown names count too.
      if (count + 2 > this.scanLimit) throw new Error("Raw record capacity is full");
      const total = kept.reduce((sum, entry) => sum + entry.bytes, 0);
      if (!Number.isSafeInteger(total)) throw new Error("Raw byte accounting overflow");
      if (total > this.maxBytes - bytes) throw new RangeError("Raw store is full");
      const temporary = join(root, ".lock", `${id}.tmp`);
      const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
      try {
        if (POSIX) await handle.chmod(0o600);
        await handle.writeFile(record, "utf8");
        await handle.sync();
        // link() publishes a complete file atomically and never replaces an existing path.
        await fs.link(temporary, join(root, `${id}.json`));
      } finally {
        try { await handle.close(); } finally { await unlink(temporary); }
      }
      return id;
    });
  }

  async get(id: string): Promise<string | undefined> {
    // Validate before any filesystem call; only store-generated identifiers are paths.
    if (typeof id !== "string" || id.length !== 32 || !ID.test(id)) throw new TypeError("Invalid raw identifier");
    return this.locked(async (root) => {
      const record = await this.read(root, id);
      if (!record) return undefined;
      if (Date.now() >= Math.min(record.expiresAt, record.createdAt + this.ttlMs)) {
        await this.remove(root, record);
        return undefined;
      }
      return record.text;
    });
  }

  async list(): Promise<RawEntry[]> {
    return this.locked(async (root) => {
      const entries = await this.clean(root, (await this.scan(root)).entries, Date.now());
      return entries.map(({ id, createdAt, bytes }) => ({ id, createdAt, bytes }));
    });
  }

  /** Remove all validated store records, leaving unrelated files untouched. */
  async purge(): Promise<void> {
    await this.locked(async (root) => {
      for (const entry of (await this.scan(root)).entries) await this.remove(root, entry);
    });
  }

  private async root(): Promise<{ path: string; stat: Stats }> {
    let stat: Stats;
    try { stat = await lstat(this.directory); } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      stat = await lstat(this.directory);
    }
    checkDirectory(stat, "Raw directory");
    // Resolve permitted parent aliases (e.g. macOS /var) after rejecting a symlink root.
    const root = await realpath(this.directory);
    if (!sameFile(stat, await lstat(root))) throw new Error("Raw directory changed during access");
    return { path: root, stat };
  }

  private async locked<T>(action: (root: string, id: string) => Promise<T>): Promise<T> {
    const { path: root, stat: rootStat } = await this.root();
    const lock = join(root, ".lock");
    const deadline = performance.now() + this.lockMs;
    let lockStat: Stats;
    let owner: Owner;
    let permissionError: unknown;
    for (;;) {
      if (performance.now() >= deadline) {
        if (permissionError) throw permissionError;
        throw new Error("Raw store lock timeout; active or ambiguous owner requires waiting or manual recovery");
      }
      if (!sameFile(rootStat, await lstat(root))) throw new Error("Raw directory changed during access");
      try {
        await fs.mkdir(lock, { mode: 0o700 });
        lockStat = await lstat(lock);
        checkDirectory(lockStat, "Unsafe raw lock path");
        owner = await this.writeOwner(lock);
        break;
      } catch (error) {
        // Windows can return EPERM while a competing rmdir is delete-pending.
        const pendingDelete = !POSIX && hasCode(error, "EPERM");
        if (!hasCode(error, "EEXIST") && !pendingDelete) throw error;
        permissionError = pendingDelete ? error : undefined;
        let existing: Stats;
        try { existing = await lstat(lock); } catch (race) {
          if (hasCode(race, "ENOENT") || (!POSIX && hasCode(race, "EPERM"))) {
            if (hasCode(race, "EPERM")) permissionError = race;
            await delay(10);
            continue;
          }
          throw race;
        }
        checkDirectory(existing, "Unsafe raw lock path");
        if (await this.recover(root, existing, rootStat)) continue;
        await delay(10);
      }
    }
    try {
      if (!sameFile(rootStat, await lstat(root))) throw new Error("Raw directory changed during access");
      return await action(root, owner.id);
    } finally {
      if (!sameFile(rootStat, await lstat(root)) || !sameFile(lockStat, await lstat(lock))) {
        throw new Error("Raw directory or lock changed during access");
      }
      const ownerPath = join(lock, "owner.json");
      if (!sameFile(owner.stat, await lstat(ownerPath))) throw new Error("Raw lock owner changed during access");
      await unlink(ownerPath);
      await rmdir(lock);
    }
  }

  private async writeOwner(lock: string): Promise<Owner> {
    const id = randomBytes(16).toString("hex"), token = randomBytes(16).toString("hex");
    if (id === token) throw new Error("Raw lock identifier collision");
    const handle = await open(join(lock, "owner.json"), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
    try {
      if (POSIX) await handle.chmod(0o600);
      await handle.writeFile(JSON.stringify({ format: LOCK_FORMAT, pid: process.pid, id, token }), "utf8");
      return { pid: process.pid, id, token, stat: await handle.stat() };
    } finally { await handle.close(); }
  }

  private async readOwner(lock: string): Promise<Owner | undefined> {
    // Missing, unreadable or malformed ownership is ambiguous, never evidence of a dead process.
    try {
      const before = await lstat(join(lock, "owner.json"));
      checkFile(before);
      if (!Number.isSafeInteger(before.size) || before.size > 256) return undefined;
      const handle = await open(join(lock, "owner.json"), constants.O_RDONLY | NOFOLLOW | (constants.O_NONBLOCK ?? 0));
      try {
        const stat = await handle.stat();
        checkFile(stat);
        if (!sameFile(before, stat) || stat.size > 256) return undefined;
        const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await handle.readFile()));
        if (typeof data !== "object" || !data || Array.isArray(data) || Object.keys(data).length !== 4 || data.format !== LOCK_FORMAT ||
            !Number.isSafeInteger(data.pid) || data.pid <= 0 || data.pid > 2_147_483_647 ||
            typeof data.id !== "string" || data.id.length !== 32 || !ID.test(data.id) ||
            typeof data.token !== "string" || data.token.length !== 32 || !ID.test(data.token) || data.id === data.token) return undefined;
        return { pid: data.pid, id: data.id, token: data.token, stat };
      } finally { await handle.close(); }
    } catch { return undefined; }
  }

  private async recover(root: string, lockStat: Stats, rootStat: Stats): Promise<boolean> {
    const lock = join(root, ".lock");
    const owner = await this.readOwner(lock);
    if (!owner || !deadOwner(owner.pid)) return false;
    // Serialize reclaimers outside .lock, so a stale observer cannot create a claim in a new lock.
    // This claim is removed only by its creator. A crashed reclaimer leaves an ambiguous claim.
    const claim = join(root, ".recovery");
    let handle;
    try { handle = await open(claim, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600); } catch (error) {
      if (hasCode(error, "EEXIST") || hasCode(error, "ENOENT") || (!POSIX && hasCode(error, "EPERM"))) return false;
      throw error;
    }
    let claimStat: Stats;
    try {
      if (POSIX) await handle.chmod(0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, token: owner.token }), "utf8");
      claimStat = await handle.stat();
    } finally { await handle.close(); }
    try {
      if (!sameFile(rootStat, await lstat(root)) || !sameFile(lockStat, await lstat(lock))) return false;
      const current = await this.readOwner(lock);
      if (!current || !sameFile(owner.stat, current.stat) || current.pid !== owner.pid || current.id !== owner.id || current.token !== owner.token || !deadOwner(current.pid)) return false;
      const temporary: { path: string; stat: Stats }[] = [];
      let visited = 0;
      for await (const file of await opendir(lock)) {
        if (++visited > 2) return false;
        if (file.name === "owner.json") continue;
        if (file.name !== `${owner.id}.tmp`) return false;
        const stat = await lstat(join(lock, file.name));
        try {
          checkFile(stat, stat.nlink === 2 ? 2 : 1);
          if (stat.nlink === 2 && !sameFile(stat, await lstat(join(root, `${owner.id}.json`)))) return false;
        } catch { return false; }
        temporary.push({ path: join(lock, file.name), stat });
      }
      // Validate every name before removing anything; partial record temporaries are crash artifacts.
      for (const file of [...temporary, { path: join(lock, "owner.json"), stat: owner.stat }]) {
        if (!sameFile(rootStat, await lstat(root)) || !sameFile(lockStat, await lstat(lock)) || !sameFile(file.stat, await lstat(file.path))) {
          throw new Error("Raw lock changed during recovery");
        }
        await unlink(file.path);
      }
      await rmdir(lock);
    } catch (error) {
      if (hasCode(error, "ENOENT") || (!POSIX && hasCode(error, "EPERM"))) return false;
      throw error;
    } finally {
      if (!sameFile(rootStat, await lstat(root)) || !sameFile(claimStat, await lstat(claim))) {
        throw new Error("Raw recovery claim changed during access");
      }
      await unlink(claim);
    }
    return true;
  }

  private async read(root: string, id: string): Promise<(StoredEntry & { text: string }) | undefined> {
    const path = join(root, `${id}.json`);
    let before: Stats;
    try { before = await lstat(path); } catch (error) {
      if (hasCode(error, "ENOENT")) return undefined;
      throw error;
    }
    checkFile(before);
    const handle = await open(path, constants.O_RDONLY | NOFOLLOW | (constants.O_NONBLOCK ?? 0));
    try {
      const stat = await handle.stat();
      checkFile(stat);
      if (!sameFile(before, stat)) throw new Error("Raw record changed during access");
      if (!Number.isSafeInteger(stat.size) || stat.size > this.maxBytes) throw new Error("Raw record exceeds maxBytes");
      const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await handle.readFile()));
      if (typeof data !== "object" || data === null || Array.isArray(data) || !("format" in data) || data.format !== FORMAT ||
          !("id" in data) || data.id !== id || !("createdAt" in data) || typeof data.createdAt !== "number" ||
          !Number.isSafeInteger(data.createdAt) || data.createdAt < 0 || !("expiresAt" in data) || typeof data.expiresAt !== "number" ||
          !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= data.createdAt || !("text" in data) || typeof data.text !== "string" ||
          Object.keys(data).length !== 5) {
        throw new Error("Invalid raw record");
      }
      return { id, createdAt: data.createdAt, expiresAt: data.expiresAt, bytes: stat.size, stat, text: data.text };
    } finally {
      await handle.close();
    }
  }

  private async scan(root: string): Promise<{ entries: StoredEntry[]; count: number }> {
    const entries: StoredEntry[] = [];
    let visited = 0;
    // One bounded, nonrecursive pass. Unknown names are never opened or removed.
    for await (const file of await opendir(root)) {
      if (++visited > this.scanLimit) throw new Error("Raw directory scan limit exceeded");
      if (file.name.length !== 37) continue;
      const id = FILE.exec(file.name)?.[1];
      if (!id) continue;
      const record = await this.read(root, id);
      if (record) entries.push({ id, createdAt: record.createdAt, expiresAt: record.expiresAt, bytes: record.bytes, stat: record.stat });
    }
    entries.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    return { entries, count: visited };
  }

  private async clean(root: string, entries: StoredEntry[], now: number): Promise<StoredEntry[]> {
    const kept: StoredEntry[] = [];
    for (const entry of entries) {
      if (now >= Math.min(entry.expiresAt, entry.createdAt + this.ttlMs)) {
        await this.remove(root, entry);
      } else {
        kept.push(entry);
      }
    }
    return kept;
  }

  private async remove(root: string, entry: StoredEntry): Promise<void> {
    const path = join(root, `${entry.id}.json`);
    const stat = await lstat(path);
    checkFile(stat);
    if (!sameFile(entry.stat, stat)) throw new Error("Raw record changed during cleanup");
    await unlink(path);
  }
}
