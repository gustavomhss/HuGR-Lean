import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { test } from "node:test";

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

test("Windows expired native leader keeps actual exit and explicitly lacks tree cleanup; no leader fallback", { timeout: 10000 }, async () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!, spawn = childProcess.spawn;
  let fallback = 0;
  try {
    Object.defineProperty(process, "platform", { ...platform, value: "win32" });
    childProcess.spawn = ((...args: any[]) => {
      const child = Reflect.apply(spawn, childProcess, args);
      child.kill = () => { fallback++; throw new Error("EXPIRED_HANDLE_REACQUIRED"); }; return child;
    }) as typeof spawn;
    syncBuiltinESMExports();
    const source = "require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},4000)'],{stdio:['ignore',1,2]}).unref();process.exit(7)";
    const record = await runOwnedProcess(process.execPath, ["-e", source], { cwd: tmpdir(), env: process.env, timeout: 2000 });
    assert.equal(record.code, 7); assert.equal(record.signal, null); assert.equal(record.nativeExitObserved, true);
    assert.equal(record.timedOut, true); assert.equal(fallback, 0);
    assert.deepEqual(record.killErrors, ["SETUP_TREE_CLEANUP_UNSUPPORTED: authenticated Windows tree identity unavailable"]);
  } finally { childProcess.spawn = spawn; syncBuiltinESMExports(); Object.defineProperty(process, "platform", platform); }
});
