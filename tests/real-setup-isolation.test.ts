import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const { setupRunner, isolatedEnv, installHugrDependencies } = await import(new URL("../scripts/real-world/setup.mjs", import.meta.url).href);

test("actual setup child receives private paths and rejects poisoned ambient env/preload config", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-setup-env-")), privateRoot = path.join(root, "private");
  const preload = path.join(root, "ambient.cjs");
  const poison: Record<string, string> = {
    HUGR_BENCH_AMBIENT_SENTINEL: "BENIGN_PARENT_SENTINEL", NODE_OPTIONS: `--require ${JSON.stringify(preload)}`,
    HOME: path.join(root, "ambient-home"), XDG_CONFIG_HOME: path.join(root, "ambient-config"),
    npm_config_userconfig: path.join(root, "ambient.npmrc"), GIT_CONFIG_GLOBAL: path.join(root, "ambient.gitconfig"),
    PYTHONPATH: "BENIGN_PARENT_PYTHON", RUSTFLAGS: "BENIGN_PARENT_RUST", GOFLAGS: "BENIGN_PARENT_GO", GIT_CONFIG_COUNT: "1",
  };
  const previous = Object.fromEntries(Object.keys(poison).map((key) => [key, process.env[key]]));
  try {
    await mkdir(privateRoot);
    await writeFile(preload, 'globalThis.HUGR_AMBIENT_PRELOAD = "BENIGN_PARENT_PRELOAD";\n');
    Object.assign(process.env, poison);
    const run = setupRunner(privateRoot, isolatedEnv(privateRoot));
    const result = await run("env-child", process.execPath, ["-e", "process.stdout.write(JSON.stringify({pid:process.pid,env:process.env,preload:globalThis.HUGR_AMBIENT_PRELOAD??null}));"]);
    const child = JSON.parse(result.text);
    assert.ok(Number.isSafeInteger(child.pid) && child.pid !== process.pid, "ENV_TEST_DID_NOT_LAUNCH_CHILD");
    assert.equal(child.preload, null, "AMBIENT_NODE_CONFIG_LOADED");
    for (const key of ["HUGR_BENCH_AMBIENT_SENTINEL", "NODE_OPTIONS", "PYTHONPATH", "RUSTFLAGS", "GOFLAGS", "GIT_CONFIG_COUNT"]) {
      assert.equal(child.env[key], undefined, `AMBIENT_ENV_LEAK: ${key}`);
    }
    const paths = {
      HOME: "home", USERPROFILE: "home", XDG_CONFIG_HOME: "config", XDG_CACHE_HOME: "cache", XDG_DATA_HOME: "data", XDG_STATE_HOME: "state",
      TMPDIR: "tmp", TMP: "tmp", TEMP: "tmp", npm_config_cache: "cache/npm", npm_config_prefix: "tooling",
      npm_config_userconfig: "config/npmrc", npm_config_globalconfig: "config/npmrc-global", GIT_CONFIG_GLOBAL: "config/gitconfig",
      CARGO_HOME: "cache/cargo", RUSTUP_HOME: "cache/rustup", GOPATH: "cache/go-path", GOMODCACHE: "cache/go-mod", GOCACHE: "cache/go-build", PIP_CACHE_DIR: "cache/pip",
    };
    for (const [key, relative] of Object.entries(paths)) assert.equal(child.env[key], path.join(privateRoot, relative), `PRIVATE_CHILD_PATH: ${key}`);
    assert.equal(child.env.PATH, process.env.PATH, "EXECUTABLE_DISCOVERY_CONTROL_MISSING");
    assert.deepEqual(await readFile(result.stdout), Buffer.from(result.text));
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(root, { recursive: true, force: true });
  }
});

test("ready setup timeout persists exact binary stdout/stderr/merged bytes and observed native facts", { timeout: 15000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-setup-prefix-")), server = createServer(), token = randomUUID();
  const stdout = Buffer.from([0, 255, 65, 13, 10]), stderr = Buffer.from([254, 0, 69, 10]);
  const spawn = childProcess.spawn;
  let nativeExit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  let running: Promise<any> | undefined, watchdog: ReturnType<typeof setTimeout> | undefined;
  const ready = new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.on("connection", (socket) => {
      let message = "";
      socket.on("data", (chunk) => {
        message += chunk.toString(); if (!message.endsWith("\n")) return;
        try { assert.equal(JSON.parse(message).token, token); socket.end("emit"); resolve(); }
        catch (error) { reject(error); socket.destroy(); }
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    childProcess.spawn = ((...args: any[]) => {
      const child = Reflect.apply(spawn, childProcess, args);
      if (args[0] === process.execPath) child.once("exit", (code: number | null, signal: NodeJS.Signals | null) => { nativeExit = { code, signal }; });
      return child;
    }) as typeof spawn;
    syncBuiltinESMExports();
    const port = (server.address() as AddressInfo).port;
    const source = `const fs=require('node:fs'); process.on('SIGTERM',()=>process.exit(9)); setInterval(()=>{},1000); const ready=require('node:net').connect(${port},'127.0.0.1'); ready.once('data',()=>{ fs.writeSync(1,Buffer.from(${JSON.stringify([...stdout])})); fs.writeSync(2,Buffer.from(${JSON.stringify([...stderr])})); ready.end(); }); ready.write(JSON.stringify({token:${JSON.stringify(token)}})+'\\n');`;
    running = setupRunner(root, isolatedEnv(root))("binary-timeout", process.execPath, ["-e", source], { timeout: 2000 })
      .then(() => { throw new Error("SETUP_BINARY_TIMEOUT_ACCEPTED"); }, (error: any) => { assert.match(error.message, /SETUP_FAILED: binary-timeout: timeout/); return error.record; });
    const readiness = Promise.race([ready, new Promise<never>((_, reject) => { watchdog = setTimeout(() => reject(new Error("SETUP_TIMEOUT_READINESS_MISSING")), 8000); })]);
    const [record] = await Promise.all([running, readiness]);
    assert.equal(record.timedOut, true); assert.equal(record.state, "finished");
    assert.ok(nativeExit, "SETUP_NATIVE_EXIT_NOT_OBSERVED");
    assert.deepEqual({ code: record.code, signal: record.signal }, nativeExit, "SETUP_NATIVE_EXIT_FACTS_FORGED");
    if (process.platform !== "win32") assert.deepEqual(nativeExit, { code: 9, signal: null });
    else assert.notEqual(nativeExit.code, 0);
    assert.deepEqual(await readFile(record.stdout), stdout); assert.deepEqual(await readFile(record.stderr), stderr);
    const original = await readFile(record.output);
    assert.ok([Buffer.concat([stdout, stderr]), Buffer.concat([stderr, stdout])].some((expected) => expected.equals(original)), "SETUP_BINARY_PREFIX_BYTES_ERASED_OR_DUPLICATED");
    assert.deepEqual(JSON.parse(await readFile(record.output.replace(/\.output$/, ".json"), "utf8")), record);
  } finally {
    clearTimeout(watchdog); await running;
    childProcess.spawn = spawn; syncBuiltinESMExports();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test("hugr dependency setup ledger follows successful literal npm ci and omits failed installs", async () => {
  const project = { path: path.resolve("synthetic-hugr"), modifications: [] as any[] }, calls: any[] = [];
  await installHugrDependencies(project, async (...args: any[]) => {
    assert.deepEqual(project.modifications, [], "DEPENDENCY_LEDGER_PRECEDES_INSTALL");
    calls.push(args); // Synthetic installation-phase plumbing; no npm/upstream compatibility claim.
  });
  assert.deepEqual(calls, [["hugr-install", "npm", ["ci"], { cwd: project.path }]]);
  assert.deepEqual(project.modifications.map(({ phase, path: file }) => ({ phase, path: file })), [{ phase: "setup", path: "node_modules" }]);
  assert.match(project.modifications[0].change, /npm ci/);
  const failed = { ...project, modifications: [] };
  await assert.rejects(installHugrDependencies(failed, async () => { throw new Error("CONTROLLED_INSTALL_FAILURE"); }), /CONTROLLED_INSTALL_FAILURE/);
  assert.deepEqual(failed.modifications, []);
});
