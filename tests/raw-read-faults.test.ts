import assert from "node:assert/strict";
import fs, { mkdtemp, readFile, readdir, rm, type FileHandle } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { RawStore } from "../src/raw/index.js";

async function fixture(t: TestContext, temporaryRoot = tmpdir()) {
  // RawStore resolves parent aliases, including macOS /var -> /private/var.
  const directory = await fs.realpath(await mkdtemp(join(temporaryRoot, "hugr-lean-raw-read-faults-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const text = "exact original\r\n🔥\ud800", id = await new RawStore({ directory }).put(text);
  const path = join(directory, `${id}.json`), bytes = await readFile(path);
  return { directory, text, id, path, bytes };
}

function recordFault(t: TestContext, path: string, options: {
  read?: () => Promise<Buffer>; stat?: () => Promise<never>; close?: Error;
}) {
  const original = fs.open;
  let reads = 0, closes = 0;
  const mock = t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    const handle = await original(...args);
    if (String(args[0]) !== path) return handle;
    return new Proxy(handle, { get(target, key) {
      if (key === "stat" && options.stat) return options.stat;
      if (key === "readFile") return async () => { reads++; return options.read ? options.read() : target.readFile(); };
      if (key === "close") return async () => {
        closes++;
        await target.close(); // Close the real handle even when injecting a close error.
        if (options.close) throw options.close;
      };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } }) as FileHandle;
  });
  syncBuiltinESMExports();
  const restore = () => { mock.mock.restore(); syncBuiltinESMExports(); };
  t.after(restore);
  return { restore, reads: () => reads, closes: () => closes };
}

test("record and lock-cleanup fault injection survives a symlinked temporary parent", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "hugr-lean-read-alias-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const target = join(parent, "target"), alias = join(parent, "alias");
  await fs.mkdir(target);
  await fs.symlink(target, alias, process.platform === "win32" ? "junction" : "dir");
  const { directory, id, path, bytes } = await fixture(t, alias);
  assert.notEqual(alias, await fs.realpath(alias), "control must exercise a real parent alias");
  const primary = new Error("aliased record read failed"), close = new Error("aliased record close failed");
  const release = new Error("aliased owner unlink failed");
  const fault = recordFault(t, path, { read: async () => { throw primary; }, close });
  const unlink = fs.unlink;
  let releases = 0;
  const mock = t.mock.method(fs, "unlink", async (...args: Parameters<typeof fs.unlink>) => {
    if (String(args[0]) === join(directory, ".lock", "owner.json")) { releases++; throw release; }
    return unlink(...args);
  });
  syncBuiltinESMExports();
  t.after(() => { mock.mock.restore(); syncBuiltinESMExports(); });
  await assert.rejects(new RawStore({ directory }).get(id), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors[1], release);
    assert.ok(error.errors[0] instanceof AggregateError);
    assert.deepEqual(error.errors[0].errors, [primary, close]);
    return true;
  });
  assert.equal(fault.reads(), 1);
  assert.equal(fault.closes(), 1);
  assert.equal(releases, 1, "the canonical owner path must reach the cleanup fault");
  assert.deepEqual(await readFile(path), bytes);
  assert.deepEqual(await readdir(join(directory, ".lock")), ["owner.json"]);
});

for (const action of ["get", "list", "purge", "put"] as const) {
  test(`${action} retains both record-read and close errors without changing stored evidence`, async (t) => {
    const { directory, text, id, path, bytes } = await fixture(t);
    const readFailure = new Error("record read failed"), closeFailure = new Error("record close failed");
    const fault = recordFault(t, path, { read: async () => { throw readFailure; }, close: closeFailure });
    const store = new RawStore({ directory });
    const operation = () => action === "get" ? store.get(id) : action === "put" ? store.put("new record") : store[action]();
    await assert.rejects(operation(), (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.message, "Raw read and close failed");
      assert.deepEqual(error.errors, [readFailure, closeFailure]);
      return true;
    });
    assert.equal(fault.reads(), 1);
    assert.equal(fault.closes(), 1, "the handle is closed exactly once");
    assert.deepEqual(await readFile(path), bytes);
    assert.deepEqual(await readdir(directory), [`${id}.json`], "failed reads release their lock and publish/delete nothing");
    fault.restore();
    assert.equal(await store.get(id), text);
    const next = await store.put("retry");
    assert.equal(await store.get(next), "retry");
  });
}

for (const failure of ["read", "close"] as const) {
  test(`a lone record ${failure} failure keeps its original error identity`, async (t) => {
    const { directory, id, path, bytes } = await fixture(t), problem = new Error(`${failure} failed`);
    const fault = recordFault(t, path, failure === "read" ? { read: async () => { throw problem; } } : { close: problem });
    await assert.rejects(new RawStore({ directory }).get(id), (error) => error === problem);
    assert.equal(fault.reads(), 1);
    assert.equal(fault.closes(), 1);
    assert.deepEqual(await readFile(path), bytes);
    assert.deepEqual(await readdir(directory), [`${id}.json`]);
  });
}

for (const phase of ["stat", "utf8", "json", "schema"] as const) {
  test(`record ${phase} validation and close failures both survive`, async (t) => {
    const { directory, id, path, bytes } = await fixture(t);
    const primary = new Error("record stat failed"), cleanup = new Error("record close failed");
    const fault = recordFault(t, path, {
      close: cleanup,
      ...(phase === "stat" ? { stat: async () => { throw primary; } } : {
        read: async () => phase === "utf8" ? Buffer.from([0xff]) : Buffer.from(phase === "json" ? "{invalid" : "{}"),
      }),
    });
    await assert.rejects(new RawStore({ directory }).get(id), (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, 2);
      assert.equal(error.errors[1], cleanup);
      if (phase === "stat") assert.equal(error.errors[0], primary);
      else if (phase === "utf8") assert.ok(error.errors[0] instanceof TypeError);
      else if (phase === "json") assert.ok(error.errors[0] instanceof SyntaxError);
      else assert.match(error.errors[0].message, /Invalid raw record/);
      return true;
    });
    assert.equal(fault.closes(), 1);
    assert.equal(fault.reads(), phase === "stat" ? 0 : 1);
    assert.deepEqual(await readFile(path), bytes);
    assert.deepEqual(await readdir(directory), [`${id}.json`]);
  });
}

test("outer lock cleanup cannot hide either record-read failure", async (t) => {
  const { directory, id, path, bytes } = await fixture(t);
  const primary = new Error("record read failed"), close = new Error("record close failed"), release = new Error("owner unlink failed");
  const fault = recordFault(t, path, { read: async () => { throw primary; }, close });
  const unlink = fs.unlink;
  const mock = t.mock.method(fs, "unlink", async (...args: Parameters<typeof fs.unlink>) => {
    if (String(args[0]) === join(directory, ".lock", "owner.json")) throw release;
    return unlink(...args);
  });
  syncBuiltinESMExports();
  t.after(() => { mock.mock.restore(); syncBuiltinESMExports(); });
  await assert.rejects(new RawStore({ directory }).get(id), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.message, "Raw operation and lock cleanup failed");
    assert.equal(error.errors[1], release);
    assert.ok(error.errors[0] instanceof AggregateError);
    assert.deepEqual(error.errors[0].errors, [primary, close]);
    return true;
  });
  assert.equal(fault.closes(), 1);
  assert.deepEqual(await readFile(path), bytes);
  assert.deepEqual(await readdir(join(directory, ".lock")), ["owner.json"]);
});
