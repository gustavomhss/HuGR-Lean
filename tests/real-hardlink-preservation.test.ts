import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const { edits } = await import(new URL("../scripts/real-world/workloads.mjs", import.meta.url).href);
const original = Buffer.from([0, 255, 128, ...Buffer.from("upstream 🦣\r\n")]);

async function tree(action: (root: string, outside: string) => Promise<void>): Promise<void> {
  const base = await fs.mkdtemp(path.join(tmpdir(), "hugr-hardlink-preservation-"));
  const root = path.join(base, "project"), outside = path.join(base, "foreign");
  await fs.mkdir(root); await fs.mkdir(outside);
  try { await action(await fs.realpath(root), await fs.realpath(outside)); }
  finally { await fs.rm(base, { recursive: true, force: true }); }
}

test("single-link binary append still prepares and restores exact bytes", async () => {
  await tree(async (root) => {
    const file = path.join(root, "source");
    await fs.writeFile(file, original);
    assert.equal((await fs.stat(file)).nlink, 1);
    const transaction = edits(root, [{ path: "source", append: true, text: "CONTROL 🦣\n" }]);
    await transaction.prepare();
    assert.deepEqual(await fs.readFile(file), Buffer.concat([original, Buffer.from("CONTROL 🦣\n")]));
    await transaction.restore();
    assert.deepEqual(await fs.readFile(file), original);
  });
});

test("append rejects pre-existing outside hardlink without modifying either name", async () => {
  await tree(async (root, outside) => {
    const file = path.join(root, "source"), alias = path.join(outside, "source");
    await fs.writeFile(file, original); await fs.link(file, alias);
    assert.equal((await fs.stat(file)).nlink, 2, "HARDLINK_CONTROL_NOT_EXERCISED");
    const transaction = edits(root, [{ path: "source", append: true, text: "WRONG\n" }]);
    await assert.rejects(transaction.prepare(), /CASE_APPEND_LINKED/);
    await transaction.restore();
    assert.deepEqual(await fs.readFile(file), original);
    assert.deepEqual(await fs.readFile(alias), original);
  });
});

test("link added between preflight and open is rejected before append writes", async (t) => {
  await tree(async (root, outside) => {
    const file = path.join(root, "source"), alias = path.join(outside, "source"), open = fs.open;
    await fs.writeFile(file, original);
    let injected = false;
    t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
      if (args[0] === file && !injected) { injected = true; await fs.link(file, alias); }
      return open(...args);
    });
    try {
      const transaction = edits(root, [{ path: "source", append: true, text: "WRONG\n" }]);
      await assert.rejects(transaction.prepare(), /CASE_PREPARE_FOREIGN/);
      assert.equal(injected, true, "OPEN_RACE_CONTROL_NOT_EXERCISED");
      assert.equal((await fs.stat(file)).nlink, 2);
      await transaction.restore();
      assert.deepEqual(await fs.readFile(file), original);
      assert.deepEqual(await fs.readFile(alias), original);
    } finally { t.mock.restoreAll(); }
  });
});

test("restore refuses a link added after prepare and retains both append and new-file bytes", async () => {
  await tree(async (root, outside) => {
    for (const append of [false, true]) {
      const name = `source-${append}`, file = path.join(root, name), alias = path.join(outside, name);
      if (append) await fs.writeFile(file, original);
      const transaction = edits(root, [{ path: name, append, text: "OWNED\n" }]);
      await transaction.prepare();
      const expected = await fs.readFile(file);
      await fs.link(file, alias);
      assert.equal((await fs.stat(file)).nlink, 2);
      await assert.rejects(transaction.restore(), /CASE_RESTORE_FOREIGN/);
      assert.deepEqual(await fs.readFile(file), expected);
      assert.deepEqual(await fs.readFile(alias), expected);
      await fs.unlink(alias);
      await transaction.restore();
      if (append) assert.deepEqual(await fs.readFile(file), original);
      else await assert.rejects(fs.readFile(file), { code: "ENOENT" });
    }
  });
});
