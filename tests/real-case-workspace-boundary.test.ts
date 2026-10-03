import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdtemp, realpath, rm, writeFile, readFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { test } from "node:test";
const { caseWorkspace } = await import(new URL("../scripts/real-world/case-workspace.mjs", import.meta.url).href);
test("IPC mock plumbing only: reply validation and raw failure retention; not native filesystem proof", async (t) => {
  const source = await realpath(await mkdtemp(path.join(tmpdir(), "hugr-ipc-")));
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  try {
    Object.defineProperty(process, "platform", { ...platform, value: "linux" }); // Exercise IPC on every host, not native Windows.
    await writeFile(path.join(source, "keep"), "SOURCE_CONTROL");
    const workspace = { source, cwd: path.join(source, "owned"), retained: true, sourceReadOnly: true };
    const success = { ok: true, workspace }, partial = { ...workspace, phase: "partial" };
    const rows: [string, any, string | undefined, Error?][] = [
      ["valid reply", success, undefined], ...["", "unrecognized backend detail"].map((message): [string, any, string] => [`unknown backend: ${message}`, { ok: false, error: { code: "FOREIGN_BACKEND", message } }, "FOREIGN_BACKEND"]),
      ...[{}, [], "", "relative", source].map((cwd): [string, any, string] => [`cwd=${JSON.stringify(cwd)}`, { ...success, workspace: { ...workspace, cwd } }, "CASE_HELPER_PROTOCOL"]),
      ...[{ source: 42 }, { retained: 1 }, { sourceReadOnly: false }].map((patch): [string, any, string] => [`workspace=${JSON.stringify(patch)}`, { ...success, workspace: { ...workspace, ...patch } }, "CASE_HELPER_PROTOCOL"]),
      ...[null, {}, { ok: "true" }, "malformed stdout"].map((reply): [string, any, string] => [JSON.stringify(reply), reply, "CASE_HELPER_PROTOCOL"]),
      ...[undefined, {}, { code: "", message: "x" }, { code: 42, message: "x" }, { code: "X", message: null }].map((error): [string, any, string] => [`error=${JSON.stringify(error)}`, { ok: false, error }, "CASE_HELPER_PROTOCOL"]),
      ["spawn ENOENT", null, "ENOENT", Object.assign(new Error("spawn python3 ENOENT"), { code: "ENOENT" })],
      ["killed timeout", null, "CASE_HELPER_FAILED", Object.assign(new Error("timeout"), { killed: true, signal: "SIGTERM" })],
    ];
    for (const [name, reply, code, cause] of rows) await t.test(name, async () => {
      const stdout = Buffer.from(typeof reply === "string" ? reply : JSON.stringify(reply));
      const stderr = Buffer.concat([Buffer.from(JSON.stringify({ workspace: partial }) + "\n"), Buffer.from([0, 255])]);
      t.mock.method(childProcess, "execFile", (...args: any[]) => {
        assert.equal(args[0], "python3"); assert.deepEqual(args[1].slice(0, 3), ["-I", "-S", "-B"]);
        assert.equal(args[2].encoding, "buffer"); assert.equal(args[2].timeout, 120_000);
        queueMicrotask(() => args[3](cause, stdout, stderr));
        return { stdin: new Writable({ write(chunk, _encoding, done) {
          assert.deepEqual(JSON.parse(chunk.toString()), { source, changes: [{ path: "keep", append: true, bytes: Buffer.from("🦣").toString("base64") }] }); done();
        } }) } as any;
      });
      syncBuiltinESMExports(); const c = caseWorkspace(source, [{ path: "keep", append: true, text: "🦣" }]);
      try {
        if (!code) { await c.prepare(); assert.equal(c.cwd, workspace.cwd); }
        else await assert.rejects(c.prepare(), (error: any) => {
          assert.equal(error.code, code); assert.equal(error.message, cause ? `CASE_HELPER_FAILED: ${cause.message}` : code === "FOREIGN_BACKEND" ? reply.error.message : "CASE_HELPER_PROTOCOL"); assert.equal(error.stdout, stdout); assert.equal(error.stderr, stderr);
          if (cause) assert.equal(error.cause, cause); else if (typeof reply === "string") assert.ok(error.cause instanceof SyntaxError);
          assert.deepEqual(error.workspace, reply?.workspace ?? partial); assert.equal(c.cwd, source); return true;
        });
        const metadata = c.workspace; assert.deepEqual(metadata, reply?.workspace ?? partial); await c.restore(); await c.restore(); assert.equal(c.cwd, source); assert.equal(c.workspace, metadata);
        assert.equal(await readFile(path.join(source, "keep"), "utf8"), "SOURCE_CONTROL");
      } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
    });
  } finally { Object.defineProperty(process, "platform", platform); await rm(source, { recursive: true, force: true }); }
});
