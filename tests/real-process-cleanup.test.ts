import assert from "node:assert/strict";
import childProcess, { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const { setupRunner, isolatedEnv } = await import(new URL("../scripts/real-world/setup.mjs", import.meta.url).href);
const { captureCommand } = await import(new URL("../scripts/real-world/capture.mjs", import.meta.url).href);
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

const heartbeat = `
const fs = require('node:fs');
process.on('SIGTERM', () => {});
fs.appendFileSync(process.argv[1], 'x');
setInterval(() => fs.appendFileSync(process.argv[1], 'x'), 20);
process.send({pid:process.pid});
`;

async function waitForOwner(file: string, token: string): Promise<number> {
  for (let i = 0; i < 300; i++) {
    try {
      const owner = JSON.parse(await readFile(file, "utf8"));
      assert.equal(owner.token, token, "OWNED_PROCESS_TOKEN_MISMATCH");
      assert.ok(Number.isSafeInteger(owner.pid) && owner.pid > 0 && owner.pid !== process.pid);
      return owner.pid;
    } catch (error: any) { if (error.code !== "ENOENT") throw error; }
    await delay(20);
  }
  throw new Error("OWNED_PROCESS_READINESS_MISSING");
}

for (const runner of ["setup", "capture"]) {
  test(`${runner} timeout kills attached SIGTERM-ignoring stdio-ignore descendant after leader close`,
    { skip: process.platform === "win32", timeout: 20000 }, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "lean-owned-cleanup-"));
      const token = randomUUID(), ownerFile = path.join(root, "owner.json"), beat = path.join(root, "owned.beat");
      const outsideBeat = path.join(root, "outside.beat");
      const outside = spawn(process.execPath, ["-e", heartbeat, outsideBeat], { detached: true, stdio: ["ignore", "ignore", "ignore", "ipc"] });
      let ownedPid: number | undefined;
      let running: Promise<any> | undefined;
      try {
        let readiness: ReturnType<typeof setTimeout> | undefined;
        try {
          await new Promise<void>((resolve, reject) => {
            readiness = setTimeout(() => reject(new Error("OUTSIDE_READINESS_MISSING")), 8000);
            outside.once("error", reject);
            outside.once("exit", () => reject(new Error("OUTSIDE_EXITED_BEFORE_READINESS")));
            outside.once("message", (message: any) => {
              try { assert.equal(message.pid, outside.pid); resolve(); } catch (error) { reject(error); }
            });
          });
        } finally { clearTimeout(readiness); }
        const source = `
const fs = require('node:fs');
process.on('SIGTERM', () => process.exit(7));
const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(heartbeat)}, ${JSON.stringify(beat)}], {stdio:['ignore','ignore','ignore','ipc']});
child.once('message', (owner) => {
  fs.writeFileSync(${JSON.stringify(ownerFile)}, JSON.stringify({pid:owner.pid,token:${JSON.stringify(token)}}));
  process.stdout.write('leader-ready\\n');
  child.disconnect(); child.unref();
});
setInterval(() => {}, 1000);
`;
        const env = isolatedEnv(root);
        running = runner === "setup"
          ? setupRunner(root, env)("owned-timeout", process.execPath, ["-e", source], { timeout: 5000 })
            .then(() => { throw new Error("SETUP_TIMEOUT_ACCEPTED"); }, (error: any) => error.record)
          : captureCommand({ command: `exec ${quote(process.execPath)} -e ${quote(source)}`, cwd: root }, env, { timeout: 5000 });
        ownedPid = await waitForOwner(ownerFile, token);
        const first = (await readFile(beat)).length;
        await delay(100);
        assert.ok((await readFile(beat)).length > first, "DESCENDANT_HEARTBEAT_CONTROL_MISSING");
        const record = await running;
        assert.equal(record.timedOut, true);
        assert.equal(runner === "setup" ? record.code : record.exitCode, 7);
        assert.equal(record.signal, null, "Do not invent descendant SIGKILL as leader signal");
        if (runner === "setup") assert.equal(await readFile(record.stdout, "utf8"), "leader-ready\n");
        else { assert.equal(record.output, "leader-ready\n"); assert.equal(record.complete, false); }
        const stopped = (await readFile(beat)).length, outsideBefore = (await readFile(outsideBeat)).length;
        await delay(150);
        assert.equal((await readFile(beat)).length, stopped, "OWNED_DESCENDANT_SURVIVED_SETTLEMENT");
        assert.ok((await readFile(outsideBeat)).length > outsideBefore, "UNRELATED_PROCESS_KILLED");
      } finally {
        try { if (ownedPid) process.kill(ownedPid, "SIGKILL"); }
        catch (error: any) { if (error.code !== "ESRCH") throw error; }
        outside.kill("SIGKILL");
        await running;
        await new Promise<void>((resolve) => outside.exitCode !== null || outside.signalCode !== null ? resolve() : outside.once("exit", () => resolve()));
        await rm(root, { recursive: true, force: true });
      }
    });
}

test("successful setup/capture finish promptly without waiting for timeout escalation", { skip: process.platform === "win32" }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-prompt-completion-"));
  const spawn = childProcess.spawn;
  let closeAt = 0;
  try {
    childProcess.spawn = ((...args: any[]) => {
      const child = Reflect.apply(spawn, childProcess, args);
      child.once("close", () => { closeAt = performance.now(); }); return child;
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

async function expiredLeader(runner: string, simulateWindows = false) {
  const root = await mkdtemp(path.join(tmpdir(), "lean-expired-group-")), token = randomUUID();
  const ownerFile = path.join(root, "owner.json"), nativeKill = process.kill, nativeSpawn = childProcess.spawn;
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  const targets: Array<{ pid: number; signal: unknown; error: string | undefined }> = [];
  let leaderPid: number | undefined, ownedPid: number | undefined, running: Promise<any> | undefined;
  try {
    if (simulateWindows) Object.defineProperty(process, "platform", { ...platform, value: "win32" });
    childProcess.spawn = ((...args: any[]) => {
      const child = Reflect.apply(nativeSpawn, childProcess, args); leaderPid = child.pid; return child;
    }) as typeof nativeSpawn;
    syncBuiltinESMExports();
    process.kill = (pid, signal) => {
      const target = { pid, signal, error: undefined as string | undefined };
      if (pid < 0 && signal !== 0) targets.push(target);
      try { return nativeKill(pid, signal); }
      catch (error: any) { target.error = error.code; throw error; }
    };
    const source = `const child=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:['ignore',1,2]}); require('node:fs').writeFileSync(${JSON.stringify(ownerFile)},JSON.stringify({pid:child.pid,token:${JSON.stringify(token)}})); process.stdout.write('escaped-ready\\n',()=>{child.unref();process.exit(7);});`;
    running = runner === "setup"
      ? setupRunner(root, isolatedEnv(root))("expired-leader", process.execPath, ["-e", source], { timeout: 5000 })
        .then(() => { throw new Error("EXPIRED_LEADER_TIMEOUT_ACCEPTED"); }, (error: any) => error.record)
      : captureCommand({ command: `exec ${quote(process.execPath)} -e ${quote(source)}`, cwd: root }, isolatedEnv(root), { timeout: 5000 });
    ownedPid = await waitForOwner(ownerFile, token);
    const record = await running;
    assert.equal(record.timedOut, true); assert.equal(record.signal, null);
    assert.equal(runner === "setup" ? record.code : record.exitCode, 7);
    nativeKill(ownedPid, 0); // Positive OS control: escaped fixture still exists; it is not our group.
    if (process.platform === "win32") {
      assert.deepEqual(targets, []);
      assert.ok(record.killErrors?.some((message: string) => message.startsWith("SETUP_TREE_CLEANUP_UNSUPPORTED:")), "EXPIRED_WINDOWS_IDENTITY_FABRICATED_CLEANUP");
    } else {
      assert.deepEqual(targets, [{ pid: -leaderPid!, signal: "SIGTERM", error: "ESRCH" }], "ABSENT_OWNED_GROUP_REACQUIRED");
    }
  } finally {
    process.kill = nativeKill; Object.defineProperty(process, "platform", platform);
    childProcess.spawn = nativeSpawn; syncBuiltinESMExports();
    try { if (ownedPid) nativeKill(ownedPid, "SIGKILL"); }
    catch (error: any) { if (error.code !== "ESRCH") throw error; }
    await running;
    await rm(root, { recursive: true, force: true });
  }
}

for (const runner of ["setup", "capture"]) {
  test(`${runner} never reacquires absent POSIX group or expired Windows leader`, { skip: runner === "capture" && process.platform === "win32", timeout: 20000 }, () => expiredLeader(runner));
}
test("simulated Windows expired identity explicitly rejects tree cleanup (not native Windows proof)", { skip: process.platform === "win32", timeout: 20000 }, () => expiredLeader("setup", true));

test("capture signal failures retain named cleanup errors, not fictitious launch/exit facts", { skip: process.platform === "win32", timeout: 20000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-cleanup-error-"));
  const nativeKill = process.kill, nativeSpawn = childProcess.spawn;
  let leader: ChildProcess | undefined;
  try {
    childProcess.spawn = ((...args: any[]) => { leader = Reflect.apply(nativeSpawn, childProcess, args); return leader; }) as typeof nativeSpawn;
    syncBuiltinESMExports();
    process.kill = (pid, signal) => {
      if (pid < 0) throw Object.assign(new Error("CONTROLLED_SIGNAL_DENIAL"), { code: "EPERM" });
      return nativeKill(pid, signal);
    };
    const source = "process.stdout.write('native-prefix'); setInterval(()=>{},1000);";
    const record = await captureCommand({ command: `exec ${quote(process.execPath)} -e ${quote(source)}`, cwd: root }, process.env, { timeout: 5000 });
    assert.deepEqual(record.raw, Buffer.from("native-prefix"));
    assert.equal(record.timedOut, true); assert.equal(record.complete, false);
    assert.equal(record.launchError, undefined, "CLEANUP_ERROR_MISLABELED_LAUNCH_FAILURE");
    assert.equal(record.exitCode, null); assert.equal(record.signal, null); assert.equal(record.exitDurationMs, undefined);
    assert.deepEqual(record.killErrors, ["SIGTERM: EPERM: CONTROLLED_SIGNAL_DENIAL", "SIGKILL: EPERM: CONTROLLED_SIGNAL_DENIAL"]);
    assert.equal(record.durationBoundary, "bounded-timeout-settlement");
  } finally {
    process.kill = nativeKill; childProcess.spawn = nativeSpawn; syncBuiltinESMExports();
    if (leader?.pid) {
      try { nativeKill(-leader.pid, "SIGKILL"); }
      catch (error: any) { if (error.code !== "ESRCH") throw error; }
      await new Promise<void>((resolve) => leader!.exitCode !== null || leader!.signalCode !== null ? resolve() : leader!.once("exit", () => resolve()));
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("controlled Windows taskkill failure names unavailable cleanup and binds live owned leader (not native tree proof)", { timeout: 20000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-taskkill-fault-"));
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  const spawn = childProcess.spawn, execute = childProcess.execFile;
  const calls: any[] = [];
  let leader: ChildProcess | undefined, nativeExit: unknown;
  try {
    Object.defineProperty(process, "platform", { ...platform, value: "win32" });
    childProcess.spawn = ((...args: any[]) => {
      leader = Reflect.apply(spawn, childProcess, args);
      leader!.once("exit", (code, signal) => { nativeExit = { code, signal }; });
      return leader;
    }) as typeof spawn;
    childProcess.execFile = ((file: string, args: string[], options: any, callback: any) => {
      calls.push({ file, args, options, leaderWasLive: leader!.exitCode === null && leader!.signalCode === null });
      setImmediate(() => callback(Object.assign(new Error("CONTROLLED_TASKKILL_UNAVAILABLE"), { code: "ENOENT" })));
      return {} as ChildProcess; // Fault-injected cleanup transport, never successful OS-tree proof.
    }) as typeof execute;
    syncBuiltinESMExports();
    const env = isolatedEnv(root);
    const record = await setupRunner(root, env)("taskkill-fault", process.execPath, ["-e", "process.stdout.write('taskkill-ready');setInterval(()=>{},1000);"], { timeout: 5000 })
      .then(() => { throw new Error("TASKKILL_FAULT_ACCEPTED"); }, (error: any) => error.record);
    assert.equal(record.timedOut, true); assert.deepEqual({ code: record.code, signal: record.signal }, nativeExit);
    assert.deepEqual(record.killErrors, ["SETUP_TREE_CLEANUP_FAILED: CONTROLLED_TASKKILL_UNAVAILABLE"]);
    assert.deepEqual(await readFile(record.stdout), Buffer.from("taskkill-ready"));
    assert.deepEqual(calls, [{ file: "taskkill.exe", args: ["/pid", String(leader!.pid), "/T", "/F"], options: { env, timeout: 2000, windowsHide: true }, leaderWasLive: true }]);
  } finally {
    Object.defineProperty(process, "platform", platform);
    childProcess.spawn = spawn; childProcess.execFile = execute; syncBuiltinESMExports();
    if (leader && leader.exitCode === null && leader.signalCode === null) {
      leader.kill("SIGKILL"); await new Promise<void>((resolve) => leader!.once("exit", () => resolve()));
    }
    await rm(root, { recursive: true, force: true });
  }
});
