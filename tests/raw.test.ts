import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import fs, { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, rm, rmdir, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { performance } from "node:perf_hooks";
import { test, type TestContext } from "node:test";
import { RawStore, defaultRawDirectory } from "../src/raw/index.js";

const POSIX = process.platform !== "win32";
const posixOnly = { skip: POSIX ? false : "POSIX mode checks do not establish Windows ACL isolation" };
const epoch = 1_700_000_000_000;
const defaultTtl = 7 * 24 * 60 * 60 * 1000;

async function fixture(t: TestContext): Promise<{ parent: string; directory: string }> {
  const parent = await mkdtemp(join(tmpdir(), "hugr-lean-raw-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  return { parent, directory: join(parent, "raw") };
}

async function createSymlink(t: TestContext, target: string, path: string, type?: "dir"): Promise<boolean> {
  try { await symlink(target, path, type); return true; } catch (error) {
    if (!POSIX && typeof error === "object" && error !== null && "code" in error && error.code === "EPERM") {
      t.skip("Windows symlink creation privilege unavailable");
      return false;
    }
    throw error;
  }
}

function clock(t: TestContext): { advance: (ms: number) => void } {
  let now = epoch;
  t.mock.method(Date, "now", () => now);
  return { advance: (ms) => { now += ms; } };
}

function diskRecord(id: string, text: string, ttlMs = defaultTtl): string {
  const createdAt = Date.now();
  return JSON.stringify({ format: "hugr-lean/raw/2", id, createdAt, expiresAt: createdAt + ttlMs, text });
}

function worker(t: TestContext, directory: string, script: string) {
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script, directory], { stdio: ["pipe", "pipe", "pipe"] });
  let output = "", errors = "";
  let signalReady: (line: string) => void, rejectReady: (error: Error) => void;
  let readySeen = false;
  const ready = new Promise<string>((resolve, reject) => { signalReady = resolve; rejectReady = reject; });
  const timer = setTimeout(() => rejectReady(new Error(`worker readiness timeout: ${errors}`)), 5_000);
  child.stdout.on("data", (data) => {
    output += data;
    if (!readySeen && output.startsWith("ready") && output.includes("\n")) {
      readySeen = true;
      clearTimeout(timer);
      signalReady(output.split("\n")[0]!);
    }
  });
  child.stderr.on("data", (data) => { errors += data; });
  child.on("error", (error) => rejectReady(error));
  const finished = new Promise<{ code: number | null; output: string; errors: string }>((resolve) => child.on("close", (code) => {
    clearTimeout(timer);
    if (!readySeen) rejectReady(new Error(`worker exit ${code}: ${errors}`));
    resolve({ code, output, errors });
  }));
  t.after(async () => { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) { child.kill(); await finished; } });
  return { child, ready, finished };
}

async function interruptedPut(t: TestContext, directory: string, published: boolean) {
  const text = "crash boundary\r\n🔥\ud800";
  const source = new URL("../src/raw/index.ts", import.meta.url).href;
  const writer = worker(t, directory, `
    import fs from "node:fs/promises";
    import { basename } from "node:path";
    import { RawStore } from ${JSON.stringify(source)};
    const original = fs.link;
    fs.link = async (temporary, target) => {
      if (${published}) await original(temporary, target);
      console.log("ready " + JSON.stringify({ id: basename(target, ".json") }));
      await new Promise(() => setInterval(() => {}, 1000));
    };
    await new RawStore({ directory: process.argv[1] }).put(${JSON.stringify(text)});
  `);
  const { id } = JSON.parse((await writer.ready).slice(6)) as { id: string };
  const owner = JSON.parse(await readFile(join(directory, ".lock", "owner.json"), "utf8"));
  assert.equal(owner.pid, writer.child.pid);
  assert.equal(owner.id, id);
  assert.doesNotThrow(() => process.kill(owner.pid, 0), "live owner is the positive PID control");
  return { writer, id, text, owner };
}

async function killWriter(writer: ReturnType<typeof worker>): Promise<void> {
  assert.ok(writer.child.kill("SIGKILL"));
  await writer.finished;
  assert.throws(() => process.kill(writer.child.pid!, 0), { code: "ESRCH" });
}

test("default directory is local; construction does no I/O", async (t) => {
  assert.equal(defaultRawDirectory(), join(homedir(), ".cache", "hugr-lean", "raw"));
  const { directory } = await fixture(t);
  new RawStore({ directory });
  await assert.rejects(lstat(directory), { code: "ENOENT" });
});

test("bounds reject zero, negatives, fractions, nonnumbers and unsafe integers", () => {
  for (const value of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "3", null]) {
    assert.throws(() => new RawStore({ maxBytes: value as number }), /positive safe integer/);
    assert.throws(() => new RawStore({ ttlMs: value as number }), /positive safe integer/);
  }
  for (const directory of ["", 7, null]) {
    assert.throws(() => new RawStore({ directory: directory as string }), /nonempty path/);
  }
  assert.doesNotThrow(() => new RawStore({ maxBytes: Number.MAX_SAFE_INTEGER, ttlMs: 1 }));
});

test("exact recovery includes Unicode, CRLF, NUL, escapes and lone surrogates", async (t) => {
  const { directory } = await fixture(t);
  const store = new RawStore({ directory });
  const inputs = ["", "🔥 café 漢字\r\nlast\r", "\u0000\t\"\\\n", "\ud800X\udfff", "\ud83d\udd25\ud800"];
  for (const text of inputs) {
    const id = await store.put(text);
    assert.match(id, /^[a-f0-9]{32}$/);
    assert.equal(await store.get(id), text);
    const disk = await readFile(join(directory, `${id}.json`), "utf8");
    const record = JSON.parse(disk);
    assert.deepEqual(Object.keys(record).sort(), ["createdAt", "expiresAt", "format", "id", "text"]);
    assert.equal(record.format, "hugr-lean/raw/2");
    assert.equal(record.expiresAt, record.createdAt + defaultTtl);
    assert.equal(record.text, text);
  }
  const entries = await store.list();
  assert.equal(entries.length, inputs.length);
  assert.equal(new Set(entries.map(({ id }) => id)).size, inputs.length);
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry).sort(), ["bytes", "createdAt", "id"]);
    assert.equal(entry.bytes, (await lstat(join(directory, `${entry.id}.json`))).size);
  }
  assert.deepEqual((await readdir(directory)).sort(), entries.map(({ id }) => `${id}.json`).sort());
  assert.equal(await store.get("f".repeat(32)), undefined);
});

test("serialized UTF-8 bytes drive cap, including metadata and surrogate escapes", async (t) => {
  clock(t);
  const { directory } = await fixture(t);
  const text = "🔥\r\n\ud800";
  const bytes = Buffer.byteLength(diskRecord("0".repeat(32), text), "utf8");
  assert.ok(bytes > Buffer.byteLength(text, "utf8"));
  const store = new RawStore({ directory, maxBytes: bytes });
  const first = await store.put(text);
  assert.equal((await store.list())[0]?.bytes, bytes);
  await assert.rejects(store.put(`${text}x`), /exceeds maxBytes/);
  assert.equal(await store.get(first), text, "oversize rejection must not evict existing records");
  await assert.rejects(store.put(text), /store is full/);
  assert.equal(await store.get(first), text);
  assert.deepEqual(await readdir(directory), [`${first}.json`]);
  await assert.rejects(store.put(42 as unknown as string), /must be a string/);
});

test("default maxBytes is 64 MiB of serialized records", async (t) => {
  const { directory } = await fixture(t);
  const store = new RawStore({ directory });
  await assert.rejects(store.put("x".repeat(64 * 1024 * 1024)), /exceeds maxBytes/);
  assert.deepEqual(await readdir(directory), []);
});

test("full-store rejection preserves every unexpired record, including oldest and accessed", async (t) => {
  const time = clock(t);
  const { directory } = await fixture(t);
  const bytes = Buffer.byteLength(diskRecord("0".repeat(32), "é"), "utf8");
  const store = new RawStore({ directory, maxBytes: bytes * 2 });
  const oldest = await store.put("é");
  time.advance(1);
  const middle = await store.put("é");
  assert.equal(await store.get(oldest), "é");
  time.advance(1);
  const before = await Promise.all([oldest, middle].map((id) => readFile(join(directory, `${id}.json`))));
  await assert.rejects(store.put("é"), /store is full/);
  assert.equal(await store.get(oldest), "é");
  assert.equal(await store.get(middle), "é");
  assert.deepEqual((await store.list()).map(({ id }) => id), [oldest, middle]);
  assert.deepEqual(await Promise.all([oldest, middle].map((id) => readFile(join(directory, `${id}.json`)))), before);
  assert.ok((await store.list()).reduce((sum, entry) => sum + entry.bytes, 0) <= bytes * 2);
});

test("expired cleanup admits new records without evicting unexpired records", async (t) => {
  const time = clock(t);
  const { directory } = await fixture(t);
  const bytes = Buffer.byteLength(diskRecord("0".repeat(32), "é", 100), "utf8");
  const store = new RawStore({ directory, maxBytes: bytes * 2, ttlMs: 100 });
  const old = await store.put("é");
  time.advance(50);
  const live = await store.put("é");
  time.advance(50);
  const next = await store.put("é");
  assert.equal(await store.get(old), undefined);
  assert.deepEqual((await store.list()).map(({ id }) => id), [live, next]);
  await assert.rejects(store.put("é"), /store is full/);
  assert.equal(await store.get(live), "é");
  assert.equal(await store.get(next), "é");
});

test("publication failure preserves unexpired records and removes its own temporary", async (t) => {
  const { directory } = await fixture(t);
  const store = new RawStore({ directory });
  const id = await store.put("original\ud800");
  const before = await readFile(join(directory, `${id}.json`));
  const failure = Object.assign(new Error("publication failure"), { code: "EIO" });
  let attempts = 0;
  t.mock.method(fs, "link", async () => { attempts++; throw failure; });
  await assert.rejects(store.put("new"), (error) => error === failure);
  assert.equal(attempts, 1);
  assert.equal(await store.get(id), "original\ud800");
  assert.deepEqual(await readFile(join(directory, `${id}.json`)), before);
  assert.deepEqual(await readdir(directory), [`${id}.json`]);
});

test("TTL is lazy and expires exactly at boundary; list/get/put clean old records", async (t) => {
  const time = clock(t);
  const { directory } = await fixture(t);
  const store = new RawStore({ directory, ttlMs: 100 });
  const first = await store.put("first");
  time.advance(99);
  assert.equal(await store.get(first), "first");
  const second = await store.put("second");
  time.advance(1);
  assert.ok((await readdir(directory)).includes(`${first}.json`), "expiry has no background timer");
  assert.deepEqual((await store.list()).map(({ id }) => id), [second]);
  time.advance(99);
  assert.equal(await store.get(second), undefined);
  assert.deepEqual(await readdir(directory), []);
  const third = await store.put("third");
  time.advance(100);
  const fourth = await store.put("fourth");
  assert.equal(await store.get(third), undefined);
  assert.deepEqual((await store.list()).map(({ id }) => id), [fourth]);
});

test("default TTL is seven days", async (t) => {
  const time = clock(t);
  const { directory } = await fixture(t);
  const store = new RawStore({ directory });
  const id = await store.put("week");
  time.advance(7 * 24 * 60 * 60 * 1000 - 1);
  assert.equal(await store.get(id), "week");
  time.advance(1);
  assert.equal(await store.get(id), undefined);
});

test("purge removes only validated records, preserving unrelated files and directories", async (t) => {
  const { directory } = await fixture(t);
  const store = new RawStore({ directory });
  const id = await store.put("owned");
  await writeFile(join(directory, "notes.txt"), "unrelated");
  await writeFile(join(directory, "not-an-id.json"), "not JSON");
  const newlineName = `${id}.json\n`;
  if (POSIX) await writeFile(join(directory, newlineName), "unrelated");
  await mkdir(join(directory, "unrelated"));
  await writeFile(join(directory, "unrelated", "nested"), "keep");
  await store.purge();
  const remaining = ["not-an-id.json", "notes.txt", "unrelated", ...(POSIX ? [newlineName] : [])];
  assert.deepEqual((await readdir(directory)).sort(), remaining.sort());
  assert.equal(await readFile(join(directory, "notes.txt"), "utf8"), "unrelated");
  assert.equal(await readFile(join(directory, "unrelated", "nested"), "utf8"), "keep");
  assert.deepEqual(await store.list(), []);
  await store.purge();
});

test("identifiers reject traversal, absolute paths, suffixes, newline anchors and coercion", async (t) => {
  const { parent, directory } = await fixture(t);
  const outside = join(parent, "outside.json");
  const content = diskRecord("../outside", "outside secret");
  await writeFile(outside, content, { mode: 0o600 });
  const store = new RawStore({ directory });
  for (const id of ["../outside", outside, "a".repeat(32) + "\n", "a".repeat(32) + ".json", "A".repeat(32), "", null, 1]) {
    await assert.rejects(store.get(id as string), /Invalid raw identifier/);
  }
  await assert.rejects(lstat(directory), { code: "ENOENT" });
  assert.equal(await readFile(outside, "utf8"), content);
});

test("symlink root is refused for every operation, preserving outside directory", async (t) => {
  const { parent, directory } = await fixture(t);
  const outside = join(parent, "outside");
  await mkdir(outside, { mode: 0o700 });
  await writeFile(join(outside, "sentinel"), "keep");
  if (!await createSymlink(t, outside, directory, "dir")) return;
  const store = new RawStore({ directory });
  await assert.rejects(store.put("no"), /real directory/);
  await assert.rejects(store.get("a".repeat(32)), /real directory/);
  await assert.rejects(store.list(), /real directory/);
  await assert.rejects(store.purge(), /real directory/);
  assert.deepEqual(await readdir(outside), ["sentinel"]);
  assert.equal(await readFile(join(outside, "sentinel"), "utf8"), "keep");
  assert.ok((await lstat(directory)).isSymbolicLink());
});

test("symlink record is never read or removed by get, cleanup or purge", async (t) => {
  const { parent, directory } = await fixture(t);
  await mkdir(directory, { mode: 0o700 });
  const id = "a".repeat(32);
  const outside = join(parent, "outside.json");
  const content = diskRecord(id, "outside secret");
  await writeFile(outside, content, { mode: 0o600 });
  if (!await createSymlink(t, outside, join(directory, `${id}.json`))) return;
  const store = new RawStore({ directory });
  await assert.rejects(store.get(id), /regular, single-link file/);
  await assert.rejects(store.put("no"), /regular, single-link file/);
  await assert.rejects(store.list(), /regular, single-link file/);
  await assert.rejects(store.purge(), /regular, single-link file/);
  assert.equal(await readFile(outside, "utf8"), content);
  assert.ok((await lstat(join(directory, `${id}.json`))).isSymbolicLink());
});

test("hard-linked records are refused without mutating outside inode", async (t) => {
  const { parent, directory } = await fixture(t);
  await mkdir(directory, { mode: 0o700 });
  const id = "b".repeat(32);
  const outside = join(parent, "outside.json");
  const content = diskRecord(id, "outside secret");
  await writeFile(outside, content, { mode: 0o600 });
  await link(outside, join(directory, `${id}.json`));
  const store = new RawStore({ directory });
  await assert.rejects(store.get(id), /single-link file/);
  await assert.rejects(store.purge(), /single-link file/);
  assert.equal(await readFile(outside, "utf8"), content);
  assert.equal((await lstat(outside)).nlink, 2);
});

test("symlink or file lock is refused without following/deleting it", async (t) => {
  const { parent, directory } = await fixture(t);
  await mkdir(directory, { mode: 0o700 });
  const outside = join(parent, "outside");
  await mkdir(outside, { mode: 0o700 });
  if (!await createSymlink(t, outside, join(directory, ".lock"), "dir")) return;
  const store = new RawStore({ directory });
  await assert.rejects(store.put("no"), /Unsafe raw lock path/);
  assert.deepEqual(await readdir(outside), []);
  await rm(join(directory, ".lock"));
  await writeFile(join(directory, ".lock"), "unrelated");
  await assert.rejects(store.list(), /Unsafe raw lock path/);
  assert.equal(await readFile(join(directory, ".lock"), "utf8"), "unrelated");
});

test("POSIX directory/file modes are 0700/0600; unsafe existing modes fail", posixOnly, async (t) => {
  const { directory } = await fixture(t);
  const store = new RawStore({ directory });
  const id = await store.put("private");
  const file = join(directory, `${id}.json`);
  assert.equal((await lstat(directory)).mode & 0o777, 0o700);
  assert.equal((await lstat(file)).mode & 0o777, 0o600);
  await chmod(file, 0o644);
  await assert.rejects(store.get(id), /mode 0600/);
  await assert.rejects(store.purge(), /mode 0600/);
  await chmod(file, 0o600);
  await chmod(directory, 0o755);
  await assert.rejects(store.put("no"), /mode 0700/);
  await chmod(directory, 0o700);
  assert.equal(await store.get(id), "private");
});

test("corruption is explicit and scan failures preserve every entry", async (t) => {
  const { directory } = await fixture(t);
  const store = new RawStore({ directory });
  const good = await store.put("good");
  const bad = await store.put("bad");
  const path = join(directory, `${bad}.json`);
  await writeFile(path, "{truncated");
  await assert.rejects(store.get(bad), SyntaxError);
  await assert.rejects(store.list(), SyntaxError);
  await assert.rejects(store.put("new"), SyntaxError);
  await assert.rejects(store.purge(), SyntaxError);
  assert.equal(await store.get(good), "good");
  assert.equal(await readFile(path, "utf8"), "{truncated");
  assert.deepEqual((await readdir(directory)).sort(), [`${good}.json`, `${bad}.json`].sort());
});

test("invalid schema, mismatched IDs and malformed UTF-8 never invent valid text", async (t) => {
  const { directory } = await fixture(t);
  const store = new RawStore({ directory });
  const id = await store.put("valid");
  const record = JSON.parse(await readFile(join(directory, `${id}.json`), "utf8"));
  for (const data of [
    { ...record, format: "unknown" }, { ...record, format: "hugr-lean/raw/1" }, { ...record, id: "c".repeat(32) },
    { ...record, createdAt: -1 }, { ...record, createdAt: 1.5 },
    { ...record, createdAt: Number.MAX_SAFE_INTEGER + 1 }, { ...record, text: null },
    { ...record, extra: true }, { text: "unrelated" }, [record], null,
  ]) {
    await writeFile(join(directory, `${id}.json`), JSON.stringify(data));
    await assert.rejects(store.get(id), /Invalid raw record/);
  }
  const malformed = Buffer.concat([Buffer.from(`{"format":"hugr-lean/raw/2","id":"${id}","createdAt":${epoch},"expiresAt":${epoch + defaultTtl},"text":"`), Buffer.from([0xff]), Buffer.from('"}')]);
  await writeFile(join(directory, `${id}.json`), malformed);
  await assert.rejects(store.get(id), /encoded data was not valid/);
});

test("oversized disk records and filesystem failures throw, rather than report missing", async (t) => {
  const { parent, directory } = await fixture(t);
  const store = new RawStore({ directory, maxBytes: 256 });
  const id = await store.put("valid");
  const content = diskRecord(id, "x".repeat(300));
  await writeFile(join(directory, `${id}.json`), content);
  await assert.rejects(store.get(id), /exceeds maxBytes/);
  await assert.rejects(store.purge(), /exceeds maxBytes/);
  assert.equal(await readFile(join(directory, `${id}.json`), "utf8"), content);
  const notDirectory = join(parent, "file");
  await writeFile(notDirectory, "keep");
  await assert.rejects(new RawStore({ directory: notDirectory }).get(id), /real directory/);
  await assert.rejects(new RawStore({ directory: join(notDirectory, "child") }).get(id), { code: "ENOTDIR" });
});

test("same-process concurrent store instances publish complete unique records", async (t) => {
  const { directory } = await fixture(t);
  const stores = [new RawStore({ directory }), new RawStore({ directory })];
  const inputs = Array.from({ length: 24 }, (_, index) => `entry ${index}\r\n🔥\ud800`);
  // Repair the admission assumption: the documented five-second bound may refuse contention.
  const results = await Promise.allSettled(inputs.map((text, index) => stores[index % 2]!.put(text)));
  const accepted: { id: string; text: string }[] = [], refused: number[] = [];
  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") accepted.push({ id: result.value, text: inputs[index]! });
    else {
      assert.ok(result.reason instanceof Error);
      assert.equal(result.reason.message, "Raw store lock timeout; active or ambiguous owner requires waiting or manual recovery");
      refused.push(index);
    }
  }
  assert.ok(accepted.length > 0, "concurrent publication must make progress");
  const verify = async (entries: typeof accepted) => {
    const ids = entries.map(({ id }) => id);
    assert.equal(new Set(ids).size, entries.length);
    assert.deepEqual(await Promise.all(ids.map((id) => stores[0]!.get(id))), entries.map(({ text }) => text));
    const listed = await stores[0]!.list();
    assert.deepEqual(listed.map(({ id }) => id).sort(), [...ids].sort());
    assert.deepEqual((await readdir(directory)).sort(), ids.map((id) => `${id}.json`).sort());
    const records = await Promise.all(ids.map((id) => readFile(join(directory, `${id}.json`))));
    for (const [index, bytes] of records.entries()) {
      const record = JSON.parse(bytes.toString("utf8"));
      assert.equal(record.id, entries[index]!.id);
      assert.equal(record.text, entries[index]!.text);
      assert.equal(listed.find(({ id }) => id === record.id)!.bytes, bytes.byteLength);
    }
    return records;
  };
  // Check drained-batch closure before retrying, so rejected publications cannot hide.
  const before = await verify(accepted);
  const completed = [...accepted];
  for (const index of refused) completed.push({ id: await stores[index % 2]!.put(inputs[index]!), text: inputs[index]! });
  assert.equal(completed.length, inputs.length);
  await verify(completed);
  assert.deepEqual(await Promise.all(accepted.map(({ id }) => readFile(join(directory, `${id}.json`)))), before);
});

test("concurrent pressure respects serialized byte cap", async (t) => {
  const { directory } = await fixture(t);
  const store = new RawStore({ directory, maxBytes: 700 });
  const texts = Array.from({ length: 16 }, (_, index) => `${index}:` + "🔥".repeat(20));
  const results = await Promise.allSettled(texts.map((text) => store.put(text)));
  const ids = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const rejected = results.filter((result) => result.status === "rejected");
  assert.ok(rejected.length > 0);
  for (const result of rejected) assert.match(String(result.reason), /store is full/);
  const entries = await store.list();
  assert.ok(entries.length > 0 && entries.length === ids.length);
  assert.ok(entries.reduce((sum, entry) => sum + entry.bytes, 0) <= 700);
  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") assert.equal(await store.get(result.value), texts[index]);
  }
  assert.deepEqual((await readdir(directory)).sort(), entries.map(({ id }) => `${id}.json`).sort());
});

test("independent filesystem observer sees only complete published JSON", { timeout: 10_000 }, async (t) => {
  const { directory } = await fixture(t);
  await mkdir(directory, { mode: 0o700 });
  const observed = new Promise<{ id: string; text: string }>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Publication observer saw no record")), 5_000);
    t.after(() => clearTimeout(timeout));
    const watcher = watch(directory, (_event, filename) => {
      if (!filename?.endsWith(".json")) return;
      watcher.close();
      readFile(join(directory, filename), "utf8").then((text) => resolve(JSON.parse(text)), reject).catch(reject);
    });
    watcher.on("error", reject);
    t.after(() => watcher.close());
  });
  const text = "🔥\ud800\r\n".repeat(100_000);
  const [publication, observation] = await Promise.allSettled([new RawStore({ directory }).put(text), observed]);
  if (publication.status === "rejected") throw publication.reason;
  if (observation.status === "rejected") throw observation.reason;
  assert.equal(observation.value.id, publication.value);
  assert.equal(observation.value.text, text);
});

test("scan work is bounded and failure leaves records and unrelated files intact", { timeout: 30_000 }, async (t) => {
  const { directory } = await fixture(t);
  const store = new RawStore({ directory });
  const id = await store.put("keep");
  Object.assign(store, { scanLimit: 5 }); // Exercise the production bound without 10,000 filesystem writes.
  await Promise.all(Array.from({ length: 4 }, (_, index) => writeFile(join(directory, `note-${index}`), "unrelated")));
  await assert.rejects(store.list(), /scan limit exceeded/);
  assert.equal(await store.get(id), "keep");
  assert.equal(await readFile(join(directory, "note-3"), "utf8"), "unrelated");
  assert.equal((await readdir(directory)).length, 5);
});

test("count capacity reserves lock/new record, preserves unknown names and reuses expired slots", async (t) => {
  const time = clock(t);
  const { directory } = await fixture(t);
  const store = new RawStore({ directory, ttlMs: 100 });
  Object.assign(store, { scanLimit: 5 });
  const first = await store.put("");
  await writeFile(join(directory, "unrelated"), "keep");
  time.advance(50);
  const second = await store.put("");
  assert.equal((await store.list()).length, 2, "successful state remains scannable with .lock");
  await assert.rejects(store.put(""), /record capacity is full/);
  assert.equal(await store.get(first), "");
  assert.equal(await store.get(second), "");
  time.advance(50);
  const next = await store.put("");
  assert.equal(await store.get(first), undefined);
  assert.deepEqual((await store.list()).map(({ id }) => id), [second, next]);
  assert.equal(await readFile(join(directory, "unrelated"), "utf8"), "keep");
  await store.purge();
  assert.deepEqual(await readdir(directory), ["unrelated"]);
});

test("separate processes contend on real lock and recover exact complete records", async (t) => {
  const { directory } = await fixture(t);
  await mkdir(directory, { mode: 0o700 });
  await mkdir(join(directory, ".lock"), { mode: 0o700 });
  const source = new URL("../src/raw/index.ts", import.meta.url).href;
  const workers = Array.from({ length: 4 }, (_, workerIndex) => {
    const script = `
      import { RawStore } from ${JSON.stringify(source)};
      const store = new RawStore({ directory: process.argv[1] });
      console.log("ready");
      const texts = Array.from({ length: 4 }, (_, i) => ${workerIndex} + ":" + i + "\\r\\n🔥\\ud800");
      const ids = await Promise.all(texts.map(text => store.put(text)));
      console.log(JSON.stringify({ ids, texts }));
    `;
    return worker(t, directory, script);
  });
  await Promise.all(workers.map(({ ready }) => ready));
  await rmdir(join(directory, ".lock"));
  const results = (await Promise.all(workers.map(({ finished }) => finished))).map(({ code, output, errors }) => {
    assert.equal(code, 0, errors);
    return JSON.parse(output.split("\n")[1]!) as { ids: string[]; texts: string[] };
  });
  const store = new RawStore({ directory });
  const ids = results.flatMap(({ ids }) => ids);
  assert.equal(new Set(ids).size, 16);
  assert.deepEqual(await Promise.all(ids.map((id) => store.get(id))), results.flatMap(({ texts }) => texts));
  assert.equal((await store.list()).length, 16);
  assert.deepEqual((await readdir(directory)).sort(), ids.map((id) => `${id}.json`).sort());
});

test("proven-dead owners recover before/after publication with concurrent process reclaimers", async (t) => {
  for (const published of [false, true]) await t.test(published ? "published link survives" : "partial temporary is removed", { timeout: 15_000 }, async (t) => {
    const { directory } = await fixture(t);
    const store = new RawStore({ directory });
    const prior = await store.put("unexpired prior");
    const crash = await interruptedPut(t, directory, published);
    const lock = join(directory, ".lock");
    const ownerBytes = await readFile(join(lock, "owner.json"));
    assert.equal((await lstat(join(lock, `${crash.id}.tmp`))).nlink, published ? 2 : 1);
    Object.assign(store, { lockMs: 100 });
    await assert.rejects(store.put("live lock must not be stolen"), /lock timeout/);
    assert.deepEqual(await readFile(join(lock, "owner.json")), ownerBytes);
    await killWriter(crash.writer);
    if (!published) await writeFile(join(lock, `${crash.id}.tmp`), "{partial");
    const source = new URL("../src/raw/index.ts", import.meta.url).href;
    const reclaimers = Array.from({ length: 2 }, (_, index) => worker(t, directory, `
      import { RawStore } from ${JSON.stringify(source)};
      console.log("ready");
      await new Promise(resolve => process.stdin.once("data", resolve));
      const id = await new RawStore({ directory: process.argv[1] }).put("reclaimer-${index}");
      console.log(JSON.stringify({ id, text: "reclaimer-${index}" }));
    `));
    await Promise.all(reclaimers.map(({ ready }) => ready));
    for (const { child } of reclaimers) child.stdin.end("go\n");
    const recovered = (await Promise.all(reclaimers.map(({ finished }) => finished))).map(({ code, output, errors }) => {
      assert.equal(code, 0, errors);
      return JSON.parse(output.split("\n")[1]!) as { id: string; text: string };
    });
    assert.equal(await store.get(prior), "unexpired prior");
    assert.equal(await store.get(crash.id), published ? crash.text : undefined);
    for (const { id, text } of recovered) assert.equal(await store.get(id), text);
    if (published) assert.equal((await lstat(join(directory, `${crash.id}.json`))).nlink, 1);
    const ids = [prior, ...recovered.map(({ id }) => id), ...(published ? [crash.id] : [])];
    assert.deepEqual((await readdir(directory)).sort(), ids.map((id) => `${id}.json`).sort());
    assert.equal((await store.list()).length, ids.length);
  });
});

test("dead-owner recovery preserves unknown lock contents and existing reclaimer claims", async (t) => {
  for (const claim of [false, true]) await t.test(claim ? "existing claim" : "unknown lock file", async (t) => {
    const { directory } = await fixture(t);
    const crash = await interruptedPut(t, directory, false);
    await killWriter(crash.writer);
    const lock = join(directory, ".lock");
    const path = claim ? join(directory, ".recovery") : join(lock, "keep.txt");
    await writeFile(path, "unrelated");
    const before = await readFile(join(lock, `${crash.id}.tmp`));
    const store = new RawStore({ directory });
    Object.assign(store, { lockMs: 100 });
    await assert.rejects(store.put("no"), /lock timeout/);
    assert.equal(await readFile(path, "utf8"), "unrelated");
    assert.deepEqual(await readFile(join(lock, `${crash.id}.tmp`)), before);
    assert.equal(JSON.parse(await readFile(join(lock, "owner.json"), "utf8")).pid, crash.owner.pid);
    assert.deepEqual((await readdir(directory)).sort(), claim ? [".lock", ".recovery"] : [".lock"]);
  });
});

test("dead-owner cleanup refuses symlinks, outside hard links and nonprivate lock directories", async (t) => {
  for (const attack of ["temporary symlink", "temporary hard link", "owner symlink", "lock mode"]) await t.test(attack, attack === "lock mode" ? posixOnly : {}, async (t) => {
    const { parent, directory } = await fixture(t);
    const crash = await interruptedPut(t, directory, false);
    await killWriter(crash.writer);
    const lock = join(directory, ".lock"), temporary = join(lock, `${crash.id}.tmp`);
    const outside = join(parent, "outside");
    const content = attack === "owner symlink" ? await readFile(join(lock, "owner.json"), "utf8") : "outside secret";
    await writeFile(outside, content, { mode: 0o600 });
    if (attack.startsWith("temporary")) {
      await rm(temporary);
      if (attack === "temporary symlink") { if (!await createSymlink(t, outside, temporary)) return; }
      else await link(outside, temporary);
    } else if (attack === "owner symlink") {
      await rm(join(lock, "owner.json"));
      if (!await createSymlink(t, outside, join(lock, "owner.json"))) return;
    } else await chmod(lock, 0o755);
    const store = new RawStore({ directory });
    Object.assign(store, { lockMs: 100 });
    await assert.rejects(store.put("no"), attack === "lock mode" ? /mode 0700/ : /lock timeout/);
    assert.equal(await readFile(outside, "utf8"), content);
    assert.deepEqual((await readdir(lock)).sort(), [`${crash.id}.tmp`, "owner.json"].sort());
    if (attack === "temporary hard link") assert.equal((await lstat(outside)).nlink, 2);
    if (attack === "temporary symlink") assert.ok((await lstat(temporary)).isSymbolicLink());
    if (attack === "owner symlink") assert.ok((await lstat(join(lock, "owner.json"))).isSymbolicLink());
    if (attack === "lock mode") await chmod(lock, 0o700);
  });
});

test("malformed owners and EPERM PID probes stay ambiguous without touching lock contents", async (t) => {
  const { directory } = await fixture(t);
  await mkdir(join(directory, ".lock"), { recursive: true, mode: 0o700 });
  const path = join(directory, ".lock", "owner.json");
  const owner = { format: "hugr-lean/raw-lock/1", pid: process.pid, id: "a".repeat(32), token: "b".repeat(32) };
  let probes = 0;
  t.mock.method(process, "kill", () => { probes++; throw Object.assign(new Error("ambiguous PID"), { code: "EPERM" }); });
  const store = new RawStore({ directory });
  Object.assign(store, { lockMs: 100 });
  const ownerBytes = Buffer.from(JSON.stringify(owner), "utf8");
  await writeFile(path, ownerBytes, { mode: 0o600 });
  const temporary = join(directory, ".lock", `${owner.id}.tmp`);
  const temporaryBytes = Buffer.from("{partial temporary\r\n", "utf8");
  await writeFile(temporary, temporaryBytes, { mode: 0o600 });
  const lockEntries = [`${owner.id}.tmp`, "owner.json"].sort();
  await assert.rejects(store.put("no"), /lock timeout/);
  assert.ok(probes > 0, "valid ownership must reach the PID probe");
  assert.deepEqual(await readFile(path), ownerBytes, "EPERM must preserve exact valid owner bytes before later cases overwrite them");
  assert.deepEqual((await readdir(join(directory, ".lock"))).sort(), lockEntries);
  assert.deepEqual(await readFile(temporary), temporaryBytes);
  assert.deepEqual(await readdir(directory), [".lock"]);
  for (const contents of ["{partial", JSON.stringify({ ...owner, pid: -1 }), JSON.stringify({ ...owner, id: "../escape" })]) {
    probes = 0;
    await writeFile(path, contents);
    await assert.rejects(store.put("no"), /lock timeout/);
    assert.equal(probes, 0);
    assert.equal(await readFile(path, "utf8"), contents);
  }
  assert.deepEqual(await readdir(directory), [".lock"]);
});

test("lock-acquisition EPERM follows platform bounds and preserves real errors", { timeout: 10_000 }, async (t) => {
  const { parent, directory } = await fixture(t);
  const original = fs.mkdir;
  const transient = Object.assign(new Error("delete-pending control"), { code: "EPERM" });
  let failures = 0;
  const mkdirMock = t.mock.method(fs, "mkdir", async (...args: Parameters<typeof fs.mkdir>) => {
    if (basename(String(args[0])) === ".lock" && failures < 3) {
      failures++;
      throw transient;
    }
    return original(...args);
  });
  const store = new RawStore({ directory });
  if (POSIX) {
    await assert.rejects(store.put("no retry"), (error) => error === transient);
    assert.equal(failures, 1, "POSIX permission failures must not be retried");
    mkdirMock.mock.mockImplementation(original);
  }
  const id = await store.put("retry intact\r\n\ud800");
  assert.equal(failures, POSIX ? 1 : 3, "the fault control must execute");
  assert.equal(await store.get(id), "retry intact\r\n\ud800");
  assert.deepEqual(await readdir(directory), [`${id}.json`]);
  const denied = Object.assign(new Error("real permission failure"), { code: "EPERM" });
  const recordBytes = await readFile(join(directory, `${id}.json`));
  const freshDirectory = join(parent, "fresh");
  const fresh = new RawStore({ directory: freshDirectory });
  const lockMs = 200;
  let lockAttempts = 0, rootSetups = 0;
  mkdirMock.mock.mockImplementation(async (...args: Parameters<typeof fs.mkdir>) => {
    if (basename(String(args[0])) === ".lock") { lockAttempts++; throw denied; }
    rootSetups++;
    return original(...args);
  });
  for (const candidate of [fresh, store]) {
    Object.assign(candidate, { lockMs });
    lockAttempts = 0;
    const started = performance.now();
    await assert.rejects(candidate.get(id), (error) => error === denied);
    const elapsed = performance.now() - started;
    assert.ok(elapsed < 2_000, "permanent lock permission failure must reject within a bounded budget");
    if (POSIX) assert.equal(lockAttempts, 1, "POSIX lock EPERM must be immediate");
    else {
      assert.ok(lockAttempts > 1, "Windows permanent EPERM must exercise repeated lock attempts");
      assert.ok(elapsed >= lockMs, "Windows retry must reach the lock deadline");
    }
    assert.deepEqual(await readFile(join(directory, `${id}.json`)), recordBytes);
  }
  assert.equal(rootSetups, 1, "fresh root setup must delegate to the real mkdir");
  assert.ok((await lstat(freshDirectory)).isDirectory());
  assert.deepEqual(await readdir(freshDirectory), []);
  mkdirMock.mock.mockImplementation(original);
  assert.equal(await store.get(id), "retry intact\r\n\ud800");
  assert.deepEqual(await readFile(join(directory, `${id}.json`)), recordBytes);
  assert.deepEqual(await readdir(directory), [`${id}.json`]);
});

test("abandoned lock times out even with frozen Date.now and is not stolen", { timeout: 8_000 }, async (t) => {
  clock(t);
  const { directory } = await fixture(t);
  await mkdir(directory, { mode: 0o700 });
  await mkdir(join(directory, ".lock"), { mode: 0o700 });
  await assert.rejects(new RawStore({ directory }).put("no"), /lock timeout/);
  assert.deepEqual(await readdir(directory), [".lock"]);
  assert.ok((await lstat(join(directory, ".lock"))).isDirectory());
});
