import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Duplex } from "node:stream";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const { runOwnedProcess } = await import(new URL("../scripts/real-world/owned-process.mjs", import.meta.url).href);
const { captureCommand } = await import(new URL("../scripts/real-world/capture.mjs", import.meta.url).href);
const { setupRunner } = await import(new URL("../scripts/real-world/setup.mjs", import.meta.url).href);
const posix = { skip: process.platform === "win32", timeout: 10000 }; // Native POSIX guardian only.

async function delayedGuardian(fault: boolean, run: (root: string) => Promise<any>) {
  const root = await mkdtemp(path.join(tmpdir(), "lean-guardian-startup-"));
  const spawn = childProcess.spawn, timer = globalThis.setTimeout;
  let guardian: ReturnType<typeof spawn> | undefined, transport: Duplex | undefined;
  let exited: Promise<unknown> | undefined, watchdog: (() => void) | undefined;
  let watchdogs = 0, launches = 0, heldMs = 0;
  const trace: string[] = [];
  try {
    const loader = path.join(root, "delay.mjs");
    await writeFile(loader, `
import { Socket } from 'node:net';
// Self-owned fallback bounds broken implementations too; no parent PID cleanup.
setTimeout(() => process.exit(90), 3000).unref();
const socket = new Socket({ fd: 4, readable: true, writable: true });
const disconnected = () => socket.write('disconnected\\n');
process.once('disconnect', disconnected);
await new Promise(resolve => {
  socket.once('data', data => { if (data.toString() === 'release\\n') resolve(); });
  socket.write('blocked\\n');
});
process.removeListener('disconnect', disconnected);
socket.end('released:' + process.connected + '\\n');
`);
    globalThis.setTimeout = ((callback: (...args: any[]) => void, delay?: number, ...args: any[]) => {
      if (delay !== 5000) return timer(callback, delay, ...args);
      watchdogs++;
      const handle = timer(callback, 5000, ...args);
      watchdog = () => { clearTimeout(handle); timer(callback, 1, ...args); };
      return handle;
    }) as typeof setTimeout;
    childProcess.spawn = ((file: string, args: string[], options: any) => {
      const start = performance.now();
      guardian = spawn(file, ["--import", pathToFileURL(loader).href, ...args], { ...options, stdio: [...options.stdio, "pipe"] });
      exited = new Promise(resolve => guardian!.once("exit", (code, signal) => resolve({ code, signal })));
      const send = guardian.send;
      guardian.send = ((message: any, ...rest: any[]) => {
        if (message.type === "launch") launches++;
        return Reflect.apply(send, guardian, [message, ...rest]);
      }) as typeof send;
      transport = guardian.stdio[4] as Duplex;
      let pending = "";
      transport.on("data", (chunk: Buffer) => {
        pending += chunk.toString();
        let end;
        while ((end = pending.indexOf("\n")) !== -1) {
          const message = pending.slice(0, end); pending = pending.slice(end + 1); trace.push(message);
          if (message === "blocked") {
            if (fault) watchdog!();
            else timer(() => { heldMs = performance.now() - start; transport!.write("release\n"); }, 75);
          } else if (message === "disconnected") transport!.write("release\n");
        }
      });
      return guardian;
    }) as typeof spawn;
    syncBuiltinESMExports();
    const result = await run(root);
    const exit = await exited; // Observe actual guardian termination, including mutant fallback.
    assert.equal(watchdogs, 1, "STARTUP_WATCHDOG_SEAM_NOT_EXERCISED");
    assert.deepEqual(trace, fault ? ["blocked", "disconnected", "released:false"] : ["blocked", "released:true"]);
    assert.equal(launches, fault ? 0 : 1, "UNEXPECTED_NATIVE_LAUNCH_REQUEST");
    assert.deepEqual(exit, fault ? { code: null, signal: "SIGKILL" } : { code: 0, signal: null }, "GUARDIAN_REQUIRED_FALLBACK_EXIT");
    return { result, heldMs };
  } finally {
    childProcess.spawn = spawn; globalThis.setTimeout = timer; syncBuiltinESMExports();
    if (guardian?.connected) guardian.disconnect();
    if (transport && !transport.destroyed) transport.end("release\n");
    await exited; // Fixture fallback owns cleanup even when assertions fail.
    transport?.destroy();
    await rm(root, { recursive: true, force: true });
  }
}

function unknownDuration(record: any) {
  assert.equal(record.durationMs, null, "UNSTARTED_NATIVE_HAS_FAKE_DURATION");
  assert.ok(Number.isFinite(record.guardianElapsedMs) && record.guardianElapsedMs > 0);
  assert.equal(record.durationBoundary, "guardian-loss");
  assert.equal(record.nativeSpawned, false); assert.equal(record.nativeExitObserved, false);
  assert.equal(record.signal, null); assert.equal(record.exitDurationMs, undefined);
  assert.deepEqual(record.killErrors, ["GUARDIAN_STARTUP_TIMEOUT: native launch facts unavailable"]);
}

test("startup disconnect before listener exits guardian without native launch or duration", posix, async () => {
  const callbacks: string[] = [];
  const { result } = await delayedGuardian(true, root => runOwnedProcess(process.execPath, ["-e", "process.exit(7)"], {
    cwd: root, env: process.env, timeout: 1000, onSpawn: () => callbacks.push("spawn"), onExit: () => callbacks.push("exit"),
  }));
  unknownDuration(result); assert.equal(result.code, null); assert.equal(result.spawnError, undefined);
  assert.equal(result.timedOut, false); assert.deepEqual(callbacks, []);
});

test("startup release preserves native bytes and exit while excluding guardian delay", posix, async () => {
  const stdout: Buffer[] = [], stderr: Buffer[] = [], exits: unknown[] = [];
  const { result, heldMs } = await delayedGuardian(false, root => runOwnedProcess(process.execPath, ["-e",
    "process.stdout.write(Buffer.from([0,255,10]));process.stderr.write('native-error');process.exitCode=7;"], {
    cwd: root, env: process.env, timeout: 1000, onStdout: (b: Buffer) => stdout.push(b), onStderr: (b: Buffer) => stderr.push(b),
    onExit: (code: number, signal: string | null) => exits.push([code, signal]),
  }));
  assert.deepEqual(Buffer.concat(stdout), Buffer.from([0, 255, 10])); assert.deepEqual(Buffer.concat(stderr), Buffer.from("native-error"));
  assert.deepEqual(exits, [[7, null]]); assert.equal(result.code, 7); assert.equal(result.signal, null);
  assert.equal(result.nativeSpawned, true); assert.equal(result.nativeExitObserved, true);
  assert.equal(result.timedOut, false); assert.deepEqual(result.killErrors, []);
  assert.equal(typeof result.durationMs, "number"); assert.ok(result.durationMs >= result.exitDurationMs);
  assert.ok(heldMs >= 75 && result.guardianElapsedMs - result.durationMs >= heldMs, "STARTUP_COUNTED_AS_NATIVE_RUNTIME");
});

test("startup failure capture stays incomplete with null native duration", posix, async () => {
  const { result } = await delayedGuardian(true, root => captureCommand({ command: "exit 7", cwd: root }, process.env, { timeout: 1000 }));
  unknownDuration(result); assert.equal(result.complete, false); assert.equal(result.exitCode, null);
  assert.deepEqual(result.raw, Buffer.alloc(0)); assert.equal(result.launchError, undefined);
});

test("startup failure setup persists null duration and guardian elapsed in failed record", posix, async () => {
  const { result } = await delayedGuardian(true, async root => {
    try { await setupRunner(root, process.env)("startup", process.execPath, ["-e", "process.exit(0)"], { timeout: 1000 }); }
    catch (error: any) {
      assert.match(error.message, /^SETUP_FAILED: startup:/);
      const saved = JSON.parse(await readFile(error.record.output.replace(/\.output$/, ".json"), "utf8"));
      assert.deepEqual(saved, error.record); assert.deepEqual(await readFile(saved.output), Buffer.alloc(0));
      return saved;
    }
    assert.fail("STARTUP_FAILURE_REPORTED_SUCCESS");
  });
  unknownDuration(result); assert.equal(result.code, null);
});
