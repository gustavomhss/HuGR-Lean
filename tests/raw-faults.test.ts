import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs, { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile, type FileHandle } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test, type TestContext } from "node:test";
import { RawStore } from "../src/raw/index.js";

const POSIX = process.platform !== "win32";
const epoch = 1_700_000_000_000;
const text = "retained\r\n🔥\ud800";
const phases = ["open", ...(POSIX ? ["chmod"] : []), "writeFile", "close"];

async function fixture(t: TestContext) {
  const parent = await mkdtemp(join(tmpdir(), "hugr-lean-raw-faults-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  let now = epoch;
  t.mock.method(Date, "now", () => now);
  return { directory: join(parent, "raw"), parent, advance: () => { now++; } };
}

function openFault(t: TestContext, matches: (path: string) => boolean,
  fault: (path: string, handle?: FileHandle) => Promise<FileHandle | undefined>) {
  const original = fs.open;
  const mock = t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    const path = String(args[0]);
    if (!matches(path)) return original(...args);
    const early = await fault(path);
    if (early) return early;
    return (await fault(path, await original(...args)))!;
  });
  syncBuiltinESMExports();
  const restore = () => { mock.mock.restore(); syncBuiltinESMExports(); };
  t.after(restore);
  return restore;
}

function phaseFault(t: TestContext, matches: (path: string) => boolean, phase: string, failure: Error) {
  let attempts = 0;
  const restore = openFault(t, matches, async (_path, handle) => {
    if (!handle) {
      if (phase === "open") { attempts++; throw failure; }
      return undefined;
    }
    return new Proxy(handle, { get(target, key) {
      if (key === phase) return async () => {
        attempts++;
        if (phase === "close") await target.close();
        if (phase === "writeFile") await target.writeFile("{partial", "utf8");
        if (phase === "stat" && attempts > 1) return target.stat();
        throw failure;
      };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
  });
  return { restore, attempts: () => attempts };
}

for (const phase of [...phases, "stat"]) test(`owner initialization ${phase} failure cleans only its own lock`, async (t) => {
  const { directory } = await fixture(t);
  const store = new RawStore({ directory });
  const id = await store.put(text), path = join(directory, `${id}.json`);
  const before = await readFile(path);
  const failure = Object.assign(new Error(`owner ${phase} failure`), { code: "EIO" });
  const fault = phaseFault(t, (path) => basename(path) === "owner.json", phase, failure);
  await assert.rejects(store.put("rejected"), (error) => error === failure);
  assert.equal(fault.attempts(), phase === "stat" ? 2 : 1);
  assert.deepEqual(await readdir(directory), [`${id}.json`]);
  assert.deepEqual(await readFile(path), before);
  fault.restore();
  assert.equal(await store.get(id), text);
  const next = await store.put("retry");
  assert.equal(await store.get(next), "retry", "the same live process must reacquire immediately");
});

for (const code of ["EEXIST", "EPERM"]) test(`owner-write ${code} is not mistaken for mkdir contention`, async (t) => {
  const { directory } = await fixture(t);
  const failure = Object.assign(new Error(`owner write ${code}`), { code });
  const fault = phaseFault(t, (path) => basename(path) === "owner.json", "writeFile", failure);
  const store = new RawStore({ directory });
  Object.assign(store, { lockMs: 50 });
  await assert.rejects(store.put("rejected"), (error) => error === failure);
  assert.equal(fault.attempts(), 1);
  assert.deepEqual(await readdir(directory), []);
});

test("owner cleanup refuses a replaced file and preserves the original failure", async (t) => {
  const { directory, parent } = await fixture(t);
  const failure = new Error("owner initialization interrupted");
  const backup = join(parent, "owned-inode"), replacement = "unknown replacement owner";
  openFault(t, (path) => basename(path) === "owner.json", async (path, handle) => {
    if (!handle) return undefined;
    return new Proxy(handle, { get(target, key) {
      if (key === "writeFile") return async () => {
        await rename(path, backup);
        await writeFile(path, replacement, { mode: 0o600 });
        throw failure;
      };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
  });
  await assert.rejects(new RawStore({ directory }).put("rejected"), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.ok(error.errors[0] instanceof AggregateError);
    assert.equal(error.errors[0].errors[0], failure);
    return true;
  });
  assert.equal(await readFile(join(directory, ".lock", "owner.json"), "utf8"), replacement);
  assert.deepEqual(await readdir(join(directory, ".lock")), ["owner.json"]);
  assert.ok((await lstat(backup)).isFile());
});

for (const phase of [...phases, "sync", "link"]) test(`eviction preserves every original on replacement ${phase} failure`, async (t) => {
  const { directory, advance } = await fixture(t);
  const seed = new RawStore({ directory });
  const first = await seed.put(text);
  advance();
  const second = await seed.put(text);
  const before = await Promise.all([first, second].map((id) => readFile(join(directory, `${id}.json`))));
  const store = new RawStore({ directory, evict: true, maxBytes: before[0]!.length * 2 });
  const failure = Object.assign(new Error(`replacement ${phase} failure`), { code: "EIO" });
  let attempts: () => number, restore: () => void;
  if (phase === "link") {
    const mock = t.mock.method(fs, "link", async () => { throw failure; });
    attempts = () => mock.mock.callCount(); restore = () => mock.mock.restore();
  } else {
    const fault = phaseFault(t, (path) => path.endsWith(".tmp"), phase, failure);
    attempts = fault.attempts; restore = fault.restore;
  }
  await assert.rejects(store.put(text.repeat(4)), (error) => error === failure);
  assert.equal(attempts(), 1, "the failure must execute after selecting more than one victim");
  assert.deepEqual((await readdir(directory)).sort(), [first, second].map((id) => `${id}.json`).sort());
  assert.deepEqual(await Promise.all([first, second].map((id) => readFile(join(directory, `${id}.json`)))), before);
  restore();
  assert.equal(await store.get(first), text);
  assert.equal(await store.get(second), text);
  const next = await store.put(text.repeat(4));
  assert.deepEqual((await store.list()).map(({ id }) => id), [next]);
  assert.equal(await store.get(next), text.repeat(4));
});

test("count eviction publishes first, holds the lock, and preserves unknown names", async (t) => {
  const { directory, advance } = await fixture(t);
  const store = new RawStore({ directory, evict: true });
  Object.assign(store, { scanLimit: 5 });
  const first = await store.put(text);
  advance();
  const second = await store.put(text);
  await writeFile(join(directory, "unrelated"), "keep");
  const originalLink = fs.link;
  let observed = false;
  t.mock.method(fs, "link", async (...[source, target]: Parameters<typeof fs.link>) => {
    assert.equal(JSON.parse(await readFile(join(directory, `${first}.json`), "utf8")).text, text);
    assert.equal(JSON.parse(await readFile(join(directory, `${second}.json`), "utf8")).text, text);
    const contender = new RawStore({ directory, evict: true });
    Object.assign(contender, { lockMs: 30 });
    await assert.rejects(contender.put("must wait"), /lock timeout/);
    observed = true;
    return originalLink(source, target);
  });
  advance();
  const next = await store.put("replacement");
  assert.ok(observed);
  assert.equal(await store.get(first), undefined);
  assert.equal(await store.get(second), text);
  assert.equal(await store.get(next), "replacement");
  assert.equal(await readFile(join(directory, "unrelated"), "utf8"), "keep");
  assert.equal((await store.list()).length, 2);
});

test("admission failure cannot evict originals when unknown names exhaust physical headroom", async (t) => {
  const { directory } = await fixture(t);
  const seed = new RawStore({ directory });
  const id = await seed.put(text), before = await readFile(join(directory, `${id}.json`));
  await writeFile(join(directory, "unrelated-a"), "keep a");
  await writeFile(join(directory, "unrelated-b"), "keep b");
  const store = new RawStore({ directory, evict: true });
  Object.assign(store, { scanLimit: 4 });
  await assert.rejects(store.put("rejected"), /record capacity is full/);
  assert.deepEqual(await readFile(join(directory, `${id}.json`)), before);
  assert.deepEqual((await readdir(directory)).sort(), [`${id}.json`, "unrelated-a", "unrelated-b"].sort());
  assert.equal(await store.get(id), text);
});

for (const phase of [...phases.filter((phase) => phase !== "open"), "stat"]) test(`recovery-claim ${phase} failure is cleaned without touching a dead owner's files`, async (t) => {
  const { directory } = await fixture(t);
  const lock = join(directory, ".lock");
  await mkdir(lock, { recursive: true, mode: 0o700 });
  const id = "a".repeat(32), token = "b".repeat(32), pid = 123456789;
  const contents = JSON.stringify({ format: "hugr-lean/raw-lock/1", id, token, pid });
  await writeFile(join(lock, "owner.json"), contents, { mode: 0o600 });
  await writeFile(join(lock, `${id}.tmp`), "{partial", { mode: 0o600 });
  t.mock.method(process, "kill", (candidate: number) => {
    assert.equal(candidate, pid);
    throw Object.assign(new Error("dead PID"), { code: "ESRCH" });
  });
  const failure = new Error(`claim ${phase} failure`);
  const fault = phaseFault(t, (path) => basename(path) === ".recovery", phase, failure);
  const store = new RawStore({ directory });
  await assert.rejects(store.put("rejected"), (error) => error === failure);
  assert.equal(fault.attempts(), phase === "stat" ? 2 : 1);
  assert.deepEqual(await readdir(directory), [".lock"]);
  assert.equal(await readFile(join(lock, "owner.json"), "utf8"), contents);
  assert.equal(await readFile(join(lock, `${id}.tmp`), "utf8"), "{partial");
  fault.restore();
  const next = await store.put("retry");
  assert.equal(await store.get(next), "retry");
  assert.deepEqual(await readdir(directory), [`${next}.json`]);
});

for (const failAt of [1, 2]) test(`eviction deletion failure ${failAt} retains the complete published replacement`, async (t) => {
  const { directory, advance } = await fixture(t);
  const seed = new RawStore({ directory });
  const first = await seed.put(text);
  advance();
  const second = await seed.put(text);
  const firstBytes = await readFile(join(directory, `${first}.json`));
  const store = new RawStore({ directory, evict: true, maxBytes: firstBytes.length * 2 });
  const failure = new Error("eviction deletion failure"), unlink = fs.unlink;
  let attempts = 0;
  const mock = t.mock.method(fs, "unlink", async (...args: Parameters<typeof fs.unlink>) => {
    if (String(args[0]).endsWith(".json") && !String(args[0]).endsWith("owner.json") && ++attempts === failAt) throw failure;
    return unlink(...args);
  });
  syncBuiltinESMExports();
  t.after(() => { mock.mock.restore(); syncBuiltinESMExports(); });
  await assert.rejects(store.put(text.repeat(4)), (error) => error === failure);
  assert.equal(attempts, failAt);
  mock.mock.restore(); syncBuiltinESMExports();
  const records = await store.list(), next = records.find(({ id }) => id !== first && id !== second)!;
  assert.ok(next, "the replacement is retained, never rolled back after old records can be deleted");
  assert.equal(await store.get(next.id), text.repeat(4));
  assert.equal(await store.get(first), failAt === 1 ? text : undefined);
  assert.equal(await store.get(second), text);
  assert.deepEqual((await readdir(directory)).sort(), records.map(({ id }) => `${id}.json`).sort());
  const retry = await store.put(text.repeat(4));
  assert.equal(await store.get(retry), text.repeat(4));
  assert.ok((await store.list()).reduce((sum, record) => sum + record.bytes, 0) <= firstBytes.length * 2);
});

for (const countPressure of [false, true]) for (const published of [false, true]) {
  test(`evicting process crash ${published ? "after" : "before"} publication preserves recoverable originals (${countPressure ? "count" : "byte"} pressure)`, { timeout: 10_000 }, async (t) => {
    const { directory, advance } = await fixture(t);
    const seed = new RawStore({ directory });
    const first = await seed.put(text);
    advance();
    const second = await seed.put(text);
    const before = await Promise.all([first, second].map((id) => readFile(join(directory, `${id}.json`))));
    if (countPressure) await writeFile(join(directory, "unrelated"), "keep");
    const options = { directory, evict: true, ...(!countPressure ? { maxBytes: before[0]!.length * 2 } : {}) };
    const source = new URL("../src/raw/index.ts", import.meta.url).href;
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
      import fs from "node:fs/promises";
      import { basename } from "node:path";
      import { RawStore } from ${JSON.stringify(source)};
      Date.now = () => ${epoch + 2};
      const link = fs.link;
      fs.link = async (source, target) => {
        if (${published}) await link(source, target);
        console.log("ready " + basename(target, ".json"));
        await new Promise(() => setInterval(() => {}, 1000));
      };
      const store = new RawStore(${JSON.stringify(options)});
      if (${countPressure}) Object.assign(store, { scanLimit: 5 });
      await store.put(${JSON.stringify(text.repeat(4))});
    `], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (data) => { stderr += data; });
    const exited = new Promise<void>((resolve) => child.once("close", () => resolve()));
    t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await exited; });
    const next = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`crash worker readiness timeout: ${stderr}`)), 5_000);
      let output = "";
      child.stdout.on("data", (data) => {
        output += data;
        if (output.startsWith("ready ") && output.includes("\n")) { clearTimeout(timer); resolve(output.slice(6).trim()); }
      });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("close", () => { clearTimeout(timer); reject(new Error(`crash worker exited before readiness: ${stderr}`)); });
    });
    assert.deepEqual(await Promise.all([first, second].map((id) => readFile(join(directory, `${id}.json`)))), before);
    const contender = new RawStore(options);
    Object.assign(contender, { lockMs: 30, ...(countPressure ? { scanLimit: 5 } : {}) });
    await assert.rejects(contender.list(), /lock timeout/);
    assert.ok(child.kill("SIGKILL"));
    await exited;
    assert.throws(() => process.kill(child.pid!, 0), { code: "ESRCH" });
    assert.equal(await contender.get(next), published ? text.repeat(4) : undefined);
    assert.equal(await contender.get(first), text);
    assert.equal(await contender.get(second), text);
    assert.equal((await contender.list()).length, published ? 3 : 2, "crash residue must remain scannable");
    const ids = [first, second, ...(published ? [next] : [])];
    assert.deepEqual((await readdir(directory)).sort(), [...ids.map((id) => `${id}.json`), ...(countPressure ? ["unrelated"] : [])].sort());
    if (countPressure && published) {
      await assert.rejects(contender.put("no physical slot"), /record capacity is full/);
      assert.equal((await contender.list()).length, 3);
    } else {
      const retry = await contender.put(text.repeat(4));
      assert.equal(await contender.get(retry), text.repeat(4));
    }
  });
}

test("owner cleanup preserves metadata when its inode cannot be established", async (t) => {
  const { directory } = await fixture(t);
  const failure = new Error("persistent fstat failure");
  let attempts = 0;
  openFault(t, (path) => basename(path) === "owner.json", async (_path, handle) => {
    if (!handle) return undefined;
    return new Proxy(handle, { get(target, key) {
      if (key === "stat") return async () => { attempts++; throw failure; };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
  });
  await assert.rejects(new RawStore({ directory }).put("rejected"), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors[0].errors[0], failure);
    assert.match(String(error.errors[0].errors[1]), /ownership cannot be verified/);
    return true;
  });
  assert.equal(attempts, 2, "identity recovery is bounded");
  assert.deepEqual(await readdir(directory), [".lock"]);
  assert.deepEqual(await readdir(join(directory, ".lock")), ["owner.json"]);
});

test("owner cleanup refuses a swapped lock directory", async (t) => {
  const { directory, parent } = await fixture(t);
  const backup = join(parent, "original-lock"), failure = new Error("lock replaced during initialization");
  openFault(t, (path) => basename(path) === "owner.json", async (_path, handle) => {
    if (!handle) return undefined;
    return new Proxy(handle, { get(target, key) {
      if (key === "writeFile") return async () => {
        await rename(join(directory, ".lock"), backup);
        await mkdir(join(directory, ".lock"), { mode: 0o700 });
        await writeFile(join(directory, ".lock", "sentinel"), "keep");
        throw failure;
      };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
  });
  await assert.rejects(new RawStore({ directory }).put("rejected"), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors[0].errors[0], failure);
    assert.match(String(error.errors[1]), /lock changed/);
    return true;
  });
  assert.deepEqual(await readdir(backup), ["owner.json"]);
  assert.deepEqual(await readdir(join(directory, ".lock")), ["sentinel"]);
  assert.equal(await readFile(join(directory, ".lock", "sentinel"), "utf8"), "keep");
});

test("publication collision never overwrites its target or evicts earlier originals", async (t) => {
  const { directory } = await fixture(t);
  const seed = new RawStore({ directory });
  const id = await seed.put(text), before = await readFile(join(directory, `${id}.json`));
  const store = new RawStore({ directory, evict: true, maxBytes: before.length });
  const link = fs.link;
  let collided = "";
  t.mock.method(fs, "link", async (...args: Parameters<typeof fs.link>) => {
    collided = String(args[1]);
    await writeFile(collided, "unrelated collision bytes", { mode: 0o600 });
    return link(...args);
  });
  await assert.rejects(store.put(text), { code: "EEXIST" });
  assert.deepEqual(await readFile(join(directory, `${id}.json`)), before);
  assert.equal(await readFile(collided, "utf8"), "unrelated collision bytes");
  assert.deepEqual((await readdir(directory)).sort(), [`${id}.json`, basename(collided)].sort());
});
