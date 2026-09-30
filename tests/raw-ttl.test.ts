import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { RawStore } from "../src/raw/index.js";

const epoch = 1_700_000_000_000;

async function fixture(t: TestContext) {
  const parent = await mkdtemp(join(tmpdir(), "hugr-lean-raw-ttl-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  let now = epoch;
  t.mock.method(Date, "now", () => now);
  return { directory: join(parent, "raw"), advance: (ms: number) => { now += ms; } };
}

for (const scenario of [
  { label: "longer-TTL reader", writerTtl: 1_000, readerOptions: { ttlMs: 10_000 } },
  { label: "default CLI-like reader", writerTtl: 1_000, readerOptions: {} },
  { label: "shorter-TTL reader", writerTtl: 10_000, readerOptions: { ttlMs: 1_000 } },
]) test(`${scenario.label}: get/list/put expire at the earlier deadline`, async (t) => {
  for (const action of ["get", "list", "put"]) await t.test(action, async (t) => {
    const time = await fixture(t);
    const text = "deadline\r\n🔥\ud800";
    const writer = new RawStore({ directory: time.directory, ttlMs: scenario.writerTtl });
    const id = await writer.put(text);
    const path = join(time.directory, `${id}.json`);
    const before = await readFile(path);
    const reader = new RawStore({ directory: time.directory, maxBytes: before.length, ...scenario.readerOptions });
    time.advance(999);
    assert.equal(await reader.get(id), text);
    assert.deepEqual((await reader.list()).map((entry) => entry.id), [id]);
    assert.deepEqual(await readFile(path), before, "reads must preserve the writer's deadline");
    time.advance(1);
    assert.deepEqual(await readdir(time.directory), [`${id}.json`], "expiry remains lazy");
    if (action === "get") assert.equal(await reader.get(id), undefined);
    else if (action === "list") assert.deepEqual(await reader.list(), []);
    else {
      const next = await reader.put(text); // One-record cap forces cleanup to reclaim the expired bytes.
      assert.equal(await reader.get(next), text);
      assert.deepEqual(await readdir(time.directory), [`${next}.json`]);
      return;
    }
    assert.deepEqual(await readdir(time.directory), []);
  });
});

test("invalid expiry is corruption; get/list/put/purge preserve every record", async (t) => {
  const { directory } = await fixture(t);
  const store = new RawStore({ directory });
  const good = await store.put("keep\r\n\ud800");
  const bad = await store.put("bad");
  const goodPath = join(directory, `${good}.json`), badPath = join(directory, `${bad}.json`);
  const before = await readFile(goodPath);
  const record = JSON.parse(await readFile(badPath, "utf8"));
  for (const expiresAt of [undefined, null, true, String(epoch + 1), -1, epoch - 1, epoch, epoch + 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    const corrupt = JSON.stringify({ ...record, expiresAt });
    await writeFile(badPath, corrupt);
    for (const operation of [() => store.get(bad), () => store.list(), () => store.put("new"), () => store.purge()]) {
      await assert.rejects(operation(), /Invalid raw record/);
    }
    assert.equal(await readFile(badPath, "utf8"), corrupt);
    assert.deepEqual(await readFile(goodPath), before);
    assert.equal(await store.get(good), "keep\r\n\ud800");
    assert.deepEqual((await readdir(directory)).sort(), [`${good}.json`, `${bad}.json`].sort());
  }
});

test("writer rejects expiry overflow before cleanup; maximum safe deadline remains valid", async (t) => {
  const { directory } = await fixture(t);
  const store = new RawStore({ directory });
  const id = await store.put("keep");
  const path = join(directory, `${id}.json`);
  const before = await readFile(path);
  const ttlMs = Number.MAX_SAFE_INTEGER - epoch;
  await assert.rejects(new RawStore({ directory, ttlMs: ttlMs + 1 }).put("overflow"), {
    name: "RangeError", message: "Raw expiry time overflow",
  });
  assert.deepEqual(await readFile(path), before);
  assert.deepEqual(await readdir(directory), [`${id}.json`]);
  assert.equal(await store.get(id), "keep");
  const maximum = new RawStore({ directory, ttlMs });
  const safe = await maximum.put("safe");
  assert.equal(JSON.parse(await readFile(join(directory, `${safe}.json`), "utf8")).expiresAt, Number.MAX_SAFE_INTEGER);
  assert.equal(await maximum.get(safe), "safe");
});

test("serialized byte cap includes the persisted expiry deadline", async (t) => {
  const { directory } = await fixture(t);
  const text = "🔥\r\n\ud800", ttlMs = 1_000;
  const fields = { format: "hugr-lean/raw/2", id: "0".repeat(32), createdAt: epoch, text };
  const withoutDeadline = Buffer.byteLength(JSON.stringify(fields), "utf8");
  const bytes = Buffer.byteLength(JSON.stringify({ ...fields, expiresAt: epoch + ttlMs }), "utf8");
  assert.ok(bytes > withoutDeadline);
  for (const maxBytes of [withoutDeadline, bytes - 1]) {
    await assert.rejects(new RawStore({ directory, ttlMs, maxBytes }).put(text), /exceeds maxBytes/);
    assert.deepEqual(await readdir(directory), []);
  }
  const store = new RawStore({ directory, ttlMs, maxBytes: bytes });
  const id = await store.put(text);
  const disk = await readFile(join(directory, `${id}.json`));
  const record = JSON.parse(disk.toString("utf8"));
  assert.deepEqual(Object.keys(record).sort(), ["createdAt", "expiresAt", "format", "id", "text"]);
  assert.equal(record.format, "hugr-lean/raw/2");
  assert.equal(record.expiresAt, epoch + ttlMs);
  assert.equal(disk.length, bytes);
  assert.deepEqual(await store.list(), [{ id, createdAt: epoch, bytes }]);
  assert.equal(await store.get(id), text);
});
