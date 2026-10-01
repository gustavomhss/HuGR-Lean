import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";

const { captureCommand, archiveCapture } = await import(new URL("../scripts/real-world/capture.mjs", import.meta.url).href);
const { aggregate, stats } = await import(new URL("../scripts/real-world/measure.mjs", import.meta.url).href);

test("actual native bytes and failure exit are captured, archived and recovered exactly", { skip: process.platform === "win32" }, async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "lean-capture-"));
  try {
    const command = "printf 'café 🔥\\r\\n'; printf 'native warning\\n' >&2; exit 7";
    const capture = await captureCommand({ command, cwd }, process.env);
    assert.equal(capture.command, command); assert.equal(capture.exitCode, 7); assert.equal(capture.signal, null);
    assert.equal(capture.complete, true); assert.equal(capture.timedOut, false);
    assert.equal(capture.stdout.toString(), "café 🔥\r\n"); assert.equal(capture.stderr.toString(), "native warning\n");
    assert.ok(capture.output.includes("café 🔥\r\n") && capture.output.includes("native warning\n"));
    const artifacts = await archiveCapture(path.join(cwd, "artifacts"), capture, capture.output);
    assert.deepEqual(gunzipSync(await readFile(path.join(cwd, "artifacts", artifacts.original.file))), capture.raw);
    assert.equal(artifacts.original.bytes, capture.raw.length);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("timeout retains partial native output without inventing completed exit", { skip: process.platform === "win32" }, async () => {
  const capture = await captureCommand({ command: "printf observed-prefix; sleep 10", cwd: tmpdir() }, process.env, { timeout: 150 });
  assert.equal(capture.timedOut, true); assert.equal(capture.complete, false); assert.equal(capture.output, "observed-prefix");
  assert.ok(capture.exitCode === null || capture.signal !== null);
});

test("malformed native UTF-8 retains raw bytes and names unusable text", { skip: process.platform === "win32" }, async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "lean-capture-encoding-"));
  try {
    const valid = await captureCommand({ command: "printf '\\357\\273\\277café 🔥\\n'", cwd }, process.env);
    assert.equal(valid.output, "\uFEFFcafé 🔥\n"); assert.equal(valid.encodingError, undefined);
    const capture = await captureCommand({ command: "printf '\\377\\376bad'", cwd }, process.env);
    assert.equal(capture.complete, true); assert.equal(capture.exitCode, 0);
    assert.equal(capture.output, undefined); assert.ok(capture.encodingError);
    assert.deepEqual(capture.raw, Buffer.from([255, 254, 98, 97, 100]));
    const artifacts = await archiveCapture(path.join(cwd, "artifacts"), capture);
    assert.equal(artifacts.filtered, undefined);
    assert.deepEqual(gunzipSync(await readFile(path.join(cwd, "artifacts", artifacts.original.file))), capture.raw);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("capture timeout settles when a detached descendant holds both pipes open", { skip: process.platform === "win32", timeout: 15000 }, async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "lean-capture-pipes-"));
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const token = randomUUID(), server = createServer();
  let ownedPid: number | undefined;
  const ownership = new Promise<number>((resolve, reject) => {
    server.on("error", reject);
    server.on("connection", (socket) => {
      let message = "";
      socket.on("data", (chunk) => {
        message += chunk.toString(); if (!message.endsWith("\n")) return;
        try {
          const owner = JSON.parse(message); assert.equal(owner.token, token);
          assert.ok(Number.isSafeInteger(owner.pid) && owner.pid > 0);
          ownedPid = owner.pid; resolve(owner.pid); socket.end("owned");
        } catch (error) { reject(error); socket.destroy(); }
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    const source = `const child = require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {detached:true, stdio:['ignore',1,2]}); const owner = require('node:net').connect(${port}, '127.0.0.1'); owner.once('data', () => { require('node:fs').writeFileSync('descendant.pid', String(child.pid)); process.stdout.write('descendant=' + child.pid + '\\n'); process.stderr.write('retained-stderr\\n'); child.unref(); }); owner.write(JSON.stringify({token:${JSON.stringify(token)}, pid:child.pid}) + '\\n');`;
    const [capture] = await Promise.race([
      Promise.all([captureCommand({ command: `${JSON.stringify(process.execPath)} -e ${JSON.stringify(source)}`, cwd }, process.env, { timeout: 1500, logDir: cwd }), ownership]),
      new Promise<never>((_, reject) => { watchdog = setTimeout(() => reject(new Error("CAPTURE_DID_NOT_SETTLE")), 10000); }),
    ]);
    assert.equal(capture.timedOut, true); assert.equal(capture.complete, false);
    assert.equal(capture.exitCode, 0); assert.equal(capture.signal, null);
    assert.match(capture.stdout.toString(), /^descendant=\d+\n$/);
    assert.equal(capture.stderr.toString(), "retained-stderr\n");
  } finally {
    clearTimeout(watchdog);
    let cleanupError: unknown;
    try {
      const pid = await readFile(path.join(cwd, "descendant.pid"), "utf8");
      assert.match(pid, /^[1-9]\d*$/, "CAPTURE_OWNERSHIP_PID_RECORD_INVALID");
      assert.equal(Number(pid), ownedPid, "CAPTURE_OWNERSHIP_PID_RECORD_MISMATCH");
    } catch (error) { cleanupError = (error as NodeJS.ErrnoException).code === "ENOENT" ? new Error("CAPTURE_OWNERSHIP_PID_RECORD_MISSING") : error; }
    try { if (ownedPid) process.kill(ownedPid, "SIGKILL"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    finally { await new Promise<void>((resolve) => server.close(() => resolve())); await rm(cwd, { recursive: true, force: true }); }
    if (cleanupError) throw cleanupError;
  }
});

test("missing native cwd is a launch failure, never successful empty output", { skip: process.platform === "win32" }, async () => {
  const capture = await captureCommand({ command: "printf should-not-run", cwd: path.join(tmpdir(), "missing-lean-capture-cwd") }, process.env);
  assert.ok(capture.launchError.includes("ENOENT")); assert.equal(capture.complete, false); assert.equal(capture.exitCode, null);
});

test("weighted aggregate includes zero savings and keeps controls separate", () => {
  const row = (id: string, category: string, inputBytes: number, outputBytes: number) => ({ id, category, inputBytes, outputBytes, decision: inputBytes === outputBytes ? "passthrough" : "reduced", material: false,
    evidence: { ok: true }, captureMs: 10, core: { wallMs: { p95: 1 } }, adapterRawOff: { wallMs: { p95: 2 } } });
  const records = [row("one", "primary", 100, 50), row("two", "primary", 900, 900), row("control", "control", 10000, 1)];
  assert.equal(aggregate(records, "primary").weightedReductionPercent, 5);
  assert.equal(aggregate(records, "primary").cases, 2); assert.equal(aggregate(records, "primary").reduced, 1);
  assert.throws(() => aggregate([], "primary"), /EMPTY_CATEGORY/);
  assert.throws(() => stats([]), /EMPTY_OR_INVALID/); assert.throws(() => stats([NaN]), /EMPTY_OR_INVALID/);
  assert.equal(stats(Array.from({ length: 100 }, (_, i) => i + 1)).p95, 95);
});
