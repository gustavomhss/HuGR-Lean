import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { bounded, ownershipChannel } from "./process-readiness.js";

const { runOwnedProcess } = await import(new URL("../scripts/real-world/owned-process.mjs", import.meta.url).href);

test("guardian inherits exact native bytes and separates native exit from guardian lifetime", { skip: process.platform === "win32" }, async () => {
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  const record = await bounded<any>(runOwnedProcess(process.execPath, ["-e", "require('node:fs').writeSync(1,Buffer.from([0,255,65]));process.stderr.write('native');process.exitCode=7"], {
    cwd: tmpdir(), env: { PATH: process.env.PATH }, timeout: 5000,
    onStdout: (chunk: Buffer) => stdout.push(chunk), onStderr: (chunk: Buffer) => stderr.push(chunk),
  }), "NATIVE_BYTES_RESULT_MISSING");
  assert.deepEqual(Buffer.concat(stdout), Buffer.from([0, 255, 65]));
  assert.deepEqual(Buffer.concat(stderr), Buffer.from("native"));
  assert.equal(record.code, 7); assert.equal(record.signal, null); assert.equal(record.timedOut, false);
  assert.equal(record.durationBoundary, "pipe-close"); assert.deepEqual(record.killErrors, []);
  assert.ok(record.exitDurationMs <= record.durationMs);
});

test("guardian pins group after native exit; modeled reused IDs cannot harm unrelated native control through teardown", { skip: process.platform === "win32", timeout: 10000 }, async () => {
  const kill = process.kill, spawn = childProcess.spawn;
  const ownership = await ownershipChannel();
  const control = spawn(process.execPath, ["-e", ownership.source], { stdio: "ignore" });
  const exited = new Promise(resolve => control.once("exit", (code, signal) => resolve({ code, signal })));
  let guardian: ReturnType<typeof spawn> | undefined;
  const messages: string[] = [];
  const failures: unknown[] = [];
  const retain = async (step: () => Promise<unknown>) => { try { await step(); } catch (error) { failures.push(error); } };
  try {
    await ownership.ping();
    // Alias model, not actual kernel recycling. Any parent numeric signal hits live unrelated control.
    process.kill = () => kill(control.pid!, "SIGKILL");
    childProcess.spawn = ((...args: any[]) => {
      guardian = Reflect.apply(spawn, childProcess, args);
      guardian!.on("message", (message: any) => messages.push(message.type));
      return guardian;
    }) as typeof spawn;
    syncBuiltinESMExports();
    const source = "require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},5000)'],{stdio:['ignore',1,2]}).unref();process.exit(7)";
    const record = await bounded<any>(runOwnedProcess(process.execPath, ["-e", source], { cwd: tmpdir(), env: process.env, timeout: 500 }), "REUSED_IDS_RESULT_MISSING");
    assert.equal(record.code, 7); assert.equal(record.signal, null); assert.equal(record.timedOut, true);
    assert.ok(messages.includes("spawn") && messages.includes("exit") && messages.includes("escalating"), "GUARDIAN_PROTOCOL_CONTROL_MISSING");
    assert.equal(guardian!.signalCode, "SIGKILL"); assert.deepEqual(record.killErrors, []);
    assert.equal(record.durationBoundary, "timeout-cleanup");
    await ownership.ping();
  } catch (error) { failures.push(error); }
  finally {
    process.kill = kill; childProcess.spawn = spawn; syncBuiltinESMExports();
    await retain(() => ownership.ping()); await retain(() => ownership.stop());
    await retain(async () => {
      assert.deepEqual(await bounded(exited, "UNRELATED_EXIT_MISSING"), { code: 0, signal: null }, "UNRELATED_NATIVE_CONTROL_DIED_DURING_TEARDOWN");
    });
  }
  if (failures.length) throw new AggregateError(failures, `UNRELATED_FIXTURE_FAILURES: ${failures.map(String).join("; ")}`);
});

test("native launch error differs from guardian loss and revokes live IPC authority", { skip: process.platform === "win32" }, async () => {
  const missing = await bounded<any>(runOwnedProcess("/missing-lean-native-executable", [], { cwd: tmpdir(), env: process.env, timeout: 5000 }), "LAUNCH_ERROR_RESULT_MISSING");
  assert.match(missing.spawnError, /ENOENT/); assert.equal(missing.code, null); assert.equal(missing.signal, null);
  const spawn = childProcess.spawn;
  let guardian: ReturnType<typeof spawn> | undefined;
  let sends = 0;
  try {
    childProcess.spawn = ((...args: any[]) => {
      guardian = Reflect.apply(spawn, childProcess, args);
      const send = guardian!.send.bind(guardian);
      guardian!.send = ((...messages: any[]) => { sends++; return Reflect.apply(send, guardian, messages); }) as typeof childProcess.ChildProcess.prototype.send;
      guardian!.once("message", () => guardian!.disconnect());
      return guardian;
    }) as typeof spawn;
    syncBuiltinESMExports();
    const lost = await bounded<any>(runOwnedProcess(process.execPath, ["-e", "process.exit(0)"], { cwd: tmpdir(), env: process.env, timeout: 5000 }), "GUARDIAN_LOSS_RESULT_MISSING");
    assert.equal(lost.spawnError, undefined); assert.equal(lost.code, null);
    assert.ok(lost.killErrors.some((message: string) => message.startsWith("GUARDIAN_CHANNEL_LOST:")));
    assert.equal(sends, 0, "REVOKED_AUTHORITY_REACQUIRED");
  } finally { childProcess.spawn = spawn; syncBuiltinESMExports(); }
});
