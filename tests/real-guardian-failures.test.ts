import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { bounded, nativeDeadline, ownershipChannel } from "./process-readiness.js";

const { runOwnedProcess } = await import(new URL("../scripts/real-world/owned-process.mjs", import.meta.url).href);

test("forged IPC cannot supply native exit facts or trigger group cleanup", { skip: process.platform === "win32" }, async () => {
  const spawn = childProcess.spawn;
  const exits: unknown[] = [];
  let guardian: ReturnType<typeof spawn> | undefined;
  try {
    childProcess.spawn = ((...args: any[]) => {
      guardian = Reflect.apply(spawn, childProcess, args);
      guardian!.on("message", (message: any) => {
        if (message.type !== "spawn") return;
        guardian!.emit("message", { type: "exit", token: "forged", code: 0, signal: null });
        guardian!.send({ type: "cleanup", token: "forged", signal: "SIGKILL" });
      });
      return guardian;
    }) as typeof spawn;
    syncBuiltinESMExports();
    const record = await bounded<any>(runOwnedProcess(process.execPath, ["-e", "setTimeout(()=>process.exit(7),500)"], {
      cwd: tmpdir(), env: process.env, timeout: 5000, onExit: (code: number, signal: string | null) => exits.push([code, signal]),
    }), "FORGED_IPC_RESULT_MISSING");
    assert.deepEqual(exits, [[7, null]], "FORGED_EXIT_CALLBACK_ACCEPTED");
    assert.equal(record.code, 7); assert.equal(record.signal, null); assert.equal(record.timedOut, false);
    assert.deepEqual(record.killErrors, []);
  } finally { childProcess.spawn = spawn; syncBuiltinESMExports(); }
});

test("channel loss after native launch preserves bytes, names failure, never becomes spawnError", { skip: process.platform === "win32" }, async () => {
  const spawn = childProcess.spawn;
  const bytes: Buffer[] = [];
  let guardian: ReturnType<typeof spawn> | undefined;
  try {
    childProcess.spawn = ((...args: any[]) => { guardian = Reflect.apply(spawn, childProcess, args); return guardian; }) as typeof spawn;
    syncBuiltinESMExports();
    const record = await bounded<any>(runOwnedProcess(process.execPath, ["-e", "process.stdout.write('native-prefix');setInterval(()=>{},1000)"], {
      cwd: tmpdir(), env: process.env, timeout: 5000,
      onStdout: (chunk: Buffer) => { bytes.push(chunk); guardian!.disconnect(); },
    }), "CHANNEL_LOSS_RESULT_MISSING");
    assert.deepEqual(Buffer.concat(bytes), Buffer.from("native-prefix"));
    assert.equal(record.spawnError, undefined); assert.equal(record.code, null); assert.equal(record.signal, null);
    assert.equal(record.durationBoundary, "guardian-loss");
    assert.ok(record.killErrors.some((message: string) => message.startsWith("GUARDIAN_CHANNEL_LOST:")));
  } finally { childProcess.spawn = spawn; syncBuiltinESMExports(); }
});

async function injectedGuardian(preload: string) {
  const root = await mkdtemp(path.join(tmpdir(), "lean-guardian-fault-")), spawn = childProcess.spawn;
  const ownership = await ownershipChannel(), deadline = nativeDeadline(), failures: unknown[] = [];
  let guardian: ReturnType<typeof spawn> | undefined;
  let exited: Promise<unknown> | undefined;
  try {
    const loader = path.join(root, "fault.mjs"); await writeFile(loader, preload);
    childProcess.spawn = ((file: string, args: string[], options: any) => {
      guardian = spawn(file, ["--import", pathToFileURL(loader).href, ...args], options);
      exited = new Promise(resolve => guardian!.once("exit", resolve)); return guardian;
    }) as typeof spawn;
    syncBuiltinESMExports();
    const stdout: Buffer[] = [];
    let ready!: () => void;
    const prefix = new Promise<void>(resolve => { ready = resolve; });
    const running = runOwnedProcess(process.execPath, ["-e", "process.stdout.write('launched');" + ownership.source], {
      cwd: root, env: process.env, timeout: 500, onStdout: (chunk: Buffer) => { stdout.push(chunk); if (Buffer.concat(stdout).equals(Buffer.from("launched"))) ready(); },
    });
    await bounded(prefix, "NATIVE_LAUNCHED_PREFIX_MISSING"); await ownership.ping(); await deadline.fire();
    const result = await bounded<any>(running, "FAULT_RESULT_MISSING");
    assert.deepEqual(Buffer.concat(stdout), Buffer.from("launched"));
    assert.equal(result.timedOut, true); assert.equal(result.spawnError, undefined);
    assert.equal(result.code, null); assert.equal(result.signal, null); assert.equal(result.exitDurationMs, undefined);
    return result;
  } catch (error) { failures.push(error); }
  finally {
    childProcess.spawn = spawn; deadline.restore(); syncBuiltinESMExports();
    if (guardian?.connected) guardian.disconnect();
    try { await ownership.stop(); } catch (error) { failures.push(error); }
    try { if (exited) await bounded(exited, "FAULT_GUARDIAN_EXIT_MISSING"); } catch (error) { failures.push(error); }
    await rm(root, { recursive: true, force: true });
    if (failures.length) throw new AggregateError(failures, `FAULT_FIXTURE_FAILURES: ${failures.map(String).join("; ")}`);
  }
}

test("live guardian reports POSIX cleanup EPERM and unconfirmed escalation, not native launch failure", { skip: process.platform === "win32", timeout: 10000 }, async () => {
  const record = await injectedGuardian("process.kill=()=>{throw Object.assign(new Error('CONTROLLED_SIGNAL_DENIAL'),{code:'EPERM'})}");
  assert.deepEqual(record.killErrors, ["SIGTERM: EPERM: CONTROLLED_SIGNAL_DENIAL", "SIGKILL: EPERM: CONTROLLED_SIGNAL_DENIAL", "GUARDIAN_CLEANUP_UNCONFIRMED: escalation did not terminate guardian"]);
});

test("simulated Windows missing tree capability plus post-spawn kill EPERM stay cleanup errors", { skip: process.platform === "win32", timeout: 10000 }, async () => {
  const record = await injectedGuardian(`
Object.defineProperty(process,'platform',{value:'win32'});
const cp=await import('node:child_process');
cp.ChildProcess.prototype.kill=function(){this.emit('error',Object.assign(new Error('CONTROLLED_HANDLE_DENIAL'),{code:'EPERM'}));return false};
`);
  assert.deepEqual(record.killErrors, ["SETUP_TREE_CLEANUP_UNSUPPORTED: authenticated Windows tree identity unavailable", "EPERM: CONTROLLED_HANDLE_DENIAL"]);
});

test("native timeout registration and duration follow released startup and authenticated spawn", { skip: process.platform === "win32", timeout: 10000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-guardian-startup-")), spawn = childProcess.spawn;
  const deadline = nativeDeadline(), trace: string[] = [], failures: unknown[] = [];
  let guardian: ReturnType<typeof spawn> | undefined, exited: Promise<unknown> | undefined;
  let heldMs = 0, released = 0n, started = 0n;
  try {
    const loader = path.join(root, "delay.mjs"); await writeFile(loader, `
setTimeout(()=>process.exit(90),8000).unref();
await new Promise(resolve=>{process.once('message',m=>{if(m.fixtureRelease)resolve()});process.send({type:'blocked'})});
`);
    childProcess.spawn = ((file: string, args: string[], options: any) => {
      const start = process.hrtime.bigint();
      guardian = spawn(file, ["--import", pathToFileURL(loader).href, ...args], options);
      exited = new Promise(resolve => guardian!.once("exit", (code, signal) => resolve({ code, signal })));
      guardian.on("message", (message: any) => {
        trace.push(message.type);
        if (message.type === "blocked") {
          if (deadline.count !== 0) failures.push(new Error("NATIVE_TIMEOUT_ARMED_BEFORE_LAUNCH"));
          released = process.hrtime.bigint(); heldMs = Number(released - start) / 1e6;
          guardian!.send({ fixtureRelease: true });
        } else if (message.type === "spawn") {
          // This listener runs before owned-process handles the authenticated spawn.
          if (message.token !== args.at(-1)) failures.push(new Error("NATIVE_SPAWN_TOKEN_MISMATCH"));
          else if (deadline.count !== 0) failures.push(new Error("NATIVE_TIMEOUT_BEFORE_AUTHENTICATED_SPAWN"));
          started = BigInt(message.started);
        }
      });
      return guardian;
    }) as typeof spawn;
    syncBuiltinESMExports();
    const record = await bounded<any>(runOwnedProcess(process.execPath, ["-e", "process.exit(7)"], { cwd: root, env: process.env, timeout: 200 }), "STARTUP_RESULT_MISSING");
    assert.equal(deadline.count, 1, "NATIVE_TIMEOUT_SEAM_COUNT");
    assert.deepEqual(failures, []); assert.deepEqual(trace, ["blocked", "ready", "spawn", "exit"]);
    assert.ok(deadline.milliseconds >= 1 && deadline.milliseconds <= 200);
    assert.ok(started >= released && released > 0n, "NATIVE_STARTED_BEFORE_RELEASE");
    assert.equal(record.timedOut, false); assert.equal(record.code, 7); assert.equal(record.signal, null);
    assert.ok(record.guardianElapsedMs - record.durationMs >= heldMs, "GUARDIAN_STARTUP_INCLUDED_IN_NATIVE_DURATION");
    assert.deepEqual(await bounded(exited!, "STARTUP_GUARDIAN_EXIT_MISSING"), { code: 0, signal: null });
  } finally {
    childProcess.spawn = spawn; deadline.restore(); syncBuiltinESMExports();
    if (guardian?.connected) guardian.disconnect();
    if (exited) await bounded(exited, "STARTUP_TEARDOWN_EXIT_MISSING");
    await rm(root, { recursive: true, force: true });
  }
});

test("native NODE_OPTIONS executes once, with literal argv, cwd and environment", { skip: process.platform === "win32" }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-guardian-literal-"));
  try {
    const preload = path.join(root, "native.cjs"); await writeFile(preload, "process.stdout.write('preload:');");
    const env = { NODE_OPTIONS: `--require ${JSON.stringify(preload)}`, NATIVE_SENTINEL: "literal" }, chunks: Buffer[] = [];
    const source = "process.stdout.write(JSON.stringify({argv:process.argv.slice(1),cwd:process.cwd(),env:process.env}));";
    const args = ["-e", source, "space arg", "--literal"];
    const direct = await bounded(new Promise<Buffer>((resolve, reject) => {
      const child = childProcess.spawn(process.execPath, args, { cwd: root, env, stdio: ["ignore", "pipe", "ignore"] }), bytes: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => bytes.push(chunk)); child.once("error", reject);
      child.once("close", (code) => code === 0 ? resolve(Buffer.concat(bytes)) : reject(new Error("DIRECT_NATIVE_CONTROL_FAILED")));
    }), "DIRECT_NATIVE_RESULT_MISSING");
    const record = await bounded<any>(runOwnedProcess(process.execPath, args, {
      cwd: root, env, timeout: 5000, onStdout: (chunk: Buffer) => chunks.push(chunk),
    }), "LITERAL_NATIVE_RESULT_MISSING");
    const text = Buffer.concat(chunks).toString();
    assert.ok(text.startsWith("preload:"), "NATIVE_PRELOAD_CONTROL_MISSING");
    const native = JSON.parse(text.slice("preload:".length));
    assert.deepEqual(native.argv, ["space arg", "--literal"]); assert.equal(native.cwd, await realpath(root));
    for (const [key, value] of Object.entries(env)) assert.equal(native.env[key], value);
    assert.deepEqual(Buffer.concat(chunks), direct, "GUARDIAN_CHANGED_NATIVE_ENV_OR_DUPLICATED_PRELOAD"); // OS-added env is decided by direct native control.
    assert.equal(record.code, 0); assert.equal(record.nativeSpawned, true); assert.equal(record.nativeExitObserved, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
