import assert from "node:assert/strict";
import fs from "node:fs/promises";
import type { PathLike, StatOptions } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
// @ts-expect-error Developer-only script, no published declarations.
import { readArtifactInventory } from "../scripts/utility-corpus.mjs";

async function twoFiles(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hugr-identity-"));
  try {
    await fs.writeFile(path.join(root, "first.log"), "first 🦀\r\n");
    await fs.writeFile(path.join(root, "second.log"), "second\n");
    return await fs.realpath(root);
  } catch (error) { await fs.rm(root, { recursive: true, force: true }); throw error; }
}
const expected = [["first.log", Buffer.from("first 🦀\r\n")], ["second.log", Buffer.from("second\n")]];

test("artifact identities preserve distinct 64-bit integers and still reject aliases", async (t) => {
  const root = await twoFiles(), original = fs.lstat;
  const low = 9007199254740992n, high = low + 1n;
  assert.notEqual(low, high); assert.equal(Number(low), Number(high), "measured Number collision");
  let duplicate = false, links = 1n;
  const calls: { bigint: unknown; dev: string; ino: string; nlink: string }[] = [];
  const seam = t.mock.method(fs, "lstat", async (file: PathLike, options?: StatOptions) => {
    const stat = await original(file, options);
    if (path.dirname(String(file)) !== root || !stat.isFile()) return stat;
    const bigint = options?.bigint, ino = duplicate || path.basename(String(file)) === "first.log" ? low : high;
    const identity = bigint ? { dev: 42n, ino, nlink: links } : { dev: 42, ino: Number(ino), nlink: Number(links) };
    calls.push({ bigint, dev: typeof identity.dev, ino: typeof identity.ino, nlink: typeof identity.nlink });
    return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, identity);
  });
  syncBuiltinESMExports();
  try {
    assert.deepEqual([...(await readArtifactInventory(root))], expected, "distinct real files must survive");
    assert.equal(calls.length, 2, "both real file stats must reach seam");
    assert.ok(calls.every(call => call.bigint === true && call.dev === "bigint" && call.ino === "bigint" && call.nlink === "bigint"));
    duplicate = true;
    await assert.rejects(readArtifactInventory(root), /FILE_ALIAS: second\.log/);
    duplicate = false; links = 2n;
    await assert.rejects(readArtifactInventory(root), /FILE_ALIAS: first\.log/);
  } finally {
    seam.mock.restore(); syncBuiltinESMExports();
    try { assert.ok(calls.length > 0, "stat seam actually engaged"); }
    finally { await fs.rm(root, { recursive: true, force: true }); }
  }
});

test("native Number/BigInt stat diagnostics and real hardlink/symlink rejection", async (t) => {
  const root = await twoFiles();
  try {
    for (const name of ["first.log", "second.log"]) {
      const file = path.join(root, name), number = await fs.lstat(file), bigint = await fs.lstat(file, { bigint: true });
      assert.ok(bigint.isFile()); assert.equal(bigint.nlink, 1n);
      for (const key of ["dev", "ino", "nlink"] as const) {
        assert.equal(typeof number[key], "number"); assert.equal(typeof bigint[key], "bigint");
      }
      t.diagnostic(JSON.stringify({ platform: process.platform, file: name,
        number: { dev: number.dev, ino: number.ino, nlink: number.nlink },
        bigint: { dev: String(bigint.dev), ino: String(bigint.ino), nlink: String(bigint.nlink) } }));
    }
    assert.deepEqual([...(await readArtifactInventory(root))], expected);
    const alias = path.join(root, "alias");
    await fs.link(path.join(root, "first.log"), alias);
    assert.equal((await fs.lstat(alias, { bigint: true })).nlink, 2n);
    await assert.rejects(readArtifactInventory(root), /FILE_ALIAS:/);
    await fs.unlink(alias);
    // Directory junction is a real symlink on Windows without file-symlink privileges.
    await fs.symlink(root, alias, "junction");
    assert.equal((await fs.lstat(alias)).isSymbolicLink(), true);
    await assert.rejects(readArtifactInventory(root), /SYMLINK: alias/);
    await fs.unlink(alias);
    assert.deepEqual([...(await readArtifactInventory(root))], expected, "native restoration control");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
