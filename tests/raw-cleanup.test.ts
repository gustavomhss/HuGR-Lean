import assert from "node:assert/strict";
import fs, { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { RawStore } from "../src/raw/index.js";

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "hugr-lean-raw-cleanup-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new RawStore({ directory, evict: true });
  const text = "keep original\r\n🔥\ud800";
  const id = await store.put(text), bytes = await readFile(join(directory, `${id}.json`));
  Object.assign(store, { maxBytes: bytes.length, lockMs: 30 });
  return { directory, store, text, id, bytes };
}

function errors(error: unknown): unknown[] {
  return error instanceof AggregateError ? error.errors.flatMap(errors) : [error];
}

for (const published of [false, true]) for (const persistent of [false, true]) {
  test(`${persistent ? "persistent" : "transient"} temporary-unlink failure ${published ? "after" : "before"} publication preserves ownership and errors`, async (t) => {
    const { directory, store, text, id, bytes } = await fixture(t);
    const unlinkFailure = new Error("temporary unlink failed"), linkFailure = new Error("publication failed");
    const unlink = fs.unlink;
    let attempts = 0;
    const unlinkMock = t.mock.method(fs, "unlink", async (...args: Parameters<typeof fs.unlink>) => {
      if (String(args[0]).endsWith(".tmp") && ++attempts >= 1 && (persistent || attempts === 1)) throw unlinkFailure;
      return unlink(...args);
    });
    const linkMock = published ? undefined : t.mock.method(fs, "link", async () => { throw linkFailure; });
    syncBuiltinESMExports();
    const restore = () => { unlinkMock.mock.restore(); linkMock?.mock.restore(); syncBuiltinESMExports(); };
    t.after(restore);
    await assert.rejects(store.put(text), (error) => {
      assert.ok(errors(error).includes(unlinkFailure), "cleanup error remains visible");
      if (!published) assert.ok(errors(error).includes(linkFailure), "cleanup must not mask the publication failure");
      return true;
    });
    assert.equal(attempts, 2, "release retries only its validated temporary once");
    assert.deepEqual(await readFile(join(directory, `${id}.json`)), bytes);
    restore();
    if (persistent) {
      const owner = JSON.parse(await readFile(join(directory, ".lock", "owner.json"), "utf8"));
      assert.equal(owner.pid, process.pid);
      assert.equal(owner.format, "hugr-lean/raw-lock/1");
      assert.deepEqual((await readdir(join(directory, ".lock"))).sort(), [`${owner.id}.tmp`, "owner.json"].sort());
      await assert.rejects(store.get(id), /lock timeout/, "even now-cleanable state cannot be stolen from a live PID");
      t.mock.method(process, "kill", (pid: number) => {
        assert.equal(pid, process.pid);
        throw Object.assign(new Error("dead owner control"), { code: "ESRCH" });
      });
    }
    assert.equal(await store.get(id), text);
    assert.equal((await store.list()).length, published ? 2 : 1);
    assert.ok(!(await readdir(directory)).includes(".lock"));
    const next = await store.put(text);
    assert.equal(await store.get(next), text);
    assert.deepEqual((await store.list()).map(({ id }) => id), [next]);
  });
}
