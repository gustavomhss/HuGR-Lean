import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const hostFile = fileURLToPath(new URL("../scripts/real-world/host.mjs", import.meta.url));
const boundary = await import(new URL("../scripts/opencode-boundary.mjs", import.meta.url).href);

test("host CLI runs through direct, absolute and relative symlink entries", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "hugr-host-cli-")));
  try {
    const absolute = path.join(root, "absolute-host.mjs"), relative = path.join(root, "relative-host.mjs");
    await symlink(hostFile, absolute, "file");
    await symlink(path.relative(root, hostFile), relative, "file");
    assert.equal(await realpath(absolute), await realpath(hostFile));
    assert.equal(await realpath(relative), await realpath(hostFile));
    for (const [index, entry] of [hostFile, absolute, `.${path.sep}${path.basename(relative)}`].entries()) {
      const env = boundary.isolatedEnvironment(root, { OPENCODE_BIN: path.join(root, "missing-opencode") });
      const usage = await boundary.runProcess(process.execPath, [entry], { cwd: root, env, timeout: 10000 });
      assert.equal(usage.code, 1, `${entry} silently skipped CLI`);
      assert.equal(usage.stdout, "");
      assert.match(usage.stderr, /REAL_HOST_USAGE/);
      const outputDir = path.join(root, `output-${index}`);
      const missing = await boundary.runProcess(process.execPath, [entry, outputDir], { cwd: root, env, timeout: 10000 });
      assert.equal(missing.code, 1, `${entry} silently skipped runner`);
      assert.match(missing.stderr, /REAL_HOST_MISSING_HOST/);
      const report = JSON.parse(await readFile(path.join(outputDir, "report.json"), "utf8"));
      try {
        assert.equal(report.status, "failed");
        assert.equal(report.mode, "native");
        assert.equal(report.failure.name, "REAL_HOST_MISSING_HOST");
        assert.deepEqual(report.scenarios, []);
      } finally { await rm(report.setupRoot, { recursive: true, force: true }); }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
