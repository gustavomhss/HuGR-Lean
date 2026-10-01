import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";

const { captureCommand, archiveCapture } = await import(new URL("../scripts/real-world/capture.mjs", import.meta.url).href);
const { aggregate, stats } = await import(new URL("../scripts/real-world/measure.mjs", import.meta.url).href);
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

// Each producer makes one small write per pipe. Either pipe can arrive first;
// duplicated, dropped or interleaved invented bytes are not admissible here.
function mergedProducer(raw: Buffer, stdout: Buffer, stderr: Buffer): Buffer {
  const expected = [Buffer.concat([stdout, stderr]), Buffer.concat([stderr, stdout])].find((bytes) => bytes.equals(raw));
  assert.ok(expected, "NATIVE_MERGED_BYTES_DIFFER_FROM_PRODUCER");
  return expected;
}

async function assertArchives(directory: string, artifacts: any, expected: Record<string, Buffer>) {
  assert.deepEqual(Object.keys(artifacts).sort(), Object.keys(expected).sort());
  for (const [name, bytes] of Object.entries(expected)) {
    assert.equal(artifacts[name].bytes, bytes.length, `${name} byte count`);
    assert.equal(artifacts[name].sha256, createHash("sha256").update(bytes).digest("hex"), `${name} digest`);
    assert.deepEqual(gunzipSync(await readFile(path.join(directory, artifacts[name].file))), bytes, `${name} archived producer bytes`);
  }
}

test("actual native bytes and failure exit are captured, archived and recovered exactly", { skip: process.platform === "win32" }, async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "lean-capture-"));
  try {
    const stdout = Buffer.from("café 🔥\r\n"), stderr = Buffer.from("native warning\n");
    const source = `const fs=require('node:fs'); fs.writeSync(1,Buffer.from(${JSON.stringify([...stdout])})); fs.writeSync(2,Buffer.from(${JSON.stringify([...stderr])})); process.exitCode=7;`;
    const command = `exec ${quote(process.execPath)} -e ${quote(source)}`;
    const capture = await captureCommand({ command, cwd }, process.env);
    assert.equal(capture.command, command); assert.equal(capture.exitCode, 7); assert.equal(capture.signal, null);
    assert.equal(capture.complete, true); assert.equal(capture.timedOut, false);
    assert.deepEqual(capture.stdout, stdout); assert.deepEqual(capture.stderr, stderr);
    const original = mergedProducer(capture.raw, stdout, stderr);
    assert.equal(capture.output, original.toString("utf8")); assert.equal(capture.encodingError, undefined);
    const directory = path.join(cwd, "artifacts"), artifacts = await archiveCapture(directory, capture, capture.output);
    await assertArchives(directory, artifacts, { original, stdout, stderr, filtered: original });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("ready native timeout retains exact binary prefixes, live logs and archives with actual exit facts", { skip: process.platform === "win32", timeout: 15000 }, async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "lean-capture-prefix-")), server = createServer(), token = randomUUID();
  const stdout = Buffer.from([0, 255, 65, 13, 10]), stderr = Buffer.from("\0stderr 🔥\n");
  let running: Promise<any> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const ready = new Promise<number>((resolve, reject) => {
    server.on("error", reject);
    server.on("connection", (socket) => {
      let message = "";
      socket.on("data", (chunk) => {
        message += chunk.toString(); if (!message.endsWith("\n")) return;
        try {
          const owner = JSON.parse(message); assert.equal(owner.token, token);
          assert.ok(Number.isSafeInteger(owner.pid) && owner.pid > 0);
          resolve(owner.pid); socket.end("emit");
        } catch (error) { reject(error); socket.destroy(); }
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    const source = `const fs=require('node:fs'); process.on('SIGTERM',()=>process.exit(9)); setInterval(()=>{},1000); const ready=require('node:net').connect(${port},'127.0.0.1'); ready.once('data',()=>{ fs.writeSync(1,Buffer.from(${JSON.stringify([...stdout])})); fs.writeSync(2,Buffer.from(${JSON.stringify([...stderr])})); ready.end(); }); ready.write(JSON.stringify({token:${JSON.stringify(token)},pid:process.pid})+'\\n');`;
    running = captureCommand({ command: `exec ${quote(process.execPath)} -e ${quote(source)}`, cwd }, process.env, { timeout: 2000, logDir: cwd });
    const readiness = Promise.race([ready, new Promise<never>((_, reject) => {
      watchdog = setTimeout(() => reject(new Error("NATIVE_TIMEOUT_READINESS_MISSING")), 8000);
    })]);
    const [capture, pid] = await Promise.all([running, readiness]);
    assert.equal(capture.timedOut, true); assert.equal(capture.complete, false);
    assert.equal(capture.exitCode, 9); assert.equal(capture.signal, null); assert.equal(capture.launchError, undefined);
    assert.deepEqual(capture.stdout, stdout); assert.deepEqual(capture.stderr, stderr);
    const original = mergedProducer(capture.raw, stdout, stderr);
    assert.equal(capture.output, undefined); assert.ok(capture.encodingError);
    for (const [name, bytes] of Object.entries({ stdout, stderr, original })) assert.deepEqual(await readFile(path.join(cwd, `${name}.live`)), bytes);
    assert.equal(JSON.parse(await readFile(path.join(cwd, "running.json"), "utf8")).pid, pid);
    const directory = path.join(cwd, "artifacts"), artifacts = await archiveCapture(directory, capture);
    await assertArchives(directory, artifacts, { original, stdout, stderr });
  } finally {
    clearTimeout(watchdog);
    await running;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(cwd, { recursive: true, force: true });
  }
});

test("malformed native UTF-8 retains raw bytes and names unusable text", { skip: process.platform === "win32" }, async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "lean-capture-encoding-"));
  try {
    const valid = await captureCommand({ command: "printf '\\357\\273\\277café 🔥\\n'", cwd }, process.env);
    assert.equal(valid.output, "\uFEFFcafé 🔥\n"); assert.equal(valid.encodingError, undefined);
    assert.deepEqual(valid.raw, Buffer.from("\uFEFFcafé 🔥\n")); assert.deepEqual(valid.stdout, Buffer.from("\uFEFFcafé 🔥\n"));
    assert.deepEqual(valid.stderr, Buffer.alloc(0));
    const capture = await captureCommand({ command: "printf '\\377\\376bad'", cwd }, process.env);
    assert.equal(capture.complete, true); assert.equal(capture.exitCode, 0);
    assert.equal(capture.output, undefined); assert.ok(capture.encodingError);
    const original = Buffer.from([255, 254, 98, 97, 100]), stderr = Buffer.alloc(0);
    assert.deepEqual(capture.raw, original); assert.deepEqual(capture.stdout, original); assert.deepEqual(capture.stderr, stderr);
    const directory = path.join(cwd, "artifacts"), artifacts = await archiveCapture(directory, capture);
    assert.equal(artifacts.filtered, undefined);
    await assertArchives(directory, artifacts, { original, stdout: original, stderr });
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
