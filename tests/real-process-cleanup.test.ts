import assert from "node:assert/strict";
import childProcess, { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { bounded, nativeDeadline, ownershipChannel } from "./process-readiness.js";

const { setupRunner, isolatedEnv } = await import(new URL("../scripts/real-world/setup.mjs", import.meta.url).href);
const { captureCommand } = await import(new URL("../scripts/real-world/capture.mjs", import.meta.url).href);
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

for (const runner of ["setup", "capture"]) {
  test(`${runner} timeout kills attached SIGTERM-ignoring stdio-ignore descendant after leader close`,
    { skip: process.platform === "win32", timeout: 20000 }, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "lean-owned-cleanup-"));
      const ownership = await ownershipChannel(), unrelated = await ownershipChannel(), deadline = nativeDeadline();
      const outside = spawn(process.execPath, ["-e", unrelated.source], { detached: true, stdio: "ignore" });
      const exited = new Promise(resolve => outside.once("exit", (code, signal) => resolve({ code, signal })));
      let running: Promise<any> | undefined;
      const failures: unknown[] = [];
      const retain = async (step: () => Promise<unknown>) => { try { await step(); } catch (error) { failures.push(error); } };
      try {
        await unrelated.ping();
        const source = `
process.on('SIGTERM', () => process.exit(7));
require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify("process.on('SIGTERM',()=>{});" + ownership.source)}], {stdio:'ignore'}).unref();
process.stdout.write('leader-ready\\n');
setInterval(() => {}, 1000);
`;
        const env = isolatedEnv(root);
        running = runner === "setup"
          ? setupRunner(root, env)("owned-timeout", process.execPath, ["-e", source], { timeout: 5000 })
            .then(() => { throw new Error("SETUP_TIMEOUT_ACCEPTED"); }, (error: any) => error.record)
          : captureCommand({ command: `exec ${quote(process.execPath)} -e ${quote(source)}`, cwd: root }, env, { timeout: 5000 });
        await ownership.ping(); await deadline.fire();
        const record = await running;
        assert.equal(record.timedOut, true);
        assert.equal(runner === "setup" ? record.code : record.exitCode, 7);
        assert.equal(record.signal, null, "Do not invent descendant SIGKILL as leader signal");
        if (runner === "setup") assert.equal(await readFile(record.stdout, "utf8"), "leader-ready\n");
        else { assert.equal(record.output, "leader-ready\n"); assert.equal(record.complete, false); }
        assert.deepEqual(record.killErrors ?? [], []);
        await ownership.closed(); await unrelated.ping(); // Before any fixture shutdown.
      } catch (error) { failures.push(error);
      } finally {
        deadline.restore(true);
        await retain(() => ownership.stop()); await retain(async () => { await bounded(running!, "CLEANUP_SETTLEMENT_MISSING"); });
        await retain(() => unrelated.ping()); await retain(() => unrelated.stop());
        await retain(async () => assert.deepEqual(await bounded(exited, "OUTSIDE_EXIT_MISSING"), { code: 0, signal: null }));
        await retain(() => rm(root, { recursive: true, force: true }));
      }
      if (failures.length) throw new AggregateError(failures, `ATTACHED_FIXTURE_FAILURES: ${failures.map(String).join("; ")}`);
    });
}

test("successful setup/capture finish promptly without waiting for timeout escalation", { skip: process.platform === "win32" }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-prompt-completion-"));
  const spawn = childProcess.spawn;
  let closeAt = 0;
  try {
    childProcess.spawn = ((...args: any[]) => {
      const child = Reflect.apply(spawn, childProcess, args);
      for (const stream of [child.stdout, child.stderr]) stream?.once("close", () => { closeAt = performance.now(); }); return child;
    }) as typeof spawn;
    syncBuiltinESMExports();
    const env = isolatedEnv(root);
    const setup = await setupRunner(root, env)("natural-close", process.execPath, ["-e", "process.stdout.write('done')"]);
    assert.ok(closeAt && performance.now() - closeAt < 1500, "NATURAL_SETUP_CLOSE_WAITED_FOR_ESCALATION");
    closeAt = 0;
    const capture = await captureCommand({ command: "printf done", cwd: root }, env);
    assert.equal(setup.code, 0); assert.equal(capture.exitCode, 0);
    assert.equal(setup.timedOut, false); assert.equal(capture.timedOut, false);
    assert.ok(closeAt && performance.now() - closeAt < 1500, "NATURAL_CAPTURE_CLOSE_WAITED_FOR_ESCALATION");
  } finally { childProcess.spawn = spawn; syncBuiltinESMExports(); await rm(root, { recursive: true, force: true }); }
});

for (const runner of ["setup", "capture"]) {
  test(`${runner} keeps guardian after native exit; escaped peer survives cleanup then stops through live channel`, { skip: process.platform === "win32", timeout: 20000 }, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lean-expired-native-")), ownership = await ownershipChannel();
    const kill = process.kill, deadline = nativeDeadline();
    const originalSpawn = childProcess.spawn;
    let nativeExit!: () => void;
    const observedExit = new Promise<void>(resolve => { nativeExit = resolve; });
    let running: Promise<any> | undefined;
    const failures: unknown[] = [];
    const retain = async (step: () => Promise<unknown>) => { try { await step(); } catch (error) { failures.push(error); } };
    try {
      process.kill = () => { throw new Error("PARENT_NUMERIC_SIGNAL_FORBIDDEN"); };
      childProcess.spawn = ((...args: any[]) => {
        const guardian = Reflect.apply(originalSpawn, childProcess, args);
        guardian.on("message", (message: any) => { if (message.type === "exit" && message.token === args[1].at(-1)) nativeExit(); }); return guardian;
      }) as typeof spawn;
      syncBuiltinESMExports();
      const escaped = ownership.source;
      const source = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(escaped)}],{detached:true,stdio:['ignore',1,2]}).unref();process.stdout.write('escaped-ready');process.exit(7);`;
      running = runner === "setup"
        ? setupRunner(root, isolatedEnv(root))("expired-native", process.execPath, ["-e", source], { timeout: 1000 })
          .then(() => { throw new Error("SETUP_TIMEOUT_ACCEPTED"); }, (error: any) => error.record)
        : captureCommand({ command: `exec ${quote(process.execPath)} -e ${quote(source)}`, cwd: root }, isolatedEnv(root), { timeout: 1000 });
      await ownership.ping(); await bounded(observedExit, "NATIVE_EXIT_BEFORE_CLEANUP_MISSING"); await deadline.fire();
      const record = await running;
      assert.equal(record.timedOut, true); assert.equal(runner === "setup" ? record.code : record.exitCode, 7); assert.equal(record.signal, null);
      assert.deepEqual(record.killErrors ?? [], [], "NUMERIC_CLEANUP_AUTHORITY_USED");
      assert.deepEqual(runner === "setup" ? await readFile(record.stdout) : record.stdout, Buffer.from("escaped-ready"));
      await ownership.ping();
    } catch (error) { failures.push(error); }
    finally {
      try {
        deadline.restore(true); childProcess.spawn = originalSpawn; syncBuiltinESMExports();
        await retain(() => ownership.stop());
        await retain(async () => { await bounded(running!, "ESCAPED_SETTLEMENT_MISSING"); });
        await retain(() => ownership.closed());
      } finally {
        process.kill = kill;
        await retain(() => rm(root, { recursive: true, force: true }));
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length) throw new AggregateError(failures, `ESCAPED_FIXTURE_FAILURES: ${failures.map(String).join("; ")}`);
  });
}

for (const runner of ["setup", "capture"]) {
  test(`${runner} treats guardian loss after observed native exit zero as failure`, { skip: process.platform === "win32", timeout: 10000 }, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lean-native-zero-loss-")), spawn = childProcess.spawn;
    try {
      childProcess.spawn = ((...args: any[]) => {
        const guardian = Reflect.apply(spawn, childProcess, args);
        guardian.on("message", (message: any) => {
          if (message.type === "exit") setImmediate(() => { if (guardian.connected) guardian.disconnect(); });
        });
        return guardian;
      }) as typeof spawn;
      syncBuiltinESMExports();
      const source = "require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},1500)'],{stdio:['ignore',1,2]}).unref();process.stdout.write('prefix');process.exit(0)";
      const record = runner === "setup"
        ? await setupRunner(root, isolatedEnv(root))("native-zero-loss", process.execPath, ["-e", source])
          .then(() => { throw new Error("GUARDIAN_LOSS_ACCEPTED"); }, (error: any) => error.record)
        : await captureCommand({ command: `exec ${quote(process.execPath)} -e ${quote(source)}`, cwd: root }, isolatedEnv(root));
      assert.equal(runner === "setup" ? record.code : record.exitCode, 0); assert.equal(record.signal, null);
      assert.equal(record.spawnError ?? record.launchError, undefined);
      assert.equal(record.durationBoundary, "guardian-loss");
      assert.ok(record.killErrors.some((message: string) => message.startsWith("GUARDIAN_CHANNEL_LOST:")));
      assert.deepEqual(runner === "setup" ? await readFile(record.stdout) : record.stdout, Buffer.from("prefix"));
      if (runner === "capture") assert.equal(record.complete, false, "GUARDIAN_LOSS_MARKED_COMPLETE");
    } finally { childProcess.spawn = spawn; syncBuiltinESMExports(); await rm(root, { recursive: true, force: true }); }
  });
}
