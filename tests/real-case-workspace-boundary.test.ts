import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { test } from "node:test";
const { caseWorkspace } = await import(new URL("../scripts/real-world/case-workspace.mjs", import.meta.url).href);
test("IPC mock plumbing only: reply validation and raw failure retention; not native filesystem proof", async (t) => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "hugr-ipc-"))), source = path.join(root, "source");
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
  try {
    const owned = () => `.hugr-case-${randomBytes(16).toString("hex")}`;
    const copy = path.join(root, owned()), alias = path.join(root, owned()), missing = path.join(root, owned()), file = path.join(root, owned());
    const unrelated = path.join(root, "unrelated", owned());
    const badNames = [".hugr-case-" + "A".repeat(32), ".hugr-case-" + "a".repeat(31), ".hugr-case-" + "a".repeat(33)].map((name) => path.join(root, name));
    for (const dir of [source, path.join(source, ".git"), path.join(source, "child"), copy, unrelated, ...badNames]) await mkdir(dir, { recursive: true });
    await symlink(source, alias, platform.value === "win32" ? "junction" : "dir"); await writeFile(file, "NOT_DIRECTORY");
    Object.defineProperty(process, "platform", { ...platform, value: "linux" }); // Exercise IPC on every host, not native Windows.
    await writeFile(path.join(source, "keep"), "SOURCE_CONTROL");
    await writeFile(path.join(source, ".git/index"), "INDEX_CONTROL");
    const versions = await Promise.all(["keep", ".git/index"].map(async (p) => { const s = await stat(path.join(source, p)); return [s.ino, s.mtimeMs, s.ctimeMs]; }));
    const workspace = { source, cwd: copy, retained: true, sourceReadOnly: true };
    const success = { ok: true, workspace }, partial = { ...workspace, phase: "partial" };
    const rows: [name: string, reply: any, code: string | undefined, cause?: Error | undefined, retainPartial?: boolean][] = [
      ["valid reply", success, undefined], ...["", "unrecognized backend detail"].map((message): [string, any, string] => [`unknown backend: ${message}`, { ok: false, error: { code: "FOREIGN_BACKEND", message } }, "FOREIGN_BACKEND"]),
      ["canonical owned cwd", { ...success, workspace: { ...workspace, cwd: copy + path.sep + "." } }, undefined],
      ["null workspace retains partial", { ok: true, workspace: null }, undefined],
      ["missing workspace retains partial", { ok: true }, undefined],
      ["valid failure workspace", { ok: false, workspace, error: { code: "FOREIGN_BACKEND", message: "" } }, "FOREIGN_BACKEND"],
      ...[{}, [], "", "relative"].map((cwd): [string, any, string, undefined, boolean] => [`cwd=${JSON.stringify(cwd)}`, { ...success, workspace: { ...workspace, cwd } }, "CASE_HELPER_PROTOCOL", undefined, true]),
      ...[source, source + path.sep + ".", source + path.sep, source + path.sep + ".." + path.sep + "source", alias, path.join(source, "child"), unrelated, path.dirname(unrelated), missing, file, ...badNames].map((cwd): [string, any, string, undefined, boolean] => [`owned boundary cwd=${cwd}`, { ...success, workspace: { ...workspace, cwd } }, "CASE_HELPER_PROTOCOL", undefined, true]),
      ...[{ source: 42 }, { retained: 1 }, { sourceReadOnly: false }].map((patch): [string, any, string, undefined, boolean] => [`workspace=${JSON.stringify(patch)}`, { ...success, workspace: { ...workspace, ...patch } }, "CASE_HELPER_PROTOCOL", undefined, true]),
      ...[true, false].flatMap((ok) => [42, [], {}, { ...workspace, cwd: 42 }].map((workspace): [string, any, string, undefined, boolean] => [`malformed workspace=${JSON.stringify(workspace)} ok=${ok}`, { ok, workspace, error: { code: "FOREIGN_BACKEND", message: "retained failure" } }, "CASE_HELPER_PROTOCOL", undefined, true])),
      ...[null, {}, { ok: "true" }, "malformed stdout"].map((reply): [string, any, string] => [JSON.stringify(reply), reply, "CASE_HELPER_PROTOCOL"]),
      ...[undefined, {}, { code: "", message: "x" }, { code: 42, message: "x" }, { code: "X", message: null }].map((error): [string, any, string] => [`error=${JSON.stringify(error)}`, { ok: false, error }, "CASE_HELPER_PROTOCOL"]),
      ["spawn ENOENT", null, "ENOENT", Object.assign(new Error("spawn python3 ENOENT"), { code: "ENOENT" })],
      ["killed timeout", null, "CASE_HELPER_FAILED", Object.assign(new Error("timeout"), { killed: true, signal: "SIGTERM" })],
    ];
    for (const [name, reply, code, cause, retainPartial] of rows) await t.test(name, async () => {
      const expected = retainPartial || reply?.workspace == null ? partial : reply.workspace;
      const stdout = Buffer.from(typeof reply === "string" ? reply : JSON.stringify(reply));
      const stderr = Buffer.concat([Buffer.from([partial, 42, [], {}, { ...workspace, source: 42 }].map((workspace) => JSON.stringify({ workspace })).join("\n") + "\n"), Buffer.from([0, 255])]);
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
        if (!code) { await c.prepare(); assert.equal(c.cwd, copy); }
        else await assert.rejects(c.prepare(), (error: any) => {
          assert.equal(error.code, code); assert.equal(error.message, cause ? `CASE_HELPER_FAILED: ${cause.message}` : code === "FOREIGN_BACKEND" ? reply.error.message : "CASE_HELPER_PROTOCOL"); assert.equal(error.stdout, stdout); assert.equal(error.stderr, stderr);
          if (cause) assert.equal(error.cause, cause); else if (typeof reply === "string") assert.ok(error.cause instanceof SyntaxError);
          if (reply?.workspace?.cwd === missing) assert.equal(error.cause?.code, "ENOENT");
          assert.deepEqual(error.workspace, expected); assert.deepEqual(c.workspace, expected); assert.equal(error.workspace, c.workspace); assert.equal(c.cwd, source); return true;
        });
        const metadata = c.workspace; assert.deepEqual(metadata, expected); await c.restore(); await c.restore(); assert.equal(c.cwd, source); assert.equal(c.workspace, metadata);
        await assert.rejects(c.prepare(), { code: "CASE_ALREADY_PREPARED" });
        assert.equal(await readFile(path.join(source, "keep"), "utf8"), "SOURCE_CONTROL");
        assert.equal(await readFile(path.join(source, ".git/index"), "utf8"), "INDEX_CONTROL");
        assert.deepEqual((await readdir(source)).sort(), [".git", "child", "keep"]);
        assert.deepEqual(await Promise.all(["keep", ".git/index"].map(async (p) => { const s = await stat(path.join(source, p)); return [s.ino, s.mtimeMs, s.ctimeMs]; })), versions);
      } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
    });
  } finally { Object.defineProperty(process, "platform", platform); await rm(root, { recursive: true, force: true }); }
});
