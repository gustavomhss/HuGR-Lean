import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { bounded, nativeDeadline, ownershipChannel } from "./process-readiness.js";

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

for (const startupDelay of [0, 650]) {
test(`guardian pins group after native exit; modeled reused IDs cannot harm unrelated native control through teardown (native startup delay ${startupDelay}ms)`, { skip: process.platform === "win32", timeout: 20000 }, async () => {
  const kill = process.kill, spawn = childProcess.spawn;
  const ownership = await ownershipChannel(), descendant = await ownershipChannel(), deadline = nativeDeadline();
  const control = spawn(process.execPath, ["-e", ownership.source], { stdio: "ignore" });
  const exited = new Promise(resolve => control.once("exit", (code, signal) => resolve({ code, signal })));
  let guardian: ReturnType<typeof spawn> | undefined;
  let running: Promise<any> | undefined, settled = false;
  let nativeExit!: (value: unknown) => void;
  const observedExit = new Promise(resolve => { nativeExit = resolve; });
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  let pipesReady!: () => void;
  const heldPipes = new Promise<void>(resolve => { pipesReady = resolve; });
  const observePipes = () => {
    if (Buffer.concat(stdout).equals(Buffer.from("held-stdout")) && Buffer.concat(stderr).equals(Buffer.from("held-stderr"))) pipesReady();
  };
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
    const peer = "process.on('SIGTERM',()=>{});require('node:fs').writeSync(1,'held-stdout');require('node:fs').writeSync(2,'held-stderr');" + descendant.source;
    const source = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(peer)}],{stdio:['ignore',1,2]}).unref();process.exit(7)`;
    // Real native preload delays source evaluation beyond the original 500ms deadline.
    const preload = `data:text/javascript,${encodeURIComponent(`await new Promise(resolve=>setTimeout(resolve,${startupDelay}));`)}`;
    running = runOwnedProcess(process.execPath, ["--import", preload, "-e", source], {
      cwd: tmpdir(), env: process.env, timeout: 500,
      onStdout: (chunk: Buffer) => { stdout.push(chunk); observePipes(); },
      onStderr: (chunk: Buffer) => { stderr.push(chunk); observePipes(); },
      onExit: (code: number, signal: string | null) => nativeExit({ code, signal }),
    }).then((record: any) => { settled = true; return record; });
    assert.deepEqual(await bounded(observedExit, "NATIVE_EXIT_BEFORE_DEADLINE_MISSING"), { code: 7, signal: null });
    await descendant.ping(); await bounded(heldPipes, "DESCENDANT_HELD_PIPE_BYTES_MISSING");
    for (const stream of [guardian!.stdout!, guardian!.stderr!]) {
      assert.equal(stream.destroyed, false); assert.equal(stream.readableEnded, false);
    }
    assert.equal(settled, false, "HELD_PIPES_SETTLED_BEFORE_TIMEOUT");
    assert.equal(deadline.count, 1); assert.ok(deadline.milliseconds >= 1 && deadline.milliseconds <= 500);
    await deadline.fire();
    const record = await bounded(running!, "REUSED_IDS_RESULT_MISSING");
    assert.equal(record.code, 7); assert.equal(record.signal, null); assert.equal(record.timedOut, true);
    assert.ok(record.exitDurationMs >= startupDelay, "DELAYED_NATIVE_START_CONTROL_NOT_EXERCISED");
    assert.ok(messages.includes("spawn") && messages.includes("exit") && messages.includes("escalating"), "GUARDIAN_PROTOCOL_CONTROL_MISSING");
    assert.equal(guardian!.signalCode, "SIGKILL"); assert.deepEqual(record.killErrors, []);
    assert.equal(record.durationBoundary, "timeout-cleanup");
    assert.deepEqual(Buffer.concat(stdout), Buffer.from("held-stdout")); assert.deepEqual(Buffer.concat(stderr), Buffer.from("held-stderr"));
    await descendant.closed();
    await ownership.ping();
  } catch (error) { failures.push(error); }
  finally {
    deadline.restore(true);
    await retain(() => descendant.stop());
    if (running) await retain(async () => { await bounded(running!, "OWNED_TEARDOWN_SETTLEMENT_MISSING"); });
    await retain(() => ownership.ping()); await retain(() => ownership.stop());
    await retain(async () => {
      assert.deepEqual(await bounded(exited, "UNRELATED_EXIT_MISSING"), { code: 0, signal: null }, "UNRELATED_NATIVE_CONTROL_DIED_DURING_TEARDOWN");
    });
    process.kill = kill; childProcess.spawn = spawn; syncBuiltinESMExports();
  }
  if (failures.length) throw new AggregateError(failures, `UNRELATED_FIXTURE_FAILURES: ${failures.map(String).join("; ")}`);
});
}

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
