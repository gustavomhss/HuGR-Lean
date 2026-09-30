import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess, runScenario, isolatedEnvironment } from "./opencode-boundary.mjs";
import { RawStore } from "../dist/raw/index.js";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const temporary = await mkdtemp(path.join(tmpdir(), "hugr-host-raw-"));
let offRoot;
try {
  const directory = path.join(temporary, "raw");
  const summary = "test result: ok. 80 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s";
  const original = `    Finished \`test\` profile [unoptimized + debuginfo] target(s) in 0.01s\n     Running unittests src/café.rs (target/debug/deps/raw-0000)\n\nrunning 80 tests\n${Array.from({ length: 80 }, (_, i) => `test case_${i} ... ok\n`).join("")}\n${summary}\n\n`;
  const setup = async ({ cwd, env }) => {
    const bin = path.join(cwd, "bin"); await mkdir(bin);
    const cargo = path.join(bin, "cargo");
    await writeFile(cargo, `#!/bin/sh\nprintf '%s' '${original}'\nsleep 0.05\n`);
    await chmod(cargo, 0o755); env.PATH = `${bin}${path.delimiter}${env.PATH}`;
  };
  const options = { plugin: path.join(root, "dist/index.js"), command: "cargo test", setup };
  const off = await runScenario({ ...options, keep: true, setup: async (context) => { offRoot = context.root; await setup(context); }, pluginOptions: { raw: false } });
  assert.ok(Buffer.byteLength(off.modelResult.content) < Buffer.byteLength(original));
  await assert.rejects(stat(directory), { code: "ENOENT" });
  await assert.rejects(stat(path.join(offRoot, "home", ".cache", "hugr-lean", "raw")), { code: "ENOENT" });
  const on = await runScenario({ ...options, keep: false, pluginOptions: { raw: { directory, ttlMs: 3600000 } } });
  assert.equal(on.modelResult.content, off.modelResult.content, "Raw retention changed model-visible text");
  assert.ok(on.modelResult.content.includes(summary));
  assert.equal(on.tool.state.metadata.exit, 0); assert.equal(on.tool.state.metadata.truncated, false);
  const store = new RawStore({ directory });
  const entries = await store.list(); assert.equal(entries.length, 1, "Host did not persist one material raw record");
  const id = entries[0].id; assert.equal(await store.get(id), original, "Host raw capture/recovery differs");
  const recovered = await runProcess(process.execPath, [path.join(root, "dist/cli/index.js"), "raw", "get", id, "--directory", directory], { cwd: temporary, env: isolatedEnvironment(temporary), timeout: 10000 });
  assert.equal(recovered.code, 0, recovered.stderr); assert.equal(recovered.stdout, original);
  console.log(JSON.stringify({ status: "proved", hostRawOff: true, hostRawOn: true, cliExactRecovery: true, inputBytes: Buffer.byteLength(original), outputBytes: Buffer.byteLength(on.modelResult.content), records: entries.length }));
} finally {
  if (offRoot) await rm(offRoot, { recursive: true, force: true });
  await rm(temporary, { recursive: true, force: true });
}
