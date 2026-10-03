import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { connect, createServer, type AddressInfo, type Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const workloads = await import(new URL("../scripts/real-world/workloads.mjs", import.meta.url).href);
const setup = await import(new URL("../scripts/real-world/setup.mjs", import.meta.url).href);
type Project = { id: string; path: string; commit: string; license: string; licensePaths: string[]; sourcePaths: string[] };
type Case = {
  id: string; project: string; category: string; command: string; cwd: string; expectExit: string; oracle: string;
  marker?: string; controlledFailure?: boolean; allowEmpty: boolean; follows?: string; cache?: string;
  modifications: { path: string }[]; prepare(): Promise<void>; restore(): Promise<void>;
  workspace?: { source: string; cwd: string; retained: boolean; sourceReadOnly: boolean };
};
type Run = (name: string, file: string, args: string[], options?: { cwd?: string; timeout?: number }) => Promise<{ text: string }>;
const ids = ["itoa", "gjson", "boltons", "ms", "ufo", "hugr"];
const projects = (root: string): Project[] => setup.PINS.map((pin: Project) => ({ ...pin, path: path.join(root, pin.id) }));
const cases = (root: string, run?: Run): Case[] => workloads.catalog(projects(root), run);

async function tree(action: (root: string) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "hugr-workloads-")));
  try { await action(root); }
  finally { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
}

test("catalog is nonempty, uniquely identified, complete, and keeps literal normal commands", () => {
  const root = path.resolve("offline-catalog"), entries = cases(root);
  assert.ok(entries.length >= 25 && entries.length <= 35, "Expected roughly 20–30 substantive workload cases");
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length, "Duplicate workload IDs");
  // Required user-command families. Extra reporters, filtering flags, wrappers and rewrites break this contract.
  const required: Record<string, string[]> = {
    itoa: ["cargo build", "cargo test", "cargo test --lib"],
    gjson: ["go test -v ./...", "go test"],
    boltons: ["pytest", "pytest -q", "pytest --doctest-modules boltons tests"],
    ms: ["jest --env node", "npm run test:nodejs"],
    ufo: ["vitest run", "npm test", "npm run lint"],
    hugr: ["npm run build", "npm run typecheck", "tsc --noEmit", "tsx --test tests/core.test.ts tests/runners.test.ts", "git status", "rg -n 'export' src", "git diff HEAD~1", "cat README.md", "ls"],
  };
  for (const [project, commands] of Object.entries(required)) {
    const primary = entries.filter((entry) => entry.project === project && entry.category === "primary");
    assert.ok(primary.length > 0, `Missing primary project ${project}`);
    for (const command of commands) assert.ok(primary.some((entry) => entry.command === command), `Missing literal ${project}: ${command}`);
  }
  for (const entry of entries) {
    assert.match(entry.id, /^[a-z0-9-]+$/);
    assert.ok(ids.includes(entry.project), entry.id);
    assert.equal(entry.cwd, path.join(root, entry.project));
    for (const key of ["cwd", "workspace"]) {
      const descriptor = Object.getOwnPropertyDescriptor(entry, key);
      assert.equal(descriptor?.enumerable, true);
      assert.equal(typeof descriptor?.get, "function", `${entry.id}: live ${key}`);
    }
    assert.ok(["primary", "control"].includes(entry.category), entry.id);
    assert.ok(["zero", "nonzero"].includes(entry.expectExit), entry.id);
    assert.ok(entry.command.length > 0 && entry.oracle.length > 0, entry.id);
    assert.ok(["exact", "cargo-build", "cargo-test", "pytest", "go", "jest", "vitest", "git", "rg", "node"].includes(entry.oracle), `Unknown independent oracle: ${entry.id}/${entry.oracle}`);
    assert.equal(typeof entry.allowEmpty, "boolean");
    assert.equal(typeof entry.prepare, "function");
    assert.equal(typeof entry.restore, "function");
    if (entry.modifications.length) assert.equal(entry.category, "control", `Modified source presented as primary: ${entry.id}`);
    if (entry.expectExit === "nonzero") {
      assert.equal(entry.category, "control");
      assert.equal(entry.controlledFailure, true);
      assert.equal(entry.marker, "BENCH_EXPECTED_FAILURE");
    }
  }
  assert.equal(entries.find((entry) => entry.id === "hugr-tsc-direct")?.allowEmpty, true);
  assert.ok(entries.filter((entry) => entry.expectExit === "zero" && !entry.allowEmpty).length > 0);
  const serialized = JSON.parse(JSON.stringify({ projects: projects(root), cases: entries, env: setup.isolatedEnv(root), versions: { pnpm: setup.TOOLING.pnpm } }));
  assert.equal(serialized.cases.length, entries.length);
  assert.ok(serialized.projects.every((project: Project) => project.sourcePaths.length && project.licensePaths.length));
  assert.equal(serialized.versions.pnpm, "10.33.2");
});

test("pins retain exact independently specified revisions, repositories, license paths and provenance", () => {
  const expected: Record<string, [string, string, string]> = {
    itoa: ["dtolnay/itoa", "1577ed901354d0d7448ac162328f9dbf5183124c", "MIT OR Apache-2.0"],
    gjson: ["tidwall/gjson", "8d89927eff414537088a6092d53fecf6711c1e75", "MIT"],
    boltons: ["mahmoud/boltons", "4e5faa3d7e4008d89e0d8bf1ea87b6d9a061a16d", "BSD-3-Clause"],
    ms: ["vercel/ms", "4ff48cec099f0514c3e9bbca18706c9c21122bfb", "MIT"],
    ufo: ["unjs/ufo", "f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6", "MIT"],
    hugr: ["gmhelmold/HuGR-Lean", "69607794cbb2a3ce6707a509777ac648aa859bdd", "MIT"],
  };
  assert.deepEqual(setup.PINS.map((pin: Project) => pin.id).sort(), Object.keys(expected).sort());
  for (const pin of setup.PINS) {
    const spec = expected[pin.id];
    assert.ok(spec, pin.id);
    assert.equal(pin.repository, `https://github.com/${spec[0]}.git`);
    assert.equal(pin.commit, spec[1]);
    assert.equal(pin.license, spec[2]);
    assert.ok(pin.sourcePaths.length > 0 && pin.licensePaths.length > 0);
    for (const relative of [...pin.sourcePaths, ...pin.licensePaths]) {
      assert.equal(path.isAbsolute(relative), false);
      assert.equal(relative.split("/").includes(".."), false);
    }
  }
  assert.deepEqual(setup.PINS.find((pin: Project) => pin.id === "itoa").licensePaths, ["LICENSE-MIT", "LICENSE-APACHE"]);
});

test("missing projects and missing preparation runner fail by name; warm cases remain chronological", async () => {
  const root = path.resolve("offline-catalog");
  for (const id of ids) assert.throws(() => workloads.catalog(projects(root).filter((project) => project.id !== id)), new RegExp(`CATALOG_MISSING_PROJECT: ${id}`));
  assert.throws(() => workloads.catalog([]), /CATALOG_MISSING_PROJECT: itoa/);
  const entries = cases(root);
  for (const entry of entries.filter((entry) => entry.cache === "warm" || entry.cache === "cached")) {
    const predecessor = entries.findIndex((candidate) => candidate.id === entry.follows);
    assert.ok(predecessor >= 0 && predecessor < entries.indexOf(entry), entry.id);
    assert.equal(entries[predecessor]?.command, entry.command, "Cold and warm command spellings must match");
    assert.equal(entries[predecessor]?.cache, "cold");
  }
  for (const id of ["cargo-build-cold", "go-test-verbose-cold", "git-status-mixed"]) {
    const entry = entries.find((candidate) => candidate.id === id);
    assert.ok(entry);
    await assert.rejects(entry.prepare(), new RegExp(`CASE_SETUP_RUNNER_MISSING: ${id}`));
  }
});

test("isolation drops ambient secrets/config and uses private HOME, caches and temporary directories", () => {
  const root = path.resolve("private-root"), env = setup.isolatedEnv(root, {
    PATH: "EXECUTABLE_DISCOVERY_ONLY", SystemRoot: "PLATFORM_ROOT", HOME: "CALLER_HOME", XDG_CONFIG_HOME: "CALLER_CONFIG",
    GITHUB_TOKEN: "SECRET", NPM_TOKEN: "SECRET", npm_config_userconfig: "CALLER_NPMRC", NODE_OPTIONS: "--require caller",
    PYTHONPATH: "CALLER_PYTHON", RUSTFLAGS: "CALLER_RUST", CARGO_HOME: "CALLER_CARGO", GOFLAGS: "CALLER_GO", GIT_CONFIG_COUNT: "1",
  });
  assert.equal(env.PATH, "EXECUTABLE_DISCOVERY_ONLY");
  assert.equal(env.SystemRoot, "PLATFORM_ROOT");
  for (const key of ["GITHUB_TOKEN", "NPM_TOKEN", "NODE_OPTIONS", "PYTHONPATH", "RUSTFLAGS", "GOFLAGS", "GIT_CONFIG_COUNT"]) assert.equal(env[key], undefined, key);
  for (const key of ["HOME", "USERPROFILE", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "TMPDIR", "TMP", "TEMP", "npm_config_cache", "npm_config_prefix", "npm_config_userconfig", "npm_config_globalconfig", "CARGO_HOME", "RUSTUP_HOME", "GOPATH", "GOMODCACHE", "GOCACHE", "PIP_CACHE_DIR", "GIT_CONFIG_GLOBAL"]) {
    const relative = path.relative(root, env[key]);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), key);
  }
  assert.equal(env.GIT_CONFIG_NOSYSTEM, "1");
  assert.equal(env.GOENV, "off");
  assert.equal(env.GOTOOLCHAIN, "local");
  assert.equal(env.npm_config_manage_package_manager_versions, "false");
});

test("setup retains successful output and exact failed bytes with named exit/spawn/timeout facts", async () => {
  await tree(async (root) => {
    const run = setup.setupRunner(root, setup.isolatedEnv(root));
    const control = await run("positive-output", process.execPath, ["-e", 'process.stdout.write("CONTROL_PRESENT\\n")']);
    assert.equal(control.text, "CONTROL_PRESENT\n");
    assert.equal(await readFile(control.stdout, "utf8"), "CONTROL_PRESENT\n");
    let failure: any;
    await assert.rejects(run("npm-install-failure", process.execPath, ["-e", 'process.stdout.write(Buffer.from([0,255,65])); process.stderr.write("INSTALL_FAILED_OUTPUT\\n"); process.exitCode=9;']), (error: any) => {
      failure = error.record;
      assert.match(error.message, /SETUP_FAILED: npm-install-failure: exit=9/);
      return true;
    });
    assert.deepEqual(await readFile(failure.stdout), Buffer.from([0, 255, 65]));
    assert.equal(await readFile(failure.stderr, "utf8"), "INSTALL_FAILED_OUTPUT\n");
    const merged = await readFile(failure.output);
    assert.equal(merged.length, 3 + Buffer.byteLength("INSTALL_FAILED_OUTPUT\n"));
    assert.ok(merged.includes(Buffer.from([0, 255, 65])) && merged.includes(Buffer.from("INSTALL_FAILED_OUTPUT\n")));
    const record = JSON.parse(await readFile(failure.output.replace(/\.output$/, ".json"), "utf8"));
    assert.equal(record.code, 9);
    assert.equal(record.timedOut, false);
    await assert.rejects(run("missing-tool", path.join(root, "ABSENT_BINARY"), []), (error: any) => {
      assert.match(error.message, /SETUP_FAILED: missing-tool: ENOENT/);
      assert.match(error.record.spawnError, /ENOENT/);
      return true;
    });
    await assert.rejects(run("timeout-tool", process.execPath, ["-e", "setInterval(() => {}, 1000)"], { timeout: 50 }), (error: any) => {
      assert.match(error.message, /SETUP_FAILED: timeout-tool: timeout/);
      assert.equal(error.record.timedOut, true);
      return true;
    });
    await assert.rejects(run("../invalid", process.execPath, []), /SETUP_INVALID_NAME/);
  });
});

const pipeFixture = `
const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const detached = process.argv[2] === 'detached';
process.stdout.write('PARENT_OUTPUT\\n', () => {
  const source = process.argv[3] + "process.stdout.write(Buffer.from([0,255,65])); process.stderr.write('DESCENDANT_OUTPUT\\\\n'); " +
    (detached ? '' : 'setTimeout(() => { process.exitCode ??= 0; endOwner(); }, 50);');
  const child = spawn(process.execPath, ['-e', source], { detached, stdio: ['ignore', 1, 2] });
  writeFileSync(process.argv[1], JSON.stringify({ pid: child.pid }));
  if (detached) { child.unref(); process.exit(7); }
  else child.once('exit', (code) => { process.exitCode = code ?? 1; });
});
`;

async function fixturePid(file: string): Promise<number> {
  const { pid } = JSON.parse(await readFile(file, "utf8"));
  assert.ok(Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid, "Invalid owned fixture PID");
  return pid;
}

function pipeLine(socket: Socket): Promise<{ line: string; chunks: number }> {
  return new Promise((resolve, reject) => {
    let pending = "", chunks = 0;
    const finish = (error?: Error, line?: string) => {
      clearTimeout(timer); socket.off("data", data); socket.off("end", ended); socket.off("close", ended); socket.off("error", failed);
      if (error) reject(error); else resolve({ line: line!, chunks });
    };
    const data = (chunk: Buffer) => { chunks++; pending += chunk.toString(); const end = pending.indexOf("\n"); if (end >= 0) finish(undefined, pending.slice(0, end)); };
    const ended = () => finish(new Error("PIPE_OWNER_REPLY_CLOSED")), failed = (error: Error) => finish(error);
    const timer = setTimeout(() => finish(new Error("PIPE_OWNER_REPLY_TIMEOUT")), 1000);
    socket.on("data", data); socket.once("end", ended); socket.once("close", ended); socket.once("error", failed);
    if (socket.destroyed || socket.readableEnded) ended();
  });
}

function pipeFailureDetails(failure: unknown): string {
  const detail = failure instanceof Error ? `${failure.message}\n${failure.stack ?? ""}` : String(failure);
  return failure instanceof AggregateError ? [detail, ...failure.errors.map(pipeFailureDetails)].join("\n") : detail;
}

function throwPipeFailures(failures: unknown[]) {
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, "PIPE_FIXTURE_FAILURES\n" + failures.map(pipeFailureDetails).join("\n"));
}

async function collectPipeFailures(action: () => Promise<unknown>, cleanup: (() => Promise<unknown>)[]) {
  const failures: unknown[] = [];
  try { await action(); } catch (error) { failures.push(error); }
  finally { for (const step of cleanup) try { await step(); } catch (error) { if (!failures.includes(error)) failures.push(error); } }
  throwPipeFailures(failures);
}

async function pipeOwnership() {
  const token = randomUUID(), server = createServer({ allowHalfOpen: true }), sockets = new Set<Socket>(), errors: Error[] = [];
  const authTimers = new Map<Socket, ReturnType<typeof setTimeout>>();
  let peer: Socket | undefined, stopped: Promise<void> | undefined;
  server.on("error", error => errors.push(error));
  server.on("connection", socket => {
    sockets.add(socket);
    socket.once("close", () => { sockets.delete(socket); clearTimeout(authTimers.get(socket)); authTimers.delete(socket); });
    socket.on("error", error => errors.push(error));
    socket.on("end", () => { if (socket === peer && !socket.destroyed && !socket.writableEnded) socket.end(); });
    authTimers.set(socket, setTimeout(() => { errors.push(new Error("PIPE_OWNER_AUTH_TIMEOUT")); socket.destroy(); }, 1000));
    let pending = "";
    const authenticate = (chunk: Buffer) => {
      pending += chunk.toString(); const end = pending.indexOf("\n"); if (end < 0) return;
      socket.off("data", authenticate); clearTimeout(authTimers.get(socket)); authTimers.delete(socket);
      const line = pending.slice(0, end);
      if (line !== token || peer) { errors.push(new Error("PIPE_OWNER_AUTH_FAILED")); socket.destroy(); }
      else { peer = socket; server.emit("owned"); }
    };
    socket.on("data", authenticate);
    if (stopped) { errors.push(new Error("PIPE_OWNER_UNAUTHENTICATED")); socket.destroy(); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  const source = `setTimeout(()=>process.exit(90),12000).unref();
const owner=require('node:net').connect(${port},'127.0.0.1');
let ownerClosed=false, naturallyDrained=false;
const endOwner=()=>{if(!owner.destroyed&&!owner.writableEnded)owner.end();};
owner.on('end',endOwner);
owner.on('error',error=>{console.error(error);process.exitCode=91;owner.destroy();});
owner.once('close',()=>{ownerClosed=true;});
process.once('beforeExit',()=>{naturallyDrained=ownerClosed;});
process.once('exit',code=>{if(code===0&&!naturallyDrained){process.exitCode=92;require('node:fs').writeSync(2,'PIPE_OWNER_EXIT_BEFORE_DRAIN\\n');}});
owner.on('data',()=>owner.write('alive\\n'));owner.write(${JSON.stringify(token + "\n")});`;
  return { source, port, token, async accepted() {
    if (!sockets.size) await once(server, "connection", { signal: AbortSignal.timeout(1000) });
  }, async probe() {
    if (!peer) await once(server, "owned", { signal: AbortSignal.timeout(6000) });
    assert.ok(peer && !peer.destroyed && !peer.writableEnded, "PIPE_OWNER_NOT_LIVE");
    const reply = pipeLine(peer);
    peer.write("probe\n");
    const result = await reply;
    assert.equal(result.line, "alive", "PIPE_OWNER_REPLY_MISSING"); return result.chunks;
  }, stop() {
    return stopped ??= (async () => {
      let grace: ReturnType<typeof setTimeout> | undefined, deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        await new Promise<void>(resolve => {
          server.close(() => resolve());
          for (const socket of sockets) {
            if (socket.destroyed) continue;
            if (socket !== peer) { errors.push(new Error("PIPE_OWNER_UNAUTHENTICATED")); socket.destroy(); }
            else if (!socket.destroyed && !socket.writableEnded) socket.end();
          }
          grace = setTimeout(() => {
            if (sockets.size) errors.push(new Error("PIPE_OWNER_STOP_TIMEOUT"));
            for (const socket of sockets) socket.destroy();
          }, 250);
          deadline = setTimeout(() => { errors.push(new Error("PIPE_OWNER_SERVER_CLOSE_TIMEOUT")); resolve(); }, 1000);
        });
      } finally {
        clearTimeout(grace); clearTimeout(deadline);
        for (const timer of authTimers.values()) clearTimeout(timer);
        authTimers.clear(); for (const socket of sockets) socket.destroy();
      }
      throwPipeFailures(errors);
    })();
  } };
}

async function ownedPipeTree(action: (root: string, owner: Awaited<ReturnType<typeof pipeOwnership>>) => Promise<void>) {
  await tree(async root => {
    const owner = await pipeOwnership(), outside = await pipeOwnership(), kill = process.kill;
    const control = spawn(process.execPath, ["-e", outside.source], { stdio: "ignore" });
    const exited = once(control, "exit");
    try {
      process.kill = () => { throw new Error("PIPE_FIXTURE_NUMERIC_TEARDOWN_FORBIDDEN"); };
      await collectPipeFailures(async () => { await outside.probe(); await action(root, owner); }, [
        () => owner.stop(), () => outside.probe(), // Unrelated live peer must survive fixture cleanup.
        () => outside.stop(), async () => assert.deepEqual(await exited, [0, null], "UNRELATED_CONTROL_EXIT_FORGED"),
      ]);
    } finally { process.kill = kill; }
  });
}

test("setup accepts non-detached descendants and retains both output pipes", async () => {
  await ownedPipeTree(async (root, owner) => {
    const pidFile = path.join(root, "owned-descendant.json"), run = setup.setupRunner(root, setup.isolatedEnv(root));
    const result = await run("attached-pipe-control", process.execPath, ["-e", pipeFixture, pidFile, "attached", owner.source], { timeout: 3000 });
    assert.equal(result.code, 0);
    assert.equal(result.signal, null);
    assert.equal(result.timedOut, false);
    assert.equal(result.state, "finished");
    assert.deepEqual(await readFile(result.stdout), Buffer.concat([Buffer.from("PARENT_OUTPUT\n"), Buffer.from([0, 255, 65])]));
    assert.equal(await readFile(result.stderr, "utf8"), "DESCENDANT_OUTPUT\n");
    await fixturePid(pidFile); // Readiness fact only, never signal authority.
  });
});

test("pipe ownership frames native fragmented replies and names premature close or missing reply", { timeout: 10000 }, async () => {
  for (const mode of ["normal", "fragmented", "closed", "silent"]) {
    const owner = await pipeOwnership(), socket = connect({ port: owner.port, host: "127.0.0.1" });
    let fragment: ReturnType<typeof setTimeout> | undefined;
    try {
      await once(socket, "connect"); socket.setNoDelay(); socket.write(owner.token + "\n");
      socket.once("data", () => {
        if (mode === "closed") socket.end("ali");
        else if (mode === "normal") socket.write("alive\n");
        else if (mode === "fragmented") { socket.write("al"); fragment = setTimeout(() => socket.write("ive\n"), 25); }
      });
      if (mode === "closed" || mode === "silent") await assert.rejects(owner.probe(), new RegExp(mode === "closed" ? "PIPE_OWNER_REPLY_CLOSED" : "PIPE_OWNER_REPLY_TIMEOUT"));
      else assert.ok(await owner.probe() >= (mode === "fragmented" ? 2 : 1), "FRAGMENTED_REPLY_CONTROL_NOT_EXERCISED");
    } finally { clearTimeout(fragment); socket.destroy(); await owner.stop(); }
  }
});

test("pipe ownership bounds half-open and unauthenticated native peers, caches rejection, restores global", { timeout: 15000 }, async t => {
  const kill = process.kill;
  for (const mode of ["half-open", "unauthenticated", "auth-timeout", "invalid"] as const) {
    let socket: Socket | undefined, fallback: ReturnType<typeof setTimeout> | undefined;
    let closed: Promise<void> | undefined;
    const peerErrors: NodeJS.ErrnoException[] = [];
    const original = new Error("PIPE_ACTION_FAILURE_CONTROL");
    let failure: unknown;
    const expected = { "half-open": "PIPE_OWNER_STOP_TIMEOUT", unauthenticated: "PIPE_OWNER_UNAUTHENTICATED", "auth-timeout": "PIPE_OWNER_AUTH_TIMEOUT", invalid: "PIPE_OWNER_AUTH_FAILED" }[mode]!;
    try {
      await assert.rejects(ownedPipeTree(async (_root, owner) => {
        socket = connect({ port: owner.port, host: "127.0.0.1", allowHalfOpen: true });
        socket.on("error", error => peerErrors.push(error));
        closed = new Promise(resolve => socket!.once("close", () => resolve()));
        fallback = setTimeout(() => socket?.destroy(), 2000); // Native peer also bounds broken cleanup mutants.
        await once(socket, "connect"); socket.resume(); await owner.accepted();
        if (mode === "half-open") {
          socket.on("data", () => socket!.write("alive\n")); socket.write(owner.token + "\n"); await owner.probe();
        } else if (mode !== "unauthenticated") {
          const ended = new Promise<void>(resolve => { socket!.once("end", resolve); socket!.once("close", () => resolve()); });
          if (mode === "invalid") socket.write("wrong-token\n");
          await ended; socket.destroy(); await closed;
        }
        const stopped = owner.stop(); assert.strictEqual(owner.stop(), stopped, "PIPE_STOP_SETTLEMENT_NOT_CACHED");
        await assert.rejects(stopped, (error: Error) => { assert.equal(error.message, expected, "PIPE_CLOSE_DID_NOT_SETTLE_AS_EXPECTED"); failure = error; return true; });
        await assert.rejects(owner.stop(), error => error === failure);
        throw original;
      }), (error: AggregateError) => {
        assert.ok(error instanceof AggregateError, `${mode}: ${error.stack}`); assert.strictEqual(error.errors[0], original);
        assert.equal(error.errors.length, 2, "PIPE_UNEXPECTED_CLEANUP_FAILURE");
        assert.equal(error.errors[1].message, expected);
        assert.strictEqual(error.errors[1], failure, "PIPE_CACHED_STOP_FAILURE_REPLACED"); return true;
      });
    } finally {
      clearTimeout(fallback); socket?.destroy(); await closed;
      assert.strictEqual(process.kill, kill, "PIPE_TEARDOWN_GLOBAL_NOT_RESTORED");
      for (const error of peerErrors) { assert.equal(error.code, "ECONNRESET", `Unexpected ${mode} peer error`); t.diagnostic(`${mode} forced-close peer: ${error.message}`); }
    }
  }
});

test("pipe teardown retains action and stop failures and awaits rejected running settlement", async () => {
  const original = new Error("ACTION_CONTROL"), stop = new Error("STOP_CONTROL"), nested = new Error("NESTED_RUNNING_CONTROL");
  const running = new AggregateError([nested], "RUNNING_CONTROL");
  let settled = false;
  await assert.rejects(collectPipeFailures(async () => { throw original; }, [
    async () => { throw stop; }, async () => { await new Promise(resolve => setImmediate(resolve)); settled = true; throw running; },
  ]), (error: AggregateError) => {
    assert.deepEqual(error.errors, [original, stop, running]);
    for (const failure of [original, stop, running, nested]) {
      assert.ok(error.message.includes(failure.message), "PIPE_FAILURE_MESSAGE_HIDDEN");
      assert.ok(error.message.includes(failure.stack!), "PIPE_FAILURE_STACK_HIDDEN");
    }
    return true;
  });
  assert.equal(settled, true, "PIPE_RUNNING_SETTLEMENT_SKIPPED");
});

test("setup timeout settles despite detached descendant holding stdout/stderr open", async () => {
  await ownedPipeTree(async (root, owner) => {
    const pidFile = path.join(root, "owned-descendant.json"), run = setup.setupRunner(root, setup.isolatedEnv(root));
    const running = run("detached-pipe-failure", process.execPath, ["-e", pipeFixture, pidFile, "detached", owner.source], { timeout: 3000 })
      .then((result: any) => ({ result, error: undefined }), (error: any) => ({ result: undefined, error }));
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    await collectPipeFailures(async () => {
      const outcome = await Promise.race([running, new Promise<never>((_, reject) => {
        watchdog = setTimeout(() => reject(new Error("SETUP_RUNNER_DEADLINE_MISSED: detached pipes held close open")), 9000);
      })]);
      assert.ok(outcome.error, "Detached pipe holder must fail by timeout");
      assert.match(outcome.error.message, /SETUP_FAILED: detached-pipe-failure: timeout/);
      const record = outcome.error.record;
      assert.equal(record.timedOut, true);
      assert.equal(record.state, "finished");
      // Parent really exited 7 before the deadline; timeout must retain that fact, not invent SIGKILL.
      assert.equal(record.code, 7);
      assert.equal(record.signal, null);
      assert.deepEqual(await readFile(record.stdout), Buffer.concat([Buffer.from("PARENT_OUTPUT\n"), Buffer.from([0, 255, 65])]));
      assert.equal(await readFile(record.stderr, "utf8"), "DESCENDANT_OUTPUT\n");
      const output = await readFile(record.output);
      assert.equal(output.length, Buffer.byteLength("PARENT_OUTPUT\nDESCENDANT_OUTPUT\n") + 3);
      assert.ok(output.includes(Buffer.from([0, 255, 65])) && output.includes(Buffer.from("DESCENDANT_OUTPUT\n")));
      const persisted = JSON.parse(await readFile(record.output.replace(/\.output$/, ".json"), "utf8"));
      assert.equal(persisted.state, "finished");
      assert.equal(persisted.timedOut, true);
      assert.equal(persisted.code, 7);
      assert.equal(persisted.signal, null);
      await fixturePid(pidFile);
      await owner.probe(); // Live authenticated descendant still holds its pipes.
    }, [async () => { clearTimeout(watchdog); await owner.stop(); }, async () => { await running; }]);
  });
});

test("controlled failures keep source bytes and foreign edits; marked owned images remain retained", async () => {
  await tree(async (root) => {
    for (const id of ids) for (const relative of ["src", "test", "tests"]) await mkdir(path.join(root, id, relative), { recursive: true });
    const original = Buffer.from([0, 255, ...Buffer.from("// original UTF-8 🦣\n")]);
    await writeFile(path.join(root, "itoa/src/lib.rs"), original);
    for (const id of ids) await writeFile(path.join(root, id, "fixture.txt"), "UPSTREAM_FIXTURE\n");
    const entries = cases(root), failures = entries.filter((entry) => entry.controlledFailure);
    assert.deepEqual(failures.map((entry) => entry.project).sort(), ["boltons", "gjson", "itoa", "ms", "ufo"]);
    for (const entry of failures) {
      assert.equal(entry.category, "control");
      assert.equal(entry.expectExit, "nonzero");
      const source = entry.cwd;
      if (process.platform === "win32") {
        await assert.rejects(entry.prepare(), { code: "CASE_WORKSPACE_UNSUPPORTED" });
        await entry.restore();
        assert.equal(entry.cwd, source);
        assert.equal(await readFile(path.join(source, "fixture.txt"), "utf8"), "UPSTREAM_FIXTURE\n");
        for (const { path: file } of entry.modifications) {
          if (entry.project === "itoa") assert.deepEqual(await readFile(path.join(source, file)), original);
          else await assert.rejects(readFile(path.join(source, file)), { code: "ENOENT" });
        }
        continue;
      }
      await entry.prepare();
      const owned = entry.cwd;
      assert.notEqual(owned, source);
      assert.deepEqual(entry.workspace, { source, cwd: owned, retained: true, sourceReadOnly: true });
      assert.equal(await readFile(path.join(owned, "fixture.txt"), "utf8"), "UPSTREAM_FIXTURE\n");
      assert.equal(JSON.parse(JSON.stringify(entry)).cwd, owned, "Serialized entry must read live cwd");
      await assert.rejects(entry.prepare(), /CASE_ALREADY_PREPARED/);
      for (const modification of entry.modifications) assert.ok((await readFile(path.join(entry.cwd, modification.path))).includes(Buffer.from("BENCH_EXPECTED_FAILURE")), entry.id);
      await writeFile(path.join(source, "fixture.txt"), "SOURCE_FOREIGN_EDIT\n");
      await writeFile(path.join(owned, "fixture.txt"), "RETAINED_FOREIGN_EDIT\n");
      await entry.restore();
      await entry.restore();
      assert.equal(entry.cwd, source);
      assert.equal(entry.workspace?.cwd, owned);
      assert.equal(await readFile(path.join(source, "fixture.txt"), "utf8"), "SOURCE_FOREIGN_EDIT\n");
      assert.equal(await readFile(path.join(owned, "fixture.txt"), "utf8"), "RETAINED_FOREIGN_EDIT\n");
      for (const modification of entry.modifications) {
        assert.ok((await readFile(path.join(owned, modification.path))).includes(Buffer.from("BENCH_EXPECTED_FAILURE")), entry.id);
        const file = path.join(entry.cwd, modification.path);
        if (entry.project === "itoa") assert.deepEqual(await readFile(file), original);
        else await assert.rejects(readFile(file), { code: "ENOENT" });
      }
    }
  });
});

test("file transaction refuses overwrite and rolls back a partially failed prepare", async () => {
  await tree(async (root) => {
    const original = Buffer.from("UPSTREAM_ORIGINAL\n");
    await writeFile(path.join(root, "original.txt"), original);
    const partial = workloads.edits(root, [
      { path: "original.txt", append: true, text: "FIRST_EDIT\n" }, { path: "absent-parent/new.txt", text: "SECOND_EDIT\n" },
    ]);
    await assert.rejects(partial.prepare(), { code: "ENOENT" });
    assert.deepEqual(await readFile(path.join(root, "original.txt")), original);
    const overwrite = workloads.edits(root, [{ path: "original.txt", text: "WRONG\n" }]);
    await assert.rejects(overwrite.prepare(), /CASE_WOULD_OVERWRITE/);
    assert.deepEqual(await readFile(path.join(root, "original.txt")), original);
    await assert.rejects(workloads.edits(root, [{ path: "absent.txt", append: true, text: "WRONG\n" }]).prepare(), { code: "ENOENT" });
  });
});

const licenseFixture = "Permission is hereby granted, free of charge, to any person obtaining a copy.\n";

async function localRepo(root: string): Promise<{ project: Project; run: Run }> {
  const directory = path.join(root, "hugr"), run = setup.setupRunner(root, setup.isolatedEnv(root));
  await mkdir(directory);
  await writeFile(path.join(directory, "README.md"), "UPSTREAM_README 🦣\n");
  await writeFile(path.join(directory, "PLAN.md"), "UPSTREAM_PLAN\n");
  await writeFile(path.join(directory, "LICENSE"), licenseFixture);
  await run("repo-init", "git", ["init"], { cwd: directory });
  await run("repo-add", "git", ["add", "--", "README.md", "PLAN.md", "LICENSE"], { cwd: directory });
  await run("repo-commit", "git", ["commit", "-m", "test: create offline project fixture"], { cwd: directory });
  const head = (await run("repo-head", "git", ["rev-parse", "HEAD"], { cwd: directory })).text.trim();
  return { run, project: { id: "hugr", path: directory, commit: head, license: "MIT", licensePaths: ["LICENSE"], sourcePaths: ["README.md"] } };
}

test("clean verification checks real Git HEAD/status and license files, not metadata alone", async () => {
  await tree(async (root) => {
    const { project, run } = await localRepo(root);
    const verified = await setup.verifyCheckout(project, run);
    assert.equal(verified.verifiedHead, project.commit);
    assert.equal(verified.cleanBeforeSetup, true);
    assert.deepEqual(verified.licenseFiles, [{ path: "LICENSE", bytes: Buffer.byteLength(licenseFixture),
      sha256: createHash("sha256").update(licenseFixture).digest("hex") }]);
    await assert.rejects(setup.verifyCheckout({ ...project, commit: "f".repeat(40) }, run), /SETUP_HEAD_MISMATCH: hugr/);
    await assert.rejects(setup.verifyCheckout({ ...project, commit: "main" }, run), /SETUP_INVALID_PIN: hugr/);
    await assert.rejects(setup.verifyCheckout({ ...project, licensePaths: ["ABSENT_LICENSE"] }, run), { code: "ENOENT" });
    await assert.rejects(setup.verifyCheckout({ ...project, license: "BSD-3-Clause" }, run), /SETUP_LICENSE_MISMATCH: hugr: BSD-3-Clause/);
    await writeFile(path.join(project.path, "README.md"), "DIRTY_CONTROL\n");
    await assert.rejects(setup.verifyCheckout(project, run), /SETUP_DIRTY_CHECKOUT: hugr/);
  });
});

test("mixed status stages only owned README; source index and retained foreign edits survive restore", async () => {
  await tree(async (root) => {
    const { project, run } = await localRepo(root), readme = await readFile(path.join(project.path, "README.md")), plan = await readFile(path.join(project.path, "PLAN.md"));
    const mixed = cases(root, run).find((entry) => entry.id === "git-status-mixed");
    assert.ok(mixed);
    assert.equal(mixed.category, "control");
    const index = await readFile(path.join(project.path, ".git/index"));
    await mixed.restore();
    let owned: string | undefined;
    if (process.platform === "win32") {
      await assert.rejects(mixed.prepare(), { code: "CASE_WORKSPACE_UNSUPPORTED" });
      await mixed.restore();
    } else {
      await mixed.prepare();
      owned = mixed.cwd;
      assert.notEqual(owned, project.path);
      assert.deepEqual(await readFile(path.join(project.path, ".git/index")), index);
      assert.deepEqual(await readFile(path.join(project.path, "README.md")), readme);
      assert.deepEqual(await readFile(path.join(project.path, "PLAN.md")), plan);
      await assert.rejects(mixed.prepare(), /CASE_ALREADY_PREPARED/);
      try {
        const staged = (await run("probe-staged", "git", ["diff", "--cached", "--name-only"], { cwd: mixed.cwd })).text;
        assert.equal(staged, "README.md\n");
        const status = (await run("probe-mixed", "git", ["status", "--porcelain=v1"], { cwd: mixed.cwd })).text;
        assert.ok(status.includes("M  README.md\n") && status.includes(" M PLAN.md\n") && status.includes("?? bench-untracked.txt\n"), status);
      } finally { await mixed.restore(); }
      assert.equal((await run("probe-retained-stage", "git", ["diff", "--cached", "--name-only"], { cwd: owned })).text, "README.md\n");
      assert.equal(await readFile(path.join(owned, "bench-untracked.txt"), "utf8"), "HuGR benchmark untracked control.\n");
    }
    assert.equal(mixed.cwd, project.path);
    assert.deepEqual(await readFile(path.join(project.path, ".git/index")), index);
    assert.deepEqual(await readFile(path.join(project.path, "README.md")), readme);
    assert.deepEqual(await readFile(path.join(project.path, "PLAN.md")), plan);
    assert.equal((await run("probe-restored", "git", ["--no-optional-locks", "status", "--porcelain=v1"], { cwd: project.path })).text, "");
    await writeFile(path.join(project.path, "README.md"), "UNRELATED_USER_CHANGE\n");
    if (owned) await writeFile(path.join(owned, "PLAN.md"), "RETAINED_FOREIGN_CHANGE\n");
    await run("probe-user-stage", "git", ["add", "--", "README.md"], { cwd: project.path });
    const userIndex = await readFile(path.join(project.path, ".git/index"));
    await assert.rejects(mixed.prepare(), /CASE_DIRTY_CHECKOUT: git-status-mixed/);
    await mixed.restore();
    assert.equal(await readFile(path.join(project.path, "README.md"), "utf8"), "UNRELATED_USER_CHANGE\n");
    assert.deepEqual(await readFile(path.join(project.path, ".git/index")), userIndex);
    if (owned) assert.equal(await readFile(path.join(owned, "PLAN.md"), "utf8"), "RETAINED_FOREIGN_CHANGE\n");
    assert.equal((await run("probe-user-index", "git", ["diff", "--cached", "--name-only"], { cwd: project.path })).text, "README.md\n");
  });
});

test("mixed status failed owned staging resets cwd without source writes or unstaging", async () => {
  await tree(async (root) => {
    const { project, run } = await localRepo(root), index = await readFile(path.join(project.path, ".git/index"));
    const failure = new Error("CONTROL_STAGE_FAILED");
    const mixed = cases(root, async (name, file, args, options) => {
      if (name === "prepare-git-status-mixed") {
        assert.notEqual(options?.cwd, project.path);
        await run(name, file, args, options);
        throw failure;
      }
      assert.deepEqual(args, ["--no-optional-locks", "status", "--porcelain=v1", "--untracked-files=all"]);
      return run(name, file, args, options);
    }).find((entry) => entry.id === "git-status-mixed");
    assert.ok(mixed);
    await assert.rejects(mixed.prepare(), process.platform === "win32" ? { code: "CASE_WORKSPACE_UNSUPPORTED" } : (error) => error === failure);
    await mixed.restore();
    assert.equal(mixed.cwd, project.path);
    assert.deepEqual(await readFile(path.join(project.path, ".git/index")), index);
    assert.equal(await readFile(path.join(project.path, "README.md"), "utf8"), "UPSTREAM_README 🦣\n");
    if (process.platform !== "win32") {
      assert.ok(mixed.workspace?.cwd);
      assert.equal((await run("probe-failed-stage", "git", ["diff", "--cached", "--name-only"], { cwd: mixed.workspace.cwd })).text, "README.md\n");
    }
  });
});

test("setup rejects a nonempty prepared root without consuming or overwriting its contents", async () => {
  await tree(async (root) => {
    await writeFile(path.join(root, "RETAIN_ME"), "ORIGINAL\n");
    await assert.rejects(setup.setupProjects(root, { repoRoot: root }), /SETUP_ROOT_NOT_EMPTY/);
    assert.deepEqual(await readdir(root), ["RETAIN_ME"]);
    assert.equal(await readFile(path.join(root, "RETAIN_ME"), "utf8"), "ORIGINAL\n");
  });
});
