import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { bounded, nativeDeadline } from "./process-readiness.js";

const { runOwnedProcess } = await import(new URL("../scripts/real-world/owned-process.mjs", import.meta.url).href);

test("Windows setup path retains native bytes and prompt exit; simulated Windows elsewhere, not tree proof", async () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  try {
    Object.defineProperty(process, "platform", { ...platform, value: "win32" });
    const chunks: Buffer[] = [];
    const record = await runOwnedProcess(process.execPath, ["-e", "require('node:fs').writeSync(1,Buffer.from([0,255,65]));process.exit(7)"], {
      cwd: tmpdir(), env: process.env, timeout: 5000, onStdout: (chunk: Buffer) => chunks.push(chunk),
    });
    assert.deepEqual(Buffer.concat(chunks), Buffer.from([0, 255, 65]));
    assert.equal(record.code, 7); assert.equal(record.signal, null); assert.equal(record.timedOut, false);
    assert.equal(record.nativeSpawned, true); assert.equal(record.nativeExitObserved, true);
    assert.equal(record.durationBoundary, "pipe-close"); assert.deepEqual(record.killErrors, []);
  } finally { Object.defineProperty(process, "platform", platform); }
});

test("Windows missing tree capability plus successful spawn then handle EPERM are cleanup errors", { timeout: 10000 }, async () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!, spawn = childProcess.spawn, kill = process.kill;
  let fallback = 0;
  try {
    Object.defineProperty(process, "platform", { ...platform, value: "win32" });
    process.kill = () => { throw new Error("NUMERIC_TREE_AUTHORITY_FORBIDDEN"); };
    childProcess.spawn = ((...args: any[]) => {
      const child = Reflect.apply(spawn, childProcess, args);
      child.kill = () => {
        fallback++; child.emit("error", Object.assign(new Error("CONTROLLED_HANDLE_DENIAL"), { code: "EPERM" })); return false;
      };
      return child;
    }) as typeof spawn;
    syncBuiltinESMExports();
    const chunks: Buffer[] = [];
    // Native fixture self-terminates even when injected handle cleanup fails. No numeric teardown.
    const record = await runOwnedProcess(process.execPath, ["-e", "process.stdout.write('launched');setTimeout(()=>process.exit(9),4000)"], {
      cwd: tmpdir(), env: process.env, timeout: 2000, onStdout: (chunk: Buffer) => chunks.push(chunk),
    });
    assert.equal(fallback, 1, "HANDLE_FAILURE_CONTROL_NOT_EXERCISED");
    assert.deepEqual(Buffer.concat(chunks), Buffer.from("launched"));
    assert.equal(record.spawnError, undefined); assert.equal(record.nativeSpawned, true);
    assert.equal(record.code, null); assert.equal(record.signal, null); assert.equal(record.nativeExitObserved, false);
    assert.equal(record.timedOut, true); assert.equal(record.durationBoundary, "bounded-timeout-settlement");
    assert.deepEqual(record.killErrors, ["SETUP_TREE_CLEANUP_UNSUPPORTED: authenticated Windows tree identity unavailable", "EPERM: CONTROLLED_HANDLE_DENIAL"]);
  } finally {
    process.kill = kill; childProcess.spawn = spawn; syncBuiltinESMExports(); Object.defineProperty(process, "platform", platform);
  }
});

for (const startupDelay of [0, 2200]) {
test(`Windows expired native leader with controlled held pipes keeps actual exit; mock pipe plumbing, no tree proof (native startup delay ${startupDelay}ms)`, { timeout: 20000 }, async () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!, spawn = childProcess.spawn, kill = process.kill;
  const stdout = new PassThrough(), stderr = new PassThrough();
  const deadline = nativeDeadline();
  let fallback = 0, numericLookup = 0, nativeExit = false, settled = false;
  let exited!: (value: unknown) => void;
  const observedExit = new Promise(resolve => { exited = resolve; });
  let child: ReturnType<typeof spawn> | undefined, childExited: Promise<unknown> | undefined, running: Promise<any> | undefined;
  const failures: unknown[] = [];
  const retain = async (step: () => Promise<unknown>) => { try { await step(); } catch (error) { failures.push(error); } };
  try {
    Object.defineProperty(process, "platform", { ...platform, value: "win32" });
    process.kill = () => { numericLookup++; throw new Error("NUMERIC_TREE_AUTHORITY_FORBIDDEN"); };
    childProcess.spawn = ((...args: any[]) => {
      child = Reflect.apply(spawn, childProcess, args);
      childExited = new Promise(resolve => child!.once("exit", (code, signal) => resolve({ code, signal })));
      // Keep the real native exit event. Hold only the wrapper's read streams open:
      // grandchild inheritance does not keep these pipes open on every platform.
      Object.defineProperties(child, { stdout: { value: stdout }, stderr: { value: stderr } });
      child!.kill = () => { fallback++; throw new Error("EXPIRED_HANDLE_REACQUIRED"); }; return child;
    }) as typeof spawn;
    syncBuiltinESMExports();
    // Delay real native source evaluation past 2000ms; only the named deadline is intercepted.
    const preload = `data:text/javascript,${encodeURIComponent(`await new Promise(resolve=>setTimeout(resolve,${startupDelay}));`)}`;
    running = runOwnedProcess(process.execPath, ["--import", preload, "-e", "process.exit(7)"], {
      cwd: tmpdir(), env: process.env, timeout: 2000,
      onExit: (code: number, signal: string | null) => {
        nativeExit = true; exited({ code, signal });
      },
    }).then((record: any) => { settled = true; return record; });
    assert.deepEqual(await bounded(observedExit, "WINDOWS_NATIVE_EXIT_BEFORE_DEADLINE_MISSING"), { code: 7, signal: null });
    assert.deepEqual(await bounded(childExited!, "WINDOWS_ACTUAL_NATIVE_EXIT_MISSING"), { code: 7, signal: null });
    assert.equal(stdout.destroyed, false); assert.equal(stderr.destroyed, false);
    assert.equal(stdout.readableEnded, false); assert.equal(stderr.readableEnded, false);
    assert.equal(settled, false, "WINDOWS_HELD_PIPES_SETTLED_BEFORE_TIMEOUT");
    assert.equal(deadline.count, 1); assert.equal(deadline.milliseconds, 2000);
    await deadline.fire();
    const record = await bounded(running!, "WINDOWS_HELD_PIPE_RESULT_MISSING");
    assert.ok(record.exitDurationMs >= startupDelay, "DELAYED_WINDOWS_NATIVE_START_CONTROL_NOT_EXERCISED");
    assert.equal(nativeExit, true, "NATIVE_EXIT_BEFORE_PIPE_TIMEOUT_NOT_EXERCISED");
    assert.equal(record.code, 7); assert.equal(record.signal, null); assert.equal(record.nativeExitObserved, true);
    assert.equal(record.timedOut, true); assert.equal(record.durationBoundary, "timeout-cleanup");
    assert.equal(stdout.destroyed, true); assert.equal(stderr.destroyed, true);
    assert.equal(fallback, 0); assert.equal(numericLookup, 0);
    assert.deepEqual(record.killErrors, ["SETUP_TREE_CLEANUP_UNSUPPORTED: authenticated Windows tree identity unavailable"]);
  } catch (error) { failures.push(error); }
  finally {
    deadline.restore(true);
    if (running) await retain(async () => { await bounded(running!, "WINDOWS_TEARDOWN_SETTLEMENT_MISSING"); });
    if (childExited) await retain(async () => {
      assert.deepEqual(await bounded(childExited!, "WINDOWS_TEARDOWN_EXIT_MISSING"), { code: 7, signal: null });
    });
    stdout.destroy(); stderr.destroy(); process.kill = kill;
    childProcess.spawn = spawn; syncBuiltinESMExports(); Object.defineProperty(process, "platform", platform);
  }
  if (failures.length) throw new AggregateError(failures, `WINDOWS_FIXTURE_FAILURES: ${failures.map(String).join("; ")}`);
});
}
