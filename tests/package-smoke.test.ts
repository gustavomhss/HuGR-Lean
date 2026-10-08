import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

// Computed URLs exercise the executable JS proofs without maintaining parallel TS implementations.
const benchmark = await import(new URL("../scripts/benchmark.mjs", import.meta.url).href);
const smoke = await import(new URL("../scripts/package-smoke.mjs", import.meta.url).href);
const root = benchmark.ROOT as string;
let temporary: string;
let seed: string;

async function npm(args: string[], directory: string): Promise<{ stdout: string; stderr: string }> {
  return await smoke.npmProcess(args, { cwd: directory, isolation: temporary, timeout: 120000 });
}

before(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), "hugr-proof-test-"));
  seed = path.join(temporary, "seed");
  await mkdir(seed);
  await cp(path.join(root, "fixtures"), path.join(seed, "fixtures"), { recursive: true });
  await mkdir(path.join(seed, "scripts"));
  await cp(path.join(root, "scripts/utility-corpus.mjs"), path.join(seed, "scripts/utility-corpus.mjs"));
  await cp(path.join(root, "docs"), path.join(seed, "docs"), { recursive: true });
  await cp(path.join(root, "src"), path.join(seed, "src"), { recursive: true });
  for (const file of ["LICENSE", "NOTICE", "licenses", "README.md"]) await cp(path.join(root, file), path.join(seed, file), { recursive: true });
  // Compile the actual application. npm run check runs tests before its final build step.
  const build = await smoke.isolatedProcess(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "-p", path.join(root, "tsconfig.build.json"), "--outDir", path.join(seed, "dist")], { cwd: root, isolation: temporary, timeout: 120000 });
  assert.equal(build.code, 0, build.stdout + build.stderr);
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  await writeFile(path.join(seed, "package.json"), JSON.stringify(manifest));
});

after(async () => { if (temporary) await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); });

async function fixture(action: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(temporary, "case-"));
  try {
    await cp(seed, directory, { recursive: true });
    await action(directory);
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
}

async function changeManifest(directory: string, edit: (manifest: Record<string, any>) => void): Promise<void> {
  const file = path.join(directory, "package.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  edit(manifest);
  await writeFile(file, JSON.stringify(manifest));
}

async function withAncestorTypeScript(action: () => Promise<void>): Promise<void> {
  const ancestor = await mkdtemp(path.join(temporary, "ancestor-")), ownTmp = path.join(ancestor, "tmp");
  await mkdir(path.join(ancestor, "node_modules"));
  await mkdir(ownTmp);
  await cp(path.join(root, "node_modules/typescript"), path.join(ancestor, "node_modules/typescript"), { recursive: true });
  const names = ["TMPDIR", "TMP", "TEMP", "NODE_PATH"], saved = names.map((name) => process.env[name]);
  try {
    for (const name of names.slice(0, 3)) process.env[name] = ownTmp;
    process.env.NODE_PATH = path.join(root, "node_modules");
    // Measured positive: ordinary Node resolves the planted ancestor even with NODE_PATH scrubbed.
    const control = await smoke.isolatedProcess(process.execPath, ["--input-type=module", "-e", 'import ts from "typescript"; console.log(ts.version);'], { cwd: ownTmp, isolation: ownTmp, timeout: 5000 });
    assert.equal(control.code, 0, control.stderr);
    assert.equal(control.stdout.trim(), JSON.parse(await readFile(path.join(root, "node_modules/typescript/package.json"), "utf8")).version);
    await action();
  } finally {
    names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; });
    await rm(ancestor, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

test("installed positive control packs/installs actual engine, loads default, filters fixtures and recovers exact raw", async () => {
  await fixture(async (directory) => {
    const result = await smoke.runPackageSmoke({ root: directory });
    assert.equal(result.status, "partial proof");
    assert.equal(result.releaseComplete, false, "Without --opencode, completed release proof must not be claimed");
    assert.deepEqual(result.rootExports, ["default"]);
    assert.ok(result.plugin.loaded && result.plugin.reduced && result.plugin.nonzeroExitExact);
    assert.ok(result.raw.exact && result.raw.tempfile && result.raw.purged);
    assert.ok(result.cli.releaseComplete && result.cli.shimVerified);
    assert.ok(result.serverResolved.endsWith("/node_modules/hugr-lean/dist/index.js"));
    assert.ok(!result.cli.target.startsWith(root + path.sep), "Consumer must live outside source ancestry");
    const corpus = await benchmark.readCorpus(directory);
    assert.equal(result.fixtureCount, corpus.length);
    assert.equal(result.fixtureCount, 39);
    assert.equal(result.profileIds.length, 10);
    assert.equal(result.plugin.fixtureCount, corpus.length, "Every fixture must traverse installed after-hook");
    assert.deepEqual(result.fixtures.map((item: { name: string }) => item.name), corpus.map((item: { name: string }) => item.name));
    assert.ok(result.fixtures.some((item: { status: string }) => item.status === "reduced"));
    assert.ok(result.fixtures.some((item: { status: string }) => item.status === "passthrough"));
    assert.deepEqual(result.notices.map((item: { file: string }) => item.file), ["LICENSE", "NOTICE", "licenses/TRS-MIT.txt"]);
  });
});

test("installed Node omission mutates actual compiled registry; restored artifact passes", async () => {
  await fixture(async (directory) => {
    const file = path.join(directory, "dist/profiles/index.js"), original = await readFile(file, "utf8");
    assert.equal((await smoke.runPackageSmoke({ root: directory })).profileIds.length, 10);
    const mutant = original.replace(", nodeTestProfile]", "]");
    assert.notEqual(mutant, original, "Control must omit actual compiled Node registration");
    await writeFile(file, mutant);
    await assert.rejects(smoke.runPackageSmoke({ root: directory }), /Installed default registry must ship ten real profiles/);
    await writeFile(file, original);
    assert.equal((await smoke.runPackageSmoke({ root: directory })).profileIds.length, 10);
  });
});

test("installed required-context loss fails despite unchanged pieces; restored artifact passes", async () => {
  await fixture(async (directory) => {
    const file = path.join(directory, "dist/profiles/go.js"), original = await readFile(file, "utf8");
    assert.equal((await smoke.runPackageSmoke({ root: directory })).fixtureCount, 39);
    const mutant = original.replace("reduction(kept) : undefined", '{ ...reduction(kept), required: kept.filter(line => !line.text.startsWith("=== RUN")).map(line => line.span) } : undefined');
    assert.notEqual(mutant, original, "Control must remove actual compiled Go required RUN context, retaining emitted pieces");
    await writeFile(file, mutant);
    await assert.rejects(smoke.runPackageSmoke({ root: directory }), /utility\/go\/.*independent critical anchor missing from required: === RUN/);
    await writeFile(file, original);
    assert.equal((await smoke.runPackageSmoke({ root: directory })).fixtureCount, 39);
  });
});

test("native fixture folder is required; missing or empty corpus cannot fall back to legacy", async () => {
  for (const empty of [false, true]) await fixture(async (directory) => {
    const native = path.join(directory, "fixtures/utility");
    await rm(native, { recursive: true });
    if (empty) await mkdir(native);
    await assert.rejects(benchmark.readCorpus(directory), empty ? /EMPTY_CORPUS/ : /ENOENT.*utility/);
  });
});

test("compiled default inventory includes Node once and dispatches real source capture", async () => {
  const { filter, profiles } = await benchmark.compiled(seed);
  assert.equal(profiles.length, 10, "Compiled default inventory must contain ten profiles");
  assert.equal(profiles.filter((item: { id: string }) => item.id === "node-test").length, 1);
  // Narrow registration control reads independent bytes; authenticated full-corpus proof remains mandatory above.
  const directory = path.join(seed, "fixtures/utility/node/captures/node-flat-default");
  const original = await readFile(path.join(directory, "original.log"), "utf8");
  const expected = await readFile(path.join(directory, "output.expected.log"), "utf8");
  const result = filter(benchmark.observation(original, "node --test fixture.mjs"));
  assert.equal(result.status, "reduced");
  assert.equal(result.profile, "node-test");
  assert.equal(result.replacement, expected);
});

test("tarball missing compiled dist and notices fails with each exact artifact name", async (t) => {
  for (const file of ["dist/index.js", "dist/core/index.js", "dist/raw/index.js", "LICENSE", "NOTICE", "licenses/TRS-MIT.txt"]) {
    await t.test(file, async () => fixture(async (directory) => {
      await rm(path.join(directory, file));
      await assert.rejects(smoke.runPackageSmoke({ root: directory, cli: false }), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes(file === "licenses/TRS-MIT.txt" ? "licenses/TRS-MIT" : file), error.message);
        assert.match(error.message, /Packed artifact missing/);
        return true;
      });
    }));
  }
});

test("empty shipped notice cannot pass through tarball existence check", async () => {
  await fixture(async (directory) => {
    await writeFile(path.join(directory, "NOTICE"), "\n");
    await assert.rejects(smoke.runPackageSmoke({ root: directory, cli: false }), /Installed notice\/license is empty: NOTICE/);
  });
});

test("installed resolution rejects missing root/core/raw exports", async (t) => {
  for (const entry of [".", "./server", "./core", "./raw"]) {
    await t.test(entry, async () => fixture(async (directory) => {
      await changeManifest(directory, (manifest) => { delete manifest.exports[entry]; });
      await assert.rejects(smoke.runPackageSmoke({ root: directory, cli: false }), /ERR_PACKAGE_PATH_NOT_EXPORTED/);
    }));
  }
});

test("installed bad root export mutation fails; restoring actual compiled root restores positive proof", async () => {
  await fixture(async (directory) => {
    const file = path.join(directory, "dist/index.js");
    const original = await readFile(file, "utf8");
    await writeFile(file, original + '\nexport { createAfterHook } from "./opencode/index.js";\n');
    await assert.rejects(smoke.runPackageSmoke({ root: directory, cli: false }), /Installed package root must export DEFAULT ONLY/);
    await writeFile(file, original);
    assert.deepEqual((await smoke.runPackageSmoke({ root: directory, cli: false })).rootExports, ["default"]);
  });
});

test("installed exit-preservation mutation fails on reducible failed output, then restores", async () => {
  await fixture(async (directory) => {
    const file = path.join(directory, "dist/opencode/index.js");
    const original = await readFile(file, "utf8");
    const mutant = original.replace("code: exit", "code: 0");
    assert.notEqual(mutant, original, "Control must disable actual compiled adapter exit mapping");
    await writeFile(file, mutant);
    await assert.rejects(smoke.runPackageSmoke({ root: directory, cli: false }), /Installed plugin changed failed output or did not filter success/);
    await writeFile(file, original);
    assert.equal((await smoke.runPackageSmoke({ root: directory, cli: false })).plugin.nonzeroExitExact, true);
  });
});

test("independent goldens reject byte-smaller non-Cargo output x, then restored artifact passes", async () => {
  await fixture(async (directory) => {
    const file = path.join(directory, "dist/core/index.js");
    const original = await readFile(file, "utf8");
    await writeFile(file, `import { filter as actual } from "./engine.js";
export const filter = (...args) => {
  const result = actual(...args);
  return result.status === "reduced" && !result.profile.startsWith("cargo")
    ? { ...result, replacement: "x", outputBytes: 1 } : result;
};\n`);
    await assert.rejects(smoke.runPackageSmoke({ root: directory, cli: false }), /pytest_success.txt: independent golden\/evidence differs/);
    await writeFile(file, original);
    assert.equal((await smoke.runPackageSmoke({ root: directory, cli: false })).fixtureCount, (await benchmark.readCorpus(directory)).length);
  });
});

test("undeclared TypeScript runtime import fails with a measured ancestor dependency; valid tarball passes", async () => {
  await fixture(async (directory) => {
    const file = path.join(directory, "dist/index.js"), original = await readFile(file, "utf8");
    await withAncestorTypeScript(async () => {
      assert.equal((await smoke.runPackageSmoke({ root: directory })).cli.releaseComplete, true);
      await writeFile(file, 'import "typescript";\n' + original);
      await assert.rejects(smoke.runPackageSmoke({ root: directory, cli: false }), /Consumer module resolved outside canonical root: typescript/);
      await writeFile(file, original);
      assert.equal((await smoke.runPackageSmoke({ root: directory })).cli.releaseComplete, true);
    });
  });
});

test("guarded CLI version and doctor reject undeclared ancestor imports after the physical shim", async (t) => {
  await withAncestorTypeScript(async () => {
    for (const argument of ["--version", "doctor"]) await t.test(argument, async () => fixture(async (directory) => {
      const file = path.join(directory, "dist/cli/index.js"), original = await readFile(file, "utf8");
      // Preserve the executable shebang. The unguarded physical --version shim can still pass.
      await writeFile(file, original.replace("\n", `\nif (process.argv[2] === ${JSON.stringify(argument)}) await import("typescript");\n`));
      await assert.rejects(smoke.runPackageSmoke({ root: directory }), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Consumer module resolved outside canonical root: typescript/);
        assert.ok(error.message.includes(`consumer-import.mjs`) && error.message.includes(argument), error.message);
        return true;
      });
    }));
  });
});

test("doctor plugin URL oracle rejects a different real file and query/fragment delimiters", async (t) => {
  for (const defect of ["wrong-file", "query", "?", "#", "?#"] as const) await t.test(defect, async () => fixture(async (directory) => {
    const file = path.join(directory, "dist/cli/index.js"), original = await readFile(file, "utf8");
    const probe = `const doctorWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...args) => {
  if (process.argv[2] === "doctor") {
    const facts = JSON.parse(String(chunk));
    facts.pluginURL = ${defect === "wrong-file" ? 'new URL("../raw/index.js", import.meta.url).href' : `facts.pluginURL + ${JSON.stringify(defect === "query" ? "?ignored" : defect)}`};
    chunk = JSON.stringify(facts) + "\\n";
  }
  return doctorWrite(chunk, ...args);
};\n`;
    await writeFile(file, original.replace("\n", "\n" + probe));
    await assert.rejects(smoke.runPackageSmoke({ root: directory }), defect === "wrong-file" ? /Installed CLI doctor facts differ/ : /Installed CLI doctor plugin URL must name a plain file/);
  }));
});

test("doctor plain-file URL oracle allows encoded filename delimiters", () => {
  for (const encoded of ["%3F", "%23", "%3F%23"]) {
    const href = `file:///consumer/plugin${encoded}.js`, url = smoke.assertPlainFileURL(href);
    assert.equal(url.href, href);
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
  }
});

test("installed default value and plugin stub cannot substitute for real function/hook", async (t) => {
  for (const [code, message] of [
    ["export default 42;\n", /Installed package default must be a function/],
    ["export default async () => ({});\n", /Installed default did not load after-hook/],
    ['export default async () => ({ "tool.execute.after": async () => {} });\n', /Installed plugin changed failed output or did not filter success/],
  ] as const) {
    await t.test(code.trim(), async () => fixture(async (directory) => {
      await writeFile(path.join(directory, "dist/index.js"), code);
      await assert.rejects(smoke.runPackageSmoke({ root: directory, cli: false }), message);
    }));
  }
});

test("pack ignores a measured HOME-writing prepack; install ignores a measured failing hook", async () => {
  await fixture(async (directory) => {
    const callerHome = path.join(directory, "caller-home");
    await mkdir(callerHome);
    const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
    process.env.HOME = callerHome;
    process.env.USERPROFILE = callerHome;
    try {
      await changeManifest(directory, (manifest) => {
        manifest.scripts = {
          prepack: 'node -e "require(\'node:fs\').writeFileSync(require(\'node:path\').join(require(\'node:os\').homedir(), \'prepack-ran\'), \'control\'); throw new Error(\'PREPACK_MUST_NOT_RUN\')"',
          preinstall: 'node -e "throw new Error(\'INSTALL_SCRIPT_MUST_NOT_RUN\')"',
        };
      });
      const source = await readFile(path.join(directory, "dist/index.js"), "utf8");
      const good = await smoke.runPackageSmoke({ root: directory, cli: false });
      assert.match(good.pack, /pack --ignore-scripts/);
      assert.equal(good.install, "npm install tarball --ignore-scripts");
      assert.equal(await readFile(path.join(directory, "dist/index.js"), "utf8"), source);
      await assert.rejects(readFile(path.join(callerHome, "prepack-ran")), { code: "ENOENT" });
      await assert.rejects(readFile(path.join(temporary, "home/prepack-ran")), { code: "ENOENT" });
      // Positive control runs the same prepack, still with an isolated HOME, never caller credentials.
      let prepackFailure: Error | undefined;
      try {
        await assert.rejects(npm(["pack", "--json", "--ignore-scripts=false", "--pack-destination", directory], directory), (error: unknown) => {
          assert.ok(error instanceof Error);
          prepackFailure = error;
          assert.match(error.message, /^(?:npm (?:error|ERR!) )?Error: PREPACK_MUST_NOT_RUN\r?$/m);
          return true;
        });
        assert.equal(await readFile(path.join(temporary, "home/prepack-ran"), "utf8"), "control");
      } catch (error) {
        // A command echo can match the sentinel without executing the hook. Keep the npm failure too.
        const probe = `const { spawnSync } = require('node:child_process');
const env = Object.fromEntries(['HOME', 'USERPROFILE', 'PATH', 'PATHEXT', 'ComSpec', 'SystemRoot', 'SHELL'].map(key => [key, process.env[key] ?? null]));
const viaShell = args => {
  const result = spawnSync('node', args, { encoding: 'utf8', shell: true, timeout: 3000 });
  return { status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr, error: result.error?.message };
};
console.log(JSON.stringify({ execPath: process.execPath, version: process.version, homedir: require('node:os').homedir(), env,
  pathNode: viaShell(['-p', 'process.execPath']), pathNodeVersion: viaShell(['--version']) }));`;
        let diagnostic: unknown;
        try {
          const { code, signal, stdout, stderr } = await smoke.isolatedProcess(process.execPath, ["-e", probe], { cwd: directory, isolation: temporary, timeout: 10000 });
          diagnostic = { code, signal, stdout, stderr };
        } catch (probeError) { diagnostic = probeError instanceof Error ? probeError.stack : String(probeError); }
        throw new Error(`Prepack control failed; expected HOME=${path.join(temporary, "home")}; marker=${path.join(temporary, "home/prepack-ran")}
${error instanceof Error ? error.stack : String(error)}
Original npm failure:
${prepackFailure?.stack ?? "npm did not reject with an Error"}
Isolated diagnostic (Node shell probe, not npm lifecycle):
${JSON.stringify(diagnostic)}`, { cause: error });
      }
      const packed = await npm(["pack", "--json", "--ignore-scripts", "--pack-destination", directory], directory);
      // Positive control: the same hook really fails if npm is allowed to execute install scripts.
      const tarball = path.join(directory, JSON.parse(packed.stdout)[0].filename);
      const consumer = path.join(directory, "hook-control");
      await mkdir(consumer);
      await writeFile(path.join(consumer, "package.json"), '{"private":true}');
      await assert.rejects(npm(["install", tarball, "--no-audit", "--no-fund"], consumer), /^(?:npm (?:error|ERR!) )?Error: INSTALL_SCRIPT_MUST_NOT_RUN\r?$/m);
      await assert.rejects(readFile(path.join(callerHome, "prepack-ran")), { code: "ENOENT" });
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
    }
  });
});

test("missing CLI and requested missing OpenCode are failures, not skipped green checks", async () => {
  await fixture(async (directory) => {
    await changeManifest(directory, (manifest) => { delete manifest.bin; });
    await assert.rejects(smoke.runPackageSmoke({ root: directory }), /Installed CLI manifest missing: bin.hugr-lean/);
    const saved = process.env.OPENCODE_BIN;
    try {
      delete process.env.OPENCODE_BIN;
      await assert.rejects(smoke.runPackageSmoke({ root: directory, opencode: true }), /--opencode requires OPENCODE_BIN/);
      process.env.OPENCODE_BIN = path.join(directory, "absent-opencode");
      await assert.rejects(smoke.runPackageSmoke({ root: directory, cli: false, opencode: true }), /Cannot execute.*absent-opencode.*ENOENT/);
    } finally { if (saved === undefined) delete process.env.OPENCODE_BIN; else process.env.OPENCODE_BIN = saved; }
  });
});

test("bounded isolated helper drops ambient credentials and settles despite detached descendant pipes", async () => {
  const names = ["NODE_PATH", "NODE_OPTIONS", "OPENAI_API_KEY", "GITHUB_TOKEN", "npm_config_cache"];
  const saved = names.map((name) => process.env[name]);
  let watchdog: NodeJS.Timeout | undefined;
  const pidFile = path.join(temporary, "held-child.json");
  try {
    for (const name of names) process.env[name] = "AMBIENT_MARKER_MUST_NOT_LEAK";
    const control = await smoke.isolatedProcess(process.execPath, ["-e", "console.log(JSON.stringify(process.env))"], { cwd: seed, isolation: temporary, timeout: 5000 });
    assert.equal(control.code, 0, control.stderr);
    const env = JSON.parse(control.stdout);
    for (const name of names.slice(0, -1)) assert.equal(env[name], undefined, name);
    assert.equal(env.HOME, path.join(temporary, "home"));
    assert.equal(env.npm_config_cache, path.join(temporary, "cache/npm"));
    const heldCode = "process.stdout.write('HUGR_CHILD_HELD\\n'); setInterval(() => {}, 1000)";
    const code = `const { spawn } = require("node:child_process");
const child = spawn(process.execPath, ["-e", ${JSON.stringify(heldCode)}], { detached: true, stdio: ["ignore", "inherit", "inherit"] });
require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, JSON.stringify({ pid: child.pid })); child.unref();`;
    const execution = smoke.isolatedProcess(process.execPath, ["-e", code], { cwd: seed, isolation: temporary, timeout: 1500 })
      .then((result: { code: number | null; stdout: string; stderr: string }) => { throw new Error(`Helper returned before pipe-owner timeout (${result.code}): ${result.stdout}\n${result.stderr}`); });
    await assert.rejects(Promise.race([execution, new Promise((_, reject) => { watchdog = setTimeout(() => reject(new Error("Bounded helper stayed pending with held pipes")), 6000); })]), /OpenCode timeout after 1500 ms[\s\S]*HUGR_CHILD_HELD/);
    const { pid } = JSON.parse(await readFile(pidFile, "utf8"));
    process.kill(pid, 0); // Positive control: a detached descendant still holds the inherited pipes.
  } finally {
    clearTimeout(watchdog);
    try { const { pid } = JSON.parse(await readFile(pidFile, "utf8")); process.kill(pid, "SIGKILL"); }
    catch (error) { if (!["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error; }
    names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; });
  }
});

test("fixture deletion, empty fixture and corrupt success grammar fail rather than report zero-work success", async (t) => {
  for (const [defect, pattern] of [["missing", /Fixture corpus\/declarations differ/], ["empty", /Empty fixture:/], ["unsupported", /installed default filter did not reduced/]] as const) {
    await t.test(defect, async () => fixture(async (directory) => {
      const file = path.join(directory, "fixtures/runners/cargo_test_success.txt");
      if (defect === "missing") await rm(file); else await writeFile(file, defect === "empty" ? "" : "unknown log café 🔥\n");
      await assert.rejects(smoke.runPackageSmoke({ root: directory, cli: false }), pattern);
    }));
  }
});

test("independent golden registry cannot be missing, empty, stale or contain an empty expected output", async (t) => {
  for (const [defect, pattern] of [
    ["missing", /ENOENT.*installed-goldens.json/], ["empty", /Installed golden\/fixture coverage differs/],
    ["stale", /Installed golden\/fixture coverage differs/], ["empty-output", /Empty or invalid installed golden/],
  ] as const) {
    await t.test(defect, async () => fixture(async (directory) => {
      const file = path.join(directory, "fixtures/installed-goldens.json");
      if (defect === "missing") await rm(file);
      else {
        const goldens = JSON.parse(await readFile(file, "utf8"));
        if (defect === "empty") goldens.outputs = {};
        else if (defect === "stale") goldens.outputs["absent-fixture.txt"] = "stale";
        else goldens.outputs[Object.keys(goldens.outputs)[0]!] = "";
        await writeFile(file, JSON.stringify(goldens));
      }
      await assert.rejects(smoke.runPackageSmoke({ root: directory, cli: false }), pattern);
    }));
  }
});

test("benchmark uses compiled default profiles; missing build, registry, duplicate IDs and default reducer fail", async (t) => {
  for (const [defect, pattern] of [
    ["build", /Missing or invalid compiled build/], ["empty-registry", /Default profile registry is missing or empty/],
    ["missing-profile", /Default profile\/corpus coverage differs/], ["duplicate-profile", /Duplicate default profile IDs/],
    ["default-engine", /expected reduced, got passthrough/],
  ] as const) {
    await t.test(defect, async () => fixture(async (directory) => {
      if (defect === "build") await rm(path.join(directory, "dist/core/index.js"));
      else {
        const file = path.join(directory, defect === "default-engine" ? "dist/core/index.js" : "dist/profiles/index.js");
        const original = await readFile(file, "utf8");
        const code = defect === "default-engine" ? 'export const filter = (obs) => ({ status: "passthrough", reason: "no_profile", inputBytes: Buffer.byteLength(obs.output), outputBytes: Buffer.byteLength(obs.output) });\n'
          : defect === "empty-registry" ? "export const profiles = [];\n"
          : defect === "missing-profile" ? original.replace("...runnerProfiles", '...runnerProfiles.filter((entry) => entry.id !== "cargo-test")')
          : original.replace("...runnerProfiles", "...runnerProfiles, runnerProfiles[0]");
        assert.notEqual(code, original, "Control must alter compiled artifact");
        await writeFile(file, code);
      }
      await assert.rejects(benchmark.runBenchmark({ root: directory }), pattern);
    }));
  }
});

test("synthetic Cargo workloads have exact UTF-8 size, unique cases and native summary totals; real default engine reduces", async () => {
  const { filter, profiles } = await benchmark.compiled(seed);
  const corpus = await benchmark.readCorpus(seed);
  benchmark.assertCoverage(profiles, corpus);
  for (const size of [256 * 1024, 1024 * 1024]) {
    const entry = benchmark.cargoWorkload(size);
    const output = entry.observation.output as string;
    assert.equal(Buffer.byteLength(output, "utf8"), size);
    assert.ok(Buffer.byteLength(output, "utf8") > output.length, "Workload must exercise UTF-8/UTF-16 difference");
    const names = [...output.matchAll(/^test (\S+) \.\.\. ok$/gm)].map((match) => match[1]);
    assert.equal(names.length, entry.testCases);
    assert.equal(new Set(names).size, entry.testCases);
    assert.ok(output.includes(`running ${entry.testCases} tests\n`));
    assert.ok(output.includes(`test result: ok. ${entry.testCases} passed; 0 failed;`));
    assert.equal(benchmark.checkResult(entry, filter(entry.observation)), entry.expected);
    for (const preserved of benchmark.preservationCases(entry)) {
      assert.equal(benchmark.checkResult(preserved, filter(preserved.observation)), preserved.observation.output);
    }
  }
  for (const size of [0, -1, NaN, 1.5, 100]) assert.throws(() => benchmark.cargoWorkload(size), /Cargo workload size/);
  assert.throws(() => benchmark.assertCoverage(profiles, []), /Workload corpus is empty/);
  assert.throws(() => smoke.assertPack([{ filename: "empty.tgz", files: [] }]), /file list is missing or empty/);
});
