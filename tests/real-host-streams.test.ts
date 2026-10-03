import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { test, type TestContext } from "node:test";

const boundary = await import(new URL("../scripts/opencode-boundary.mjs", import.meta.url).href);
const host = await import(new URL("../scripts/real-world/host.mjs", import.meta.url).href);
const unicode = Buffer.from("café € 🔥\r\n\u001b[31m終\u001b[0m\n");
const binary = Buffer.concat([unicode, Buffer.from([0, 0xff, 0xc3, 0x28, 0xe2, 0x82])]);
const stderr = Buffer.concat([Buffer.from("stderr:"), binary]);

// Mocked spawn + real streams exercises plumbing, not native host compatibility.
function mockSpawn(t: TestContext, deliver: (child: ReturnType<typeof makeChild>) => void) {
  const child = makeChild();
  const replacement = t.mock.method(childProcess, "spawn", () => { queueMicrotask(() => deliver(child)); return child; });
  syncBuiltinESMExports();
  t.after(() => { replacement.mock.restore(); syncBuiltinESMExports(); child.stdout.destroy(); child.stderr.destroy(); });
  return replacement;
}
function makeChild() {
  return Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill() {}, unref() {} });
}
function feed(stream: PassThrough, bytes: Buffer, split: boolean) {
  for (const part of split ? [...bytes].map((byte) => Buffer.from([byte])) : [Buffer.from(bytes)]) {
    stream.write(part);
    part.fill(0); // Capture must own its bytes even when the producer reuses its buffer.
  }
}
function exactStreams(actual: any, out: Buffer, err: Buffer) {
  assert.ok(Buffer.isBuffer(actual.stdoutBytes)); assert.ok(Buffer.isBuffer(actual.stderrBytes));
  assert.deepEqual(actual.stdoutBytes, out); assert.deepEqual(actual.stderrBytes, err);
  assert.equal(actual.stdout, out.toString("utf8")); assert.equal(actual.stderr, err.toString("utf8"));
}

for (const [name, bytes, split] of [["whole Unicode", unicode, false], ["every-byte Unicode", unicode, true], ["invalid UTF-8", binary, true]] as const) {
  test(`stream plumbing preserves ${name} on both pipes with exit 9`, async (t) => {
    const err = Buffer.concat([Buffer.from("stderr:"), bytes]);
    const spawn = mockSpawn(t, (child) => {
      feed(child.stdout, bytes, split); feed(child.stderr, err, split);
      child.emit("exit", 9, null); child.emit("close", 9, null);
    });
    const result = await boundary.runProcess("mock-only", ["unchanged"]);
    assert.equal(spawn.mock.callCount(), 1);
    assert.deepEqual(spawn.mock.calls[0]!.arguments.slice(0, 2), ["mock-only", ["unchanged"]]);
    exactStreams(result, bytes, err);
    assert.equal(result.code, 9); assert.equal(result.signal, null);
    if (split) assert.notEqual([...bytes].map((byte) => Buffer.from([byte]).toString("utf8")).join(""), bytes.toString("utf8"));
    if (name === "invalid UTF-8") assert.notDeepEqual(Buffer.from(result.stdout), bytes);
  });
}

for (const mode of ["close", "error", "timeout"] as const) {
  test(`stream plumbing retains ${mode} raw diagnostics through runScenario wrapping`, async (t) => {
    const code = mode === "error" ? null : 9, signal = mode === "error" ? "SIGTERM" : null;
    mockSpawn(t, (child) => {
      feed(child.stdout, binary, true); feed(child.stderr, stderr, true);
      child.emit("exit", code, signal);
      if (mode === "close") child.emit("close", code, signal);
      if (mode === "error") child.emit("error", new Error("injected stream failure"));
    });
    await assert.rejects(boundary.runScenario({ binary: "mock-only", dependencies: false, keep: false, timeout: 20 }), (error: any) => {
      exactStreams(error.diagnostics, binary, stderr);
      assert.equal(error.diagnostics.code, code); assert.equal(error.diagnostics.signal, signal);
      assert.equal(error.diagnostics.requests, 0); assert.equal(error.diagnostics.toolResults, 0);
      assert.equal(typeof error.diagnostics.root, "string");
      assert.match(error.message, mode === "close" ? /OpenCode failed/ : mode === "error" ? /Cannot execute mock-only: injected stream failure/ : /OpenCode timeout after 20 ms/);
      assert.ok(error.message.includes(binary.toString("utf8")));
      if (mode !== "close") exactStreams(error.cause.diagnostics, binary, stderr);
      if (mode === "error") assert.equal(error.cause.cause.message, "injected stream failure");
      return true;
    });
  });
}

test("native Node small positive preserves pipe bytes without chunk timing assumptions", async () => {
  const script = `process.stdout.write(Buffer.from(${JSON.stringify([...binary])})); process.stderr.write(Buffer.from(${JSON.stringify([...stderr])}));`;
  const result = await boundary.runProcess(process.execPath, ["-e", script], { timeout: 5000 });
  exactStreams(result, binary, stderr);
  assert.equal(result.code, 0); assert.equal(result.signal, null);
});

for (const raw of [true, false]) for (const fails of [false, true]) {
  test(`injected archive ${fails ? "failure" : "success"} preserves ${raw ? "raw buffers" : "legacy strings"}`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hugr-stream-archive-"));
    try {
      const scenario = { id: "stream-archive", command: "mock-read", oracle: "exact", expectExit: 0 };
      const directory = path.join(root, scenario.id), text = "Mock boundary café 🔥\n";
      const streams = { code: fails ? 9 : 0, signal: null, root, stdout: binary.toString("utf8"), stderr: stderr.toString("utf8"),
        ...(raw ? { stdoutBytes: binary, stderrBytes: stderr } : {}) };
      const injected = Object.assign(new Error("injected archive failure"), { diagnostics: streams });
      const execution = { runScenario: async (options: any) => {
        await options.setup({ root });
        if (fails) throw injected;
        const input = { tool: "bash", callID: "mock-call", args: { command: scenario.command, description: "Local deterministic boundary probe", timeout: 30000 } };
        const output = { title: "mock title", output: text, metadata: { exit: 0, truncated: false, output: text } };
        const rows = [{ kind: "loaded", hookPresent: true, options: { enabled: true, raw: false } },
          { kind: "before", input, boundary: output, originalSha256: createHash("sha256").update(text).digest("hex") },
          { kind: "after", input, boundary: output, hookElapsedMs: 0 }];
        await writeFile(path.join(directory, "observer.jsonl"), rows.map((row) => JSON.stringify(row)).join("\n"));
        return { ...streams, command: scenario.command, requests: 2, modelResult: { content: text },
          tool: { callID: input.callID, state: { status: "completed", input: input.args, ...output } } };
      } };
      const pending = host.runObservedScenario({ scenario, plugin: path.join(root, "unused.mjs"), outputDir: root }, execution);
      if (fails) {
        await assert.rejects(pending, (error: any) => {
          assert.equal(error.cause, injected); assert.equal(error.diagnostics, streams); return true;
        });
        const failure = JSON.parse(await readFile(path.join(directory, "failure.json"), "utf8"));
        assert.equal(failure.status, "failed"); assert.equal(failure.mode, "mock-plumbing");
        assert.deepEqual(failure.diagnostics, JSON.parse(JSON.stringify(streams)));
      } else {
        const record = await pending;
        assert.equal(record.status, "mock_checked"); assert.equal(record.mode, "mock-plumbing");
      }
      const saved = JSON.parse(await readFile(path.join(directory, "host-result.json"), "utf8"));
      assert.equal(saved.code, streams.code); assert.equal(saved.signal, null);
      for (const [name, file, bytes] of [["stdout", "host.stdout.jsonl", binary], ["stderr", "host.stderr.txt", stderr]] as const) {
        assert.notDeepEqual(Buffer.from(streams[name]), bytes, "Decoded text cannot be the raw-byte oracle");
        assert.deepEqual(await readFile(path.join(directory, file)), raw ? bytes : Buffer.from(streams[name]));
        assert.deepEqual(saved[`${name}Bytes`], raw ? bytes.toJSON() : undefined);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
