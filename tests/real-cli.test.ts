import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scripts = fileURLToPath(new URL("../scripts/real-world/", import.meta.url));
for (const name of ["run", "analyze", "replay"]) {
  test(`${name} CLI executes through an OS-resolved directory alias`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lean-cli-alias-"));
    try {
      const alias = path.join(root, "alias");
      await symlink(scripts, alias, process.platform === "win32" ? "junction" : "dir");
      const args = name === "run" ? [] : [path.join(root, "missing-corpus")];
      for (const directory of [scripts, alias]) {
        const result = spawnSync(process.execPath, [path.join(directory, `${name}.mjs`), ...args], { encoding: "utf8", timeout: 20000 });
        assert.equal(result.error, undefined); assert.equal(result.status, 1);
        assert.match(result.stderr, name === "run" ? /Usage: node scripts\/real-world\/run.mjs NEW_OUTPUT_DIR/ : /ENOENT.*report\.json/);
        assert.equal(result.stdout, "");
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
