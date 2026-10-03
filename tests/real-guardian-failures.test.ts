import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

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
    const record = await runOwnedProcess(process.execPath, ["-e", "setTimeout(()=>process.exit(7),500)"], {
      cwd: tmpdir(), env: process.env, timeout: 5000, onExit: (code: number, signal: string | null) => exits.push([code, signal]),
    });
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
    const record = await runOwnedProcess(process.execPath, ["-e", "process.stdout.write('native-prefix');setInterval(()=>{},1000)"], {
      cwd: tmpdir(), env: process.env, timeout: 5000,
      onStdout: (chunk: Buffer) => { bytes.push(chunk); guardian!.disconnect(); },
    });
    assert.deepEqual(Buffer.concat(bytes), Buffer.from("native-prefix"));
    assert.equal(record.spawnError, undefined); assert.equal(record.code, null); assert.equal(record.signal, null);
    assert.equal(record.durationBoundary, "guardian-loss");
    assert.ok(record.killErrors.some((message: string) => message.startsWith("GUARDIAN_CHANNEL_LOST:")));
  } finally { childProcess.spawn = spawn; syncBuiltinESMExports(); }
});

async function injectedGuardian(preload: string) {
  const root = await mkdtemp(path.join(tmpdir(), "lean-guardian-fault-")), spawn = childProcess.spawn;
  let guardian: ReturnType<typeof spawn> | undefined;
  try {
    const loader = path.join(root, "fault.mjs"); await writeFile(loader, preload);
    childProcess.spawn = ((file: string, args: string[], options: any) => {
      guardian = spawn(file, ["--import", pathToFileURL(loader).href, ...args], options); return guardian;
    }) as typeof spawn;
    syncBuiltinESMExports();
    const stdout: Buffer[] = [];
    // Fixture self-terminates even when injected cleanup denies all signals. No saved PID teardown.
    const result = await runOwnedProcess(process.execPath, ["-e", "process.stdout.write('launched');setTimeout(()=>process.exit(9),3200)"], {
      cwd: root, env: process.env, timeout: 500, onStdout: (chunk: Buffer) => stdout.push(chunk),
    });
    assert.deepEqual(Buffer.concat(stdout), Buffer.from("launched"));
    assert.equal(result.timedOut, true); assert.equal(result.spawnError, undefined);
    assert.equal(result.code, null); assert.equal(result.signal, null); assert.equal(result.exitDurationMs, undefined);
    return result;
  } finally {
    childProcess.spawn = spawn; syncBuiltinESMExports();
    if (guardian?.connected) guardian.disconnect();
    await rm(root, { recursive: true, force: true });
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

test("native timeout and duration exclude independently delayed guardian startup", { skip: process.platform === "win32", timeout: 10000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-guardian-startup-")), spawn = childProcess.spawn;
  try {
    const loader = path.join(root, "delay.mjs"); await writeFile(loader, "await new Promise(resolve=>setTimeout(resolve,600));");
    childProcess.spawn = ((file: string, args: string[], options: any) => spawn(file, ["--import", pathToFileURL(loader).href, ...args], options)) as typeof spawn;
    syncBuiltinESMExports();
    const start = performance.now();
    const record = await runOwnedProcess(process.execPath, ["-e", "process.exit(7)"], { cwd: root, env: process.env, timeout: 200 });
    assert.ok(performance.now() - start >= 600, "GUARDIAN_STARTUP_DELAY_CONTROL_MISSING");
    assert.equal(record.timedOut, false); assert.equal(record.code, 7); assert.equal(record.signal, null);
    assert.ok(record.durationMs < 200, "GUARDIAN_STARTUP_INCLUDED_IN_NATIVE_DURATION");
  } finally { childProcess.spawn = spawn; syncBuiltinESMExports(); await rm(root, { recursive: true, force: true }); }
});

test("native NODE_OPTIONS executes once, with literal argv, cwd and environment", { skip: process.platform === "win32" }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-guardian-literal-"));
  try {
    const preload = path.join(root, "native.cjs"); await writeFile(preload, "process.stdout.write('preload:');");
    const env = { NODE_OPTIONS: `--require ${JSON.stringify(preload)}`, NATIVE_SENTINEL: "literal" }, chunks: Buffer[] = [];
    const source = "process.stdout.write(JSON.stringify({argv:process.argv.slice(1),cwd:process.cwd(),env:process.env}));";
    const args = ["-e", source, "space arg", "--literal"];
    const direct = await new Promise<Buffer>((resolve, reject) => {
      const child = childProcess.spawn(process.execPath, args, { cwd: root, env, stdio: ["ignore", "pipe", "ignore"] }), bytes: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => bytes.push(chunk)); child.once("error", reject);
      child.once("close", (code) => code === 0 ? resolve(Buffer.concat(bytes)) : reject(new Error("DIRECT_NATIVE_CONTROL_FAILED")));
    });
    const record = await runOwnedProcess(process.execPath, args, {
      cwd: root, env, timeout: 5000, onStdout: (chunk: Buffer) => chunks.push(chunk),
    });
    const text = Buffer.concat(chunks).toString();
    assert.ok(text.startsWith("preload:"), "NATIVE_PRELOAD_CONTROL_MISSING");
    const native = JSON.parse(text.slice("preload:".length));
    assert.deepEqual(native.argv, ["space arg", "--literal"]); assert.equal(native.cwd, await realpath(root));
    for (const [key, value] of Object.entries(env)) assert.equal(native.env[key], value);
    assert.deepEqual(Buffer.concat(chunks), direct, "GUARDIAN_CHANGED_NATIVE_ENV_OR_DUPLICATED_PRELOAD"); // OS-added env is decided by direct native control.
    assert.equal(record.code, 0); assert.equal(record.nativeSpawned, true); assert.equal(record.nativeExitObserved, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
