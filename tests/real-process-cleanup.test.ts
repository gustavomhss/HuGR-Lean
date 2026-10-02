import assert from "node:assert/strict";
import childProcess, { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { syncBuiltinESMExports } from "node:module";
import { createServer, type AddressInfo } from "node:net";
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
setTimeout(() => process.exit(0), 15000);
if (process.argv[2] === 'outside') {
  process.on('message', message => { if (message === 'stop') process.exit(0); });
  process.on('disconnect', () => process.exit(0));
}
`;

async function ownershipChannel() {
  const token = randomUUID(), sockets = new Set<import("node:net").Socket>(), server = createServer();
  server.on("connection", (socket) => {
    sockets.add(socket); socket.once("close", () => sockets.delete(socket));
    socket.once("data", (chunk) => {
      if (chunk.toString() !== token) socket.destroy();
      else socket.write("owned");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const source = `const ownership=require('node:net').connect(${(server.address() as AddressInfo).port},'127.0.0.1');ownership.resume();ownership.on('end',()=>process.exit(0));ownership.on('error',()=>process.exit(0));ownership.write(${JSON.stringify(token)});`;
  return { source, stop: async () => {
    for (const socket of sockets) socket.destroy(); // Live peer self-terminates; no numeric cleanup.
    await new Promise<void>((resolve) => server.close(() => resolve()));
  } };
}

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
      const outside = spawn(process.execPath, ["-e", heartbeat, outsideBeat, "outside"], { detached: true, stdio: ["ignore", "ignore", "ignore", "ipc"] });
      const ownership = await ownershipChannel();
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
const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(heartbeat + ownership.source)}, ${JSON.stringify(beat)}], {stdio:['ignore','ignore','ignore','ipc']});
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
        await waitForOwner(ownerFile, token); // Readiness fact only, never cleanup authority.
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
        try {
          const before = (await readFile(outsideBeat)).length;
          await ownership.stop(); await running;
          await delay(100);
          assert.ok((await readFile(outsideBeat)).length > before, "UNRELATED_PROCESS_KILLED_DURING_TEARDOWN");
        } finally {
          if (outside.connected) outside.send("stop");
          await new Promise<void>((resolve) => outside.exitCode !== null || outside.signalCode !== null ? resolve() : outside.once("exit", () => resolve()));
          await rm(root, { recursive: true, force: true });
          assert.equal(outside.exitCode, 0, "UNRELATED_PROCESS_TERMINATION_FORGED");
        }
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

test("setup keeps guardian after native exit; escaped heartbeat survives cleanup then stops through live channel", { skip: process.platform === "win32", timeout: 15000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-expired-native-")), ownership = await ownershipChannel();
  const beat = path.join(root, "escaped.beat"), kill = process.kill;
  let running: Promise<any> | undefined;
  try {
    process.kill = () => { throw new Error("PARENT_NUMERIC_SIGNAL_FORBIDDEN"); };
    const escaped = `require('node:fs').appendFileSync(${JSON.stringify(beat)},'x');setInterval(()=>require('node:fs').appendFileSync(${JSON.stringify(beat)},'x'),20);setTimeout(()=>process.exit(0),15000);${ownership.source}`;
    const source = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(escaped)}],{detached:true,stdio:['ignore',1,2]}).unref();process.stdout.write('escaped-ready');process.exit(7);`;
    running = setupRunner(root, isolatedEnv(root))("expired-native", process.execPath, ["-e", source], { timeout: 1000 })
      .then(() => { throw new Error("SETUP_TIMEOUT_ACCEPTED"); }, (error: any) => error.record);
    const record = await running;
    assert.equal(record.timedOut, true); assert.equal(record.code, 7); assert.equal(record.signal, null);
    assert.deepEqual(await readFile(record.stdout), Buffer.from("escaped-ready"));
    const before = (await readFile(beat)).length; await delay(100);
    assert.ok((await readFile(beat)).length > before, "ESCAPED_CONTROL_KILLED");
  } finally {
    await ownership.stop(); await running;
    process.kill = kill;
    await delay(100); const stopped = (await readFile(beat)).length; await delay(100);
    assert.equal((await readFile(beat)).length, stopped, "LIVE_CHANNEL_TEARDOWN_FAILED");
    await rm(root, { recursive: true, force: true });
  }
});
