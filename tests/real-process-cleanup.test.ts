import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
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
  for (let i = 0; i < 150; i++) {
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
    { skip: process.platform === "win32", timeout: 15000 }, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "lean-owned-cleanup-"));
      const token = randomUUID(), ownerFile = path.join(root, "owner.json"), beat = path.join(root, "owned.beat");
      const outsideBeat = path.join(root, "outside.beat");
      const outside = spawn(process.execPath, ["-e", heartbeat, outsideBeat], { detached: true, stdio: ["ignore", "ignore", "ignore", "ipc"] });
      let ownedPid: number | undefined;
      let running: Promise<any> | undefined;
      try {
        await new Promise<void>((resolve, reject) => {
          outside.once("error", reject);
          outside.once("message", (message: any) => { assert.equal(message.pid, outside.pid); resolve(); });
        });
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
          ? setupRunner(root, env)("owned-timeout", process.execPath, ["-e", source], { timeout: 2000 })
            .then(() => { throw new Error("SETUP_TIMEOUT_ACCEPTED"); }, (error: any) => error.record)
          : captureCommand({ command: `exec ${quote(process.execPath)} -e ${quote(source)}`, cwd: root }, env, { timeout: 2000 });
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
  try {
    const started = performance.now(), env = isolatedEnv(root);
    const setup = await setupRunner(root, env)("natural-close", process.execPath, ["-e", "process.stdout.write('done')"]);
    const capture = await captureCommand({ command: "printf done", cwd: root }, env);
    assert.equal(setup.code, 0); assert.equal(capture.exitCode, 0);
    assert.equal(setup.timedOut, false); assert.equal(capture.timedOut, false);
    assert.ok(performance.now() - started < 1500, "NATURAL_CLOSE_WAITED_FOR_ESCALATION");
  } finally { await rm(root, { recursive: true, force: true }); }
});
