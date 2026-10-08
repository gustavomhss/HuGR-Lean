import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { bounded } from "./process-readiness.js";

const { captureCommand } = await import(new URL("../scripts/real-world/capture.mjs", import.meta.url).href);
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

test("native/pipe duration excludes independently delayed live log drain and decoder", { skip: process.platform === "win32" }, async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "lean-capture-boundary-"));
  const append = fs.appendFile, spawn = childProcess.spawn, Decoder = globalThis.TextDecoder;
  let spawnAt = 0, closeAt = 0, exitAt = 0, appendCalls = 0, decodeAt = 0;
  let closed!: () => void, completedWrites = 0, pendingAtClose = 0, pendingAtDecode = -1;
  const closures = new Set<string>(), drainStarts: number[] = [], writes: Promise<void>[] = [];
  const pipesClosed = new Promise<void>(resolve => { closed = resolve; });
  let capture: Promise<any> | undefined;
  const failures: unknown[] = [];
  const record = (error: unknown) => { if (!failures.includes(error)) failures.push(error); };
  const retain = async (step: () => unknown) => { try { await step(); } catch (error) { record(error); } };
  try {
    fs.appendFile = (...args: Parameters<typeof append>) => {
      appendCalls++;
      const write = (async () => {
        await bounded(pipesClosed, "LIVE_LOG_PIPE_CLOSURE_MISSING");
        drainStarts.push(performance.now());
        await delay(250); await append(...args); completedWrites++;
      })();
      writes.push(write); void write.catch(() => {}); // Settlement below retains failures.
      return write;
    };
    childProcess.spawn = ((...args: any[]) => {
      const child = Reflect.apply(spawn, childProcess, args);
      child.on("message", (message: any) => {
        if (message.type === "spawn") spawnAt = performance.now() - Number(process.hrtime.bigint() - BigInt(message.started)) / 1e6;
        if (message.type === "exit") exitAt = performance.now();
      });
      for (const [name, stream] of [["stdout", child.stdout], ["stderr", child.stderr]] as const) stream?.once("close", () => {
        closures.add(name); closeAt = performance.now();
        if (closures.size === 2) { pendingAtClose = appendCalls - completedWrites; closed(); }
      });
      return child;
    }) as typeof spawn;
    syncBuiltinESMExports();
    globalThis.TextDecoder = class extends Decoder {
      override decode(...args: Parameters<TextDecoder["decode"]>) {
        decodeAt = performance.now();
        pendingAtDecode = appendCalls - completedWrites;
        while (performance.now() - decodeAt < 150) { /* controlled bookkeeping cost */ }
        return super.decode(...args);
      }
    };
    const producer = Buffer.from("producer 🦣\r\n");
    const command = `exec ${quote(process.execPath)} -e ${quote(`process.stdout.write(Buffer.from(${JSON.stringify([...producer])}));`)}`;
    capture = captureCommand({ command, cwd: root }, process.env, { logDir: root });
    const captured = await capture;
    assert.ok(spawnAt && exitAt && closeAt && appendCalls >= 2, "BOUNDARY_INSTRUMENT_DID_NOT_ENGAGE");
    assert.deepEqual([...closures].sort(), ["stderr", "stdout"], "BOTH_PIPE_CLOSE_OBSERVATIONS_MISSING");
    assert.ok(pendingAtClose >= 2, "LIVE_LOG_NOT_PENDING_AT_PIPE_CLOSE");
    assert.equal(drainStarts.length, appendCalls, "LIVE_LOG_DRAIN_DID_NOT_ENGAGE");
    assert.ok(drainStarts.every(start => start >= closeAt), "LIVE_LOG_DELAY_BEFORE_PIPE_CLOSE");
    assert.equal(pendingAtDecode, 0, "DECODE_BEFORE_LIVE_LOG_DRAIN");
    assert.equal(completedWrites, appendCalls, "CAPTURE_RETURNED_BEFORE_LIVE_LOG_DRAIN");
    assert.equal(captured.durationBoundary, "pipe-close");
    assert.ok(Math.abs(captured.durationMs - (closeAt - spawnAt)) < 50, "CAPTURE_DURATION_INCLUDES_BOOKKEEPING");
    assert.ok(Math.abs(captured.exitDurationMs - (exitAt - spawnAt)) < 50, "EXIT_DURATION_NOT_NATIVE_EXIT");
    assert.ok(decodeAt - closeAt >= 180, "LIVE_LOG_DELAY_CONTROL_MISSING");
    assert.ok(captured.bookkeepingMs >= 330, "BOOKKEEPING_PHASE_NOT_SEPARATE");
    assert.equal(captured.encodingError, undefined);
    assert.equal(captured.output, producer.toString("utf8"));
    assert.deepEqual(captured.raw, producer);
    assert.deepEqual(await fs.readFile(path.join(root, "original.live")), producer);
  } catch (error) { record(error);
  } finally {
    await retain(async () => { if (capture) await capture; }); // Settle before snapshotting writes; deduplicate the primary error.
    await retain(async () => {
      const settled = await Promise.allSettled(writes);
      const rejected = settled.filter(result => result.status === "rejected");
      if (rejected.length) throw new AggregateError(rejected.map(result => result.reason), "LIVE_LOG_TEARDOWN_WRITE_FAILED");
    });
    await retain(() => { fs.appendFile = append; });
    await retain(() => { childProcess.spawn = spawn; });
    await retain(() => { globalThis.TextDecoder = Decoder; });
    await retain(() => syncBuiltinESMExports());
    await retain(() => fs.rm(root, { recursive: true, force: true }));
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, `CAPTURE_FIXTURE_FAILURES: ${failures.map(String).join("; ")}`);
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

test("bounded timeout keeps unobserved native exit null after guardian self-SIGKILL, never invents guardian signal or exit zero", { skip: process.platform === "win32", timeout: 15000 }, async () => {
  const source = "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000);";
  const captured = await captureCommand({ command: `exec ${quote(process.execPath)} -e ${quote(source)}`, cwd: tmpdir() }, process.env, { timeout: 5000 });
  assert.equal(captured.output, "ready"); assert.equal(captured.timedOut, true); assert.equal(captured.complete, false);
  assert.equal(captured.exitCode, null); assert.equal(captured.signal, null);
  assert.equal(captured.durationBoundary, "bounded-timeout-settlement");
  assert.ok(captured.durationMs >= 6900 && captured.durationMs < 12000, "TIMEOUT_SETTLEMENT_BOUNDARY_WRONG");
  assert.equal(captured.exitDurationMs, undefined, "UNOBSERVED_NATIVE_EXIT_SYNTHESIZED_FROM_GUARDIAN");
});
