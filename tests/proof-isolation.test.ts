import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const installed = await import(new URL("../scripts/package-smoke.mjs", import.meta.url).href);
const boundary = await import(new URL("../scripts/opencode-boundary.mjs", import.meta.url).href);
const directoryLink = process.platform === "win32" ? "junction" : "dir";

async function tree(action: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "hugr-isolation-teeth-"));
  try { await action(root); }
  finally { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
}

test("consumer loader delegates real Node exports/conditions and accepts builtins and canonical local files", async () => {
  await tree(async (root) => {
    const consumer = path.join(root, "consumer"), local = path.join(consumer, "node_modules/local-control");
    await mkdir(local, { recursive: true });
    await writeFile(path.join(local, "package.json"), JSON.stringify({ name: "local-control", type: "module", exports: { ".": { import: "./index.mjs", default: "./absent.mjs" } } }));
    await writeFile(path.join(local, "index.mjs"), "export default 'LOCAL_CONTROL';\n");
    await symlink(local, path.join(consumer, "internal-alias"), directoryLink);
    // Bootstrap can be addressed through a directory alias; the loader still uses the canonical root.
    const alias = path.join(root, "consumer-alias");
    await symlink(consumer, alias, directoryLink);
    const nodeArgs = await installed.consumerNodeArgs(alias);
    const execute = async (specifier: string) => await installed.isolatedProcess(process.execPath,
      [...nodeArgs, "--preserve-symlinks", "--input-type=module", "-e", 'await import(process.argv[1]); console.log("LOCAL_LOADED");', specifier],
      { cwd: alias, isolation: root, timeout: 5000 });
    for (const specifier of ["node:fs", "fs", "local-control", "./internal-alias/index.mjs", pathToFileURL(path.join(local, "index.mjs")).href]) {
      const result = await execute(specifier);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(result.stdout.trim(), "LOCAL_LOADED");
    }
    const hidden = await execute("local-control/hidden");
    assert.notEqual(hidden.code, 0);
    assert.match(hidden.stderr, /ERR_PACKAGE_PATH_NOT_EXPORTED/);
    const missing = await execute("./absent.mjs");
    assert.notEqual(missing.code, 0);
    assert.match(missing.stderr, /ERR_MODULE_NOT_FOUND/);
  });
});

test("consumer loader rejects measured ancestor, absolute, file URL and symlink escapes", async (t) => {
  await tree(async (root) => {
    const consumer = path.join(root, "consumer"), outside = path.join(root, "consumer-sibling"), ancestor = path.join(root, "node_modules/ancestor-control");
    for (const directory of [path.join(consumer, "node_modules"), outside, ancestor]) await mkdir(directory, { recursive: true });
    const file = path.join(outside, "index.mjs");
    await writeFile(file, "export default 'OUTSIDE_CONTROL';\n");
    await writeFile(path.join(ancestor, "package.json"), '{"type":"module","exports":"./index.mjs"}');
    await writeFile(path.join(ancestor, "index.mjs"), "export default 'ANCESTOR_CONTROL';\n");
    await writeFile(path.join(outside, "package.json"), '{"type":"module","exports":"./index.mjs"}');
    await symlink(outside, path.join(consumer, "node_modules/linked-control"), directoryLink);
    const nodeArgs = await installed.consumerNodeArgs(consumer);
    const execute = async (specifier: string, guarded: boolean) => await installed.isolatedProcess(process.execPath,
      [...(guarded ? nodeArgs : []), "--preserve-symlinks", "--input-type=module", "-e", 'await import(process.argv[1]); console.log("OUTSIDE_LOADED");', specifier],
      { cwd: consumer, isolation: root, timeout: 5000 });
    for (const specifier of ["ancestor-control", file, pathToFileURL(file).href + "?control#fragment", "../consumer-sibling/index.mjs", "linked-control"]) {
      await t.test(specifier, async () => {
        const control = await execute(specifier, false);
        if (process.platform === "win32" && specifier === file) {
          // Native Node rejects drive-letter URLs at load time; the guard rejects their scheme earlier.
          assert.notEqual(control.code, 0);
          assert.match(control.stderr, /ERR_UNSUPPORTED_ESM_URL_SCHEME/);
          const rejected = await execute(specifier, true);
          assert.notEqual(rejected.code, 0);
          assert.match(rejected.stderr, /Consumer module must resolve to a file or builtin:/);
          return;
        }
        assert.equal(control.code, 0, control.stderr);
        assert.equal(control.stdout.trim(), "OUTSIDE_LOADED");
        const rejected = await execute(specifier, true);
        assert.notEqual(rejected.code, 0, `Consumer accepted ${specifier}`);
        assert.match(rejected.stderr, /Consumer module resolved outside canonical root:/);
        assert.ok(rejected.stderr.includes(await realpath(specifier === "ancestor-control" ? path.join(ancestor, "index.mjs") : file)), rejected.stderr);
      });
    }
    const data = "data:text/javascript,export default 1";
    assert.equal((await execute(data, false)).code, 0);
    const rejected = await execute(data, true);
    assert.notEqual(rejected.code, 0);
    assert.match(rejected.stderr, /Consumer module must resolve to a file or builtin:/);
  });
});

async function sdkTree(action: (context: { root: string; source: string; destination: string; home: string }) => Promise<void>): Promise<void> {
  await tree(async (root) => {
    const source = path.join(root, "sdk/config/opencode"), destination = path.join(root, "copied"), home = path.join(root, "caller-home");
    for (const directory of [path.join(source, "node_modules/sdk"), destination, home]) await mkdir(directory, { recursive: true });
    await writeFile(path.join(source, "package.json"), '{"private":true}');
    await writeFile(path.join(source, "package-lock.json"), '{"lockfileVersion":3}');
    await writeFile(path.join(source, "node_modules/sdk/payload.txt"), "SDK_ORIGINAL");
    await writeFile(path.join(source, "auth.json"), "SYNTHETIC_AUTH_MUST_NOT_COPY");
    await writeFile(path.join(home, "marker.txt"), "SYNTHETIC_HOME_MUST_NOT_TOUCH");
    await action({ root, source, destination, home });
  });
}

test("SDK normal directory and absolute internal symlink become independent regular copied files", async () => {
  await sdkTree(async ({ source, destination }) => {
    const original = path.join(source, "node_modules/sdk/payload.txt");
    await symlink(path.dirname(original), path.join(source, "node_modules/sdk-alias"), directoryLink);
    await boundary.copySdkDependencies(source, destination);
    assert.deepEqual((await readdir(destination)).sort(), ["node_modules", "package-lock.json", "package.json"]);
    const alias = path.join(destination, "node_modules/sdk-alias"), copied = path.join(alias, "payload.txt");
    assert.equal((await lstat(alias)).isSymbolicLink(), false);
    assert.equal((await lstat(copied)).isFile(), true);
    assert.equal(await readFile(copied, "utf8"), "SDK_ORIGINAL");
    await writeFile(copied, "COPIED_ONLY");
    assert.equal(await readFile(original, "utf8"), "SDK_ORIGINAL", "Copied absolute symlink wrote the old SDK");
    assert.equal(await readFile(path.join(destination, "node_modules/sdk/payload.txt"), "utf8"), "SDK_ORIGINAL");
  });
});

test("SDK validation rejects external symlinks before any copy and before host startup", async (t) => {
  for (const entry of ["node_modules", "node_modules/sdk/escape", "package.json", "package-lock.json"]) await t.test(entry, async () => {
    await sdkTree(async ({ root, source, destination, home }) => {
      const file = path.join(source, entry);
      await rm(file, { recursive: true, force: true });
      await symlink(home, file, directoryLink);
      // Positive control recreates the old copy behavior using only a synthetic caller HOME.
      const { cp } = await import("node:fs/promises");
      const control = path.join(root, "unguarded-link");
      await cp(file, control, { recursive: true });
      assert.equal(await realpath(control), await realpath(home));
      await assert.rejects(boundary.copySdkDependencies(source, destination), /SDK dependency escapes source boundary:/);
      assert.deepEqual(await readdir(destination), [], "Invalid SDK partially copied before validation completed");
      const saved = process.env.HUGR_SMOKE_DEPS;
      try {
        process.env.HUGR_SMOKE_DEPS = source;
        await assert.rejects(boundary.runScenario({ binary: path.join(root, "absent-host"), keep: false }), /SDK dependency escapes source boundary:/);
      } finally { if (saved === undefined) delete process.env.HUGR_SMOKE_DEPS; else process.env.HUGR_SMOKE_DEPS = saved; }
      assert.equal(await readFile(path.join(home, "marker.txt"), "utf8"), "SYNTHETIC_HOME_MUST_NOT_TOUCH");
    });
  });
});

test("SDK directory cycles and missing selected entries fail by name before copy", async (t) => {
  for (const defect of ["cycle", "missing"] as const) await t.test(defect, async () => {
    await sdkTree(async ({ source, destination }) => {
      if (defect === "cycle") await symlink(path.join(source, "node_modules"), path.join(source, "node_modules/sdk/back"), directoryLink);
      else await rm(path.join(source, "package-lock.json"));
      await assert.rejects(boundary.copySdkDependencies(source, destination), defect === "cycle" ? /SDK dependency cycle:.*back/ : /ENOENT.*package-lock.json/);
      assert.deepEqual(await readdir(destination), []);
    });
  });
});

test("SDK copy rejects nonregular POSIX entries", { skip: process.platform === "win32" ? "POSIX FIFO fixture" : false }, async () => {
  await sdkTree(async ({ source, destination }) => {
    const fifo = path.join(source, "node_modules/sdk/pipe");
    const control = await boundary.runProcess("mkfifo", [fifo], { timeout: 5000 });
    assert.equal(control.code, 0, control.stderr);
    assert.equal((await lstat(fifo)).isFIFO(), true);
    await assert.rejects(boundary.copySdkDependencies(source, destination), /SDK dependency is not a regular file:.*pipe/);
    assert.deepEqual(await readdir(destination), []);
  });
});

test("SDK recursive walk has a finite 10000-entry cap", async () => {
  await sdkTree(async ({ source, destination }) => {
    const directory = path.join(source, "node_modules/wide");
    await mkdir(directory);
    for (let start = 0; start < 10000; start += 100) {
      await Promise.all(Array.from({ length: 100 }, (_, offset) => writeFile(path.join(directory, `entry-${start + offset}`), "")));
    }
    assert.equal((await readdir(directory)).length, 10000);
    await assert.rejects(boundary.copySdkDependencies(source, destination), /SDK dependency tree exceeds 10000 entries:/);
    assert.deepEqual(await readdir(destination), []);
  });
});
