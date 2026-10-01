import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const { captureCommand } = await import(new URL("../scripts/real-world/capture.mjs", import.meta.url).href);
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

test("native/pipe duration excludes independently delayed live log drain and decoder", { skip: process.platform === "win32" }, async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "lean-capture-boundary-"));
  const append = fs.appendFile, spawn = childProcess.spawn, Decoder = globalThis.TextDecoder;
  let spawnAt = 0, closeAt = 0, exitAt = 0, appendCalls = 0, decodeAt = 0;
  try {
    fs.appendFile = async (...args: Parameters<typeof append>) => { appendCalls++; await delay(250); return append(...args); };
    childProcess.spawn = ((...args: any[]) => {
      spawnAt = performance.now();
      const child = Reflect.apply(spawn, childProcess, args);
      child.once("exit", () => { exitAt = performance.now(); });
      child.once("close", () => { closeAt = performance.now(); });
      return child;
    }) as typeof spawn;
    syncBuiltinESMExports();
    globalThis.TextDecoder = class extends Decoder {
      override decode(...args: Parameters<TextDecoder["decode"]>) {
        decodeAt = performance.now();
        while (performance.now() - decodeAt < 150) { /* controlled bookkeeping cost */ }
        return super.decode(...args);
      }
    };
    const producer = Buffer.from("producer 🦣\r\n");
    const command = `exec ${quote(process.execPath)} -e ${quote(`process.stdout.write(Buffer.from(${JSON.stringify([...producer])}));`)}`;
    const captured = await captureCommand({ command, cwd: root }, process.env, { logDir: root });
    assert.ok(spawnAt && exitAt && closeAt && appendCalls >= 2, "BOUNDARY_INSTRUMENT_DID_NOT_ENGAGE");
    assert.equal(captured.durationBoundary, "pipe-close");
    assert.ok(Math.abs(captured.durationMs - (closeAt - spawnAt)) < 50, "CAPTURE_DURATION_INCLUDES_BOOKKEEPING");
    assert.ok(Math.abs(captured.exitDurationMs - (exitAt - spawnAt)) < 50, "EXIT_DURATION_NOT_NATIVE_EXIT");
    assert.ok(decodeAt - closeAt >= 180, "LIVE_LOG_DELAY_CONTROL_MISSING");
    assert.ok(captured.bookkeepingMs >= 330, "BOOKKEEPING_PHASE_NOT_SEPARATE");
    assert.deepEqual(captured.raw, producer);
    assert.deepEqual(await fs.readFile(path.join(root, "original.live")), producer);
  } finally {
    fs.appendFile = append; childProcess.spawn = spawn; globalThis.TextDecoder = Decoder;
    syncBuiltinESMExports();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("duration ends after pipes, separately from earlier native leader exit", { skip: process.platform === "win32" }, async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "lean-capture-tail-"));
  try {
    const tail = "setTimeout(() => process.stdout.write('tail\\n'), 250)";
    const source = `process.stdout.write('leader\\n'); const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(tail)}], {stdio:['ignore',1,2]}); child.unref(); process.exitCode=7;`;
    const captured = await captureCommand({ command: `exec ${quote(process.execPath)} -e ${quote(source)}`, cwd: root }, process.env);
    assert.equal(captured.exitCode, 7); assert.equal(captured.signal, null); assert.equal(captured.complete, true);
    assert.equal(captured.output, "leader\ntail\n");
    assert.equal(captured.durationBoundary, "pipe-close");
    assert.ok(captured.durationMs - captured.exitDurationMs >= 200, "PIPE_TAIL_EXCLUDED_FROM_NATIVE_CAPTURE_DURATION");
    assert.ok(captured.bookkeepingMs >= 0);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("bounded timeout observes SIGKILL leader exit before settlement, never synthesized exit zero", { skip: process.platform === "win32", timeout: 15000 }, async () => {
  const source = "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000);";
  const captured = await captureCommand({ command: `exec ${quote(process.execPath)} -e ${quote(source)}`, cwd: tmpdir() }, process.env, { timeout: 5000 });
  assert.equal(captured.output, "ready"); assert.equal(captured.timedOut, true); assert.equal(captured.complete, false);
  assert.equal(captured.exitCode, null); assert.equal(captured.signal, "SIGKILL");
  assert.equal(captured.durationBoundary, "timeout-cleanup");
  assert.ok(captured.durationMs >= 6900 && captured.durationMs < 12000, "TIMEOUT_SETTLEMENT_BOUNDARY_WRONG");
  assert.ok(captured.exitDurationMs <= captured.durationMs, "NATIVE_EXIT_MISSING_BEFORE_TIMEOUT_SETTLEMENT");
});
