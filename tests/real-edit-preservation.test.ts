import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const { edits } = await import(new URL("../scripts/real-world/workloads.mjs", import.meta.url).href);
const original = Buffer.from([0, 255, 128, ...Buffer.from("upstream 🦣\r\n")]);

async function tree(action: (root: string, outside: string) => Promise<void>): Promise<void> {
  const base = await fs.mkdtemp(path.join(tmpdir(), "hugr-edit-preservation-"));
  const root = path.join(base, "project"), outside = path.join(base, "foreign");
  await fs.mkdir(root);
  await fs.mkdir(outside);
  try { await action(await fs.realpath(root), await fs.realpath(outside)); }
  finally { await fs.rm(base, { recursive: true, force: true }); }
}

test("new edits preserve dangling symlinks, existing files and directories", async () => {
  await tree(async (root) => {
    await fs.symlink("missing-target", path.join(root, "dangling"));
    await fs.writeFile(path.join(root, "existing"), original);
    await fs.mkdir(path.join(root, "directory"));
    for (const name of ["dangling", "existing", "directory"]) {
      const transaction = edits(root, [{ path: name, text: "CONTROL\n" }]);
      await assert.rejects(transaction.prepare(), /CASE_WOULD_OVERWRITE/);
      await transaction.restore();
    }
    assert.equal(await fs.readlink(path.join(root, "dangling")), "missing-target");
    assert.deepEqual(await fs.readFile(path.join(root, "existing")), original);
    assert.equal((await fs.lstat(path.join(root, "directory"))).isDirectory(), true);
    await assert.rejects(fs.readFile(path.join(root, "missing-target")), { code: "ENOENT" });
  });
});

test("edit paths reject absolute/traversal paths and canonical parents escaping project", async () => {
  await tree(async (root, outside) => {
    await fs.symlink(outside, path.join(root, "escape"), "dir");
    for (const relative of [path.join(outside, "absolute"), "../foreign/traversal", "escape/new-file"]) {
      await assert.rejects(edits(root, [{ path: relative, text: "CONTROL\n" }]).prepare(), /CASE_PATH_OUTSIDE/);
    }
    await fs.writeFile(path.join(outside, "existing"), original);
    await assert.rejects(edits(root, [{ path: "escape/existing", append: true, text: "CONTROL\n" }]).prepare(), /CASE_PATH_OUTSIDE/);
    assert.deepEqual(await fs.readdir(outside), ["existing"]);
    assert.deepEqual(await fs.readFile(path.join(outside, "existing")), original);
  });
});

test("append requires regular leaf and restores binary bytes through canonical root alias", async () => {
  await tree(async (root, outside) => {
    await fs.writeFile(path.join(root, "regular"), original);
    await fs.symlink("regular", path.join(root, "link"));
    await fs.mkdir(path.join(root, "directory"));
    for (const name of ["link", "directory"]) {
      await assert.rejects(edits(root, [{ path: name, append: true, text: "WRONG" }]).prepare(), /CASE_APPEND_NOT_REGULAR/);
    }
    await fs.symlink(root, path.join(outside, "alias"), "dir");
    const transaction = edits(path.join(outside, "alias"), [{ path: "regular", append: true, text: "CONTROL 🦣\n" }]);
    await transaction.prepare();
    assert.deepEqual(await fs.readFile(path.join(root, "regular")), Buffer.concat([original, Buffer.from("CONTROL 🦣\n")]));
    await assert.rejects(transaction.prepare(), /CASE_ALREADY_PREPARED/);
    await transaction.restore();
    await transaction.restore();
    assert.deepEqual(await fs.readFile(path.join(root, "regular")), original);
    assert.equal(await fs.readlink(path.join(root, "link")), "regular");
  });
});

test("exclusive-create race retains foreign leaf and rolls back only owned earlier edits", async (t) => {
  await tree(async (root) => {
    const file = path.join(root, "raced"), foreign = Buffer.from("FOREIGN_CREATE\n");
    await fs.writeFile(path.join(root, "original"), original);
    const open = fs.open;
    let injected = false;
    t.mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
      if (args[0] === file && !injected) {
        injected = true;
        await fs.writeFile(file, foreign);
      }
      return open(...args);
    });
    try {
      const transaction = edits(root, [
        { path: "original", append: true, text: "OWNED_APPEND\n" },
        { path: "owned", text: "OWNED_CREATE\n" }, { path: "raced", text: "WRONG\n" },
      ]);
      await assert.rejects(transaction.prepare(), { code: "EEXIST" });
      assert.equal(injected, true, "Race injection must engage actual exclusive open");
      await transaction.restore();
      assert.deepEqual(await fs.readFile(file), foreign);
      assert.deepEqual(await fs.readFile(path.join(root, "original")), original);
      await assert.rejects(fs.readFile(path.join(root, "owned")), { code: "ENOENT" });
    } finally { t.mock.restoreAll(); }
  });
});

test("restoration refuses foreign same-byte replacement and foreign content without touching either", async () => {
  await tree(async (root) => {
    for (const append of [false, true]) for (const replacement of [false, true]) {
      const name = `foreign-${append}-${replacement}`, file = path.join(root, name);
      if (append) await fs.writeFile(file, original);
      const transaction = edits(root, [{ path: name, append, text: "OWNED\n" }]);
      await transaction.prepare();
      const owned = await fs.readFile(file), foreign = replacement ? owned : Buffer.from("FOREIGN_CONTENT\n");
      if (replacement) {
        // Keep owned inode alive: filesystem cannot recycle it for this replacement.
        await fs.rename(file, `${file}.owned`);
      }
      await fs.writeFile(file, foreign);
      await assert.rejects(transaction.restore(), /CASE_RESTORE_FOREIGN/);
      assert.deepEqual(await fs.readFile(file), foreign);
      if (replacement) assert.deepEqual(await fs.readFile(`${file}.owned`), owned);
    }
  });
});

test("partial prepare failure restores owned binary append and removes owned new file", async () => {
  await tree(async (root) => {
    await fs.writeFile(path.join(root, "original"), original);
    const transaction = edits(root, [
      { path: "original", append: true, text: "OWNED\n" }, { path: "owned", text: "OWNED\n" },
      { path: "missing-parent/new", text: "FAIL\n" },
    ]);
    await assert.rejects(transaction.prepare(), { code: "ENOENT" });
    await transaction.restore();
    assert.deepEqual(await fs.readFile(path.join(root, "original")), original);
    assert.deepEqual(await fs.readdir(root), ["original"]);
  });
});
