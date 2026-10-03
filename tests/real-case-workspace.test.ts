import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readlink, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
const { caseWorkspace } = await import(new URL("../scripts/real-world/case-workspace.mjs", import.meta.url).href);
const helper = fileURLToPath(new URL("../scripts/real-world/case-workspace.py", import.meta.url));
const run = promisify(execFile);
type Change = { path: string; text: string; append?: boolean };
function control(name: string, action: (root: string, source: string) => Promise<void>) {
  test(name, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hugr-owned-")), source = path.join(root, "source");
    try {
      await mkdir(source);
      await writeFile(path.join(source, "keep"), "SOURCE_CONTROL");
      if (process.platform === "win32") {
        const c = caseWorkspace(source, [{ path: "keep", append: true, text: "WRONG" }]);
        await assert.rejects(c.prepare(), { code: "CASE_WORKSPACE_UNSUPPORTED" });
        await c.restore();
        assert.equal(c.cwd, source);
        assert.equal(c.workspace, undefined);
        assert.equal(await readFile(path.join(source, "keep"), "utf8"), "SOURCE_CONTROL");
        assert.deepEqual(await readdir(root), ["source"]);
      } else await action(root, source);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
control("owned binary copy, append/new UTF-8 bytes, modes and opaque symlinks; Windows rejects preserving source", async (root, source) => {
  const binary = Buffer.from([0, 255, 128, 65]), text = "🦣\ud800";
  await mkdir(path.join(source, "sub"));
  await writeFile(path.join(source, "sub/binary"), binary);
  await chmod(path.join(source, "keep"), 0o755);
  await symlink("/UNRESOLVED_FOREIGN", path.join(source, "opaque"));
  const c = caseWorkspace(source, [{ path: "sub/binary", append: true, text }, { path: "sub/new", text }]);
  assert.equal(c.cwd, source);
  await c.prepare();
  assert.notEqual(c.cwd, source);
  assert.deepEqual(c.workspace, { source: await realpath(source), cwd: c.cwd, retained: true, sourceReadOnly: true });
  assert.deepEqual(await readFile(path.join(c.cwd, "sub/binary")), Buffer.concat([binary, Buffer.from(text, "utf8")]));
  assert.deepEqual(await readFile(path.join(c.cwd, "sub/new")), Buffer.from(text, "utf8"));
  assert.deepEqual(await readFile(path.join(source, "sub/binary")), binary);
  assert.deepEqual(await readdir(path.join(source, "sub")), ["binary"]);
  assert.equal(await readFile(path.join(c.cwd, "keep"), "utf8"), "SOURCE_CONTROL");
  assert.equal((await lstat(path.join(c.cwd, "keep"))).mode & 0o777, 0o755);
  assert.notEqual((await lstat(path.join(c.cwd, "keep"))).ino, (await lstat(path.join(source, "keep"))).ino);
  assert.equal((await lstat(c.cwd)).mode & 0o777, 0o700);
  assert.equal(await readlink(path.join(c.cwd, "opaque")), "/UNRESOLVED_FOREIGN");
  await assert.rejects(c.prepare(), { code: "CASE_ALREADY_PREPARED" });
  const retained = c.cwd;
  await writeFile(path.join(source, "keep"), "FOREIGN_SOURCE");
  await writeFile(path.join(retained, "keep"), "FOREIGN_WORKSPACE");
  const versions = await Promise.all([source, retained].map((dir) => lstat(path.join(dir, "keep"))));
  await c.restore(); await c.restore();
  assert.equal(c.cwd, source);
  assert.equal(c.workspace.cwd, retained);
  assert.deepEqual(await Promise.all([source, retained].map((dir) => lstat(path.join(dir, "keep")))), versions);
  assert.equal(await readFile(path.join(source, "keep"), "utf8"), "FOREIGN_SOURCE");
  assert.equal(await readFile(path.join(retained, "keep"), "utf8"), "FOREIGN_WORKSPACE");
  assert.ok((await readdir(root)).includes(path.basename(retained)));
});
control("invalid, existing, missing, symlink-parent and hardlinked recipes retain source/foreign bytes", async (root, source) => {
  const foreign = path.join(root, "foreign");
  await mkdir(foreign); await writeFile(path.join(foreign, "keep"), "FOREIGN_CONTROL");
  await symlink(foreign, path.join(source, "alias"));
  await symlink("ABSENT", path.join(source, "dangling"));
  await link(path.join(source, "keep"), path.join(source, "hard"));
  const cases: [Change[], string][] = [
    ...["../foreign/keep", "/absolute", "", "nul\0"].map((p): [Change[], string] => [[{ path: p, text: "WRONG" }], "CASE_INVALID_PATH"]),
    [[{ path: "x", text: "1" }, { path: "x", text: "2" }], "CASE_DUPLICATE_CHANGE"],
    [[{ path: "keep", text: "WRONG" }], "CASE_WOULD_OVERWRITE"],
    [[{ path: "dangling", text: "WRONG" }], "CASE_WOULD_OVERWRITE"],
    [[{ path: "hard", append: true, text: "WRONG" }], "CASE_APPEND_NOT_SINGLE_REGULAR"],
    [[{ path: "dangling", append: true, text: "WRONG" }], "CASE_APPEND_NOT_SINGLE_REGULAR"],
    [[{ path: "alias/keep", text: "WRONG" }], "CASE_PARENT_NOT_DIRECTORY"],
    [[{ path: "missing/new", text: "WRONG" }], "CASE_PARENT_NOT_DIRECTORY"],
    [[{ path: "absent", append: true, text: "WRONG" }], "CASE_APPEND_MISSING"],
  ];
  for (const [changes, code] of cases) {
    const c = caseWorkspace(source, changes);
    await assert.rejects(c.prepare(), (error: any) => {
      assert.equal(error.code, code); assert.match(error.message, new RegExp(code));
      assert.ok(Buffer.isBuffer(error.stdout) && Buffer.isBuffer(error.stderr)); return true;
    });
    assert.equal(c.cwd, source);
    if (c.workspace) assert.ok((await lstat(c.workspace.cwd)).isDirectory());
    await c.restore();
    assert.equal(await readFile(path.join(source, "keep"), "utf8"), "SOURCE_CONTROL");
    assert.equal(await readFile(path.join(source, "hard"), "utf8"), "SOURCE_CONTROL");
    assert.equal(await readFile(path.join(foreign, "keep"), "utf8"), "FOREIGN_CONTROL");
    assert.deepEqual(await readdir(foreign), ["keep"]);
  }
});
control("native pinned-ancestor swap, source mutation, special entry and errno controls", async (root, source) => {
  await mkdir(path.join(source, "sub")); await writeFile(path.join(source, "sub/file"), "COPY_CONTROL");
  await mkdir(path.join(root, "foreign")); await writeFile(path.join(root, "foreign/keep"), "FOREIGN_CONTROL");
  const script = `
import importlib.util, json, os, sys
spec = importlib.util.spec_from_file_location("backend", sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
source, root, mode = sys.argv[2:]
real_open = os.open; fired = False; seen = 0
def boundary(name, flags, permissions=0o777, *, dir_fd=None):
    global fired, seen
    fd = real_open(name, flags, permissions, dir_fd=dir_fd)
    if mode == "late" and name == "sub" and flags & os.O_DIRECTORY and os.listdir(fd):
        seen += 1
        if seen == 2:
            fired = True
            with open(os.path.join(source, "sub/file"), "wb") as f: f.write(b"FOREIGN_SOURCE")
    if not fired and mode == "mutate" and name == "file" and flags & os.O_NONBLOCK:
        fired = True
        with open(os.path.join(source, "sub/file"), "wb") as f: f.write(b"FOREIGN_SOURCE")
    if not fired and mode == "swap" and name == "sub" and flags & os.O_DIRECTORY:
        # Source sub contains file; newly created destination sub is empty.
        if not os.listdir(fd):
            fired = True
            os.rename("sub", "retained-sub", src_dir_fd=dir_fd, dst_dir_fd=dir_fd)
            os.symlink(os.path.join(root, "foreign"), "sub", dir_fd=dir_fd)
    return fd
os.open = boundary
# Capability set names original callable; monkeypatch must retain native capability fact.
os.supports_dir_fd.add(boundary)
result = m.build(dict(source=source, changes=[]))
assert fired, "BOUNDARY_NOT_EXERCISED"
assert not result["ok"] and result["error"]["code"] == ("CASE_DESTINATION_CHANGED" if mode == "swap" else "CASE_SOURCE_CHANGED"), result
print(json.dumps(result))
`;
  for (const mode of ["swap", "mutate", "late"]) {
    const { stdout } = await run("python3", ["-B", "-c", script, helper, await realpath(source), await realpath(root), mode], { timeout: 30_000 });
    const result = JSON.parse(stdout);
    assert.equal(result.workspace.retained, true);
    assert.ok((await readdir(root)).includes(path.basename(result.workspace.cwd)));
    assert.equal(await readFile(path.join(root, "foreign/keep"), "utf8"), "FOREIGN_CONTROL");
    assert.deepEqual(await readdir(path.join(root, "foreign")), ["keep"]);
    assert.equal(await readFile(path.join(source, "sub/file"), "utf8"), mode === "swap" ? "COPY_CONTROL" : "FOREIGN_SOURCE");
  }
  await run("python3", ["-c", "import os,sys; os.mkfifo(sys.argv[1])", path.join(source, "fifo")]);
  await assert.rejects(caseWorkspace(source, []).prepare(), /CASE_UNSUPPORTED_ENTRY: fifo/);
  const c = caseWorkspace(path.join(source, "keep"), []);
  await assert.rejects(c.prepare(), (error: any) => error.code === "ENOTDIR" && /CASE_FILESYSTEM/.test(error.message));
});
control("bounded native FD pressure: 2 and 48 siblings at RLIMIT_NOFILE=64", async (root) => {
  const script = `
import importlib.util, json, os, pathlib, resource, sys
spec = importlib.util.spec_from_file_location("backend", sys.argv[1])
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
resource.setrlimit(resource.RLIMIT_NOFILE, (64, hard))
for count in (2, 48):
    source = pathlib.Path(sys.argv[2]) / str(count); source.mkdir()
    for i in range(count):
        child = source / str(i); child.mkdir(); (child / "file").write_bytes(b"SOURCE\\x00\\xff"); (child / "file").chmod(0o755)
    changes = [dict(path="0/file", append=True, bytes="WA=="), dict(path=str(count-1)+"/new", append=False, bytes="WA==")]
    result = m.build(dict(source=str(source), changes=changes))
    assert result["ok"], result
    owned = pathlib.Path(result["workspace"]["cwd"])
    for i in range(count):
        assert (source / str(i) / "file").read_bytes() == b"SOURCE\\x00\\xff"
        assert (owned / str(i) / "file").read_bytes() == b"SOURCE\\x00\\xff" + (b"X" if i == 0 else b"")
        assert all((p / str(i) / "file").stat().st_mode & 0o777 == 0o755 for p in (source, owned))
        assert sorted(p.name for p in (source / str(i)).iterdir()) == ["file"]
    assert (owned / str(count-1) / "new").read_bytes() == b"X"
print(json.dumps(dict(limit=resource.getrlimit(resource.RLIMIT_NOFILE)[0], counts=[2,48], ok=True)))`;
  const { stdout } = await run("python3", ["-I", "-S", "-B", "-c", script, helper, await realpath(root)], { timeout: 30_000 });
  assert.deepEqual(JSON.parse(stdout), { limit: 64, counts: [2, 48], ok: true });
});
control("ordinary Python startup injection fires; isolated workspace startup preserves source", async (root, source) => {
  const saved = { ...process.env }, marker = path.join(root, "STARTUP_MARKER"), config = path.join(root, "config");
  try {
    await mkdir(config);
    await writeFile(path.join(config, "sitecustomize.py"), `from pathlib import Path\nPath(${JSON.stringify(marker)}).write_text("FIRED")\nPath(${JSON.stringify(path.join(source, "keep"))}).write_text("STARTUP_INJECTION")\n`);
    process.env.PYTHONPATH = config;
    await run("python3", ["-B", "-c", "pass"], { timeout: 30_000 });
    assert.equal(await readFile(marker, "utf8"), "FIRED");
    assert.equal(await readFile(path.join(source, "keep"), "utf8"), "STARTUP_INJECTION");
    await rm(marker); await writeFile(path.join(source, "keep"), "SOURCE_CONTROL");
    const c = caseWorkspace(source, [{ path: "keep", append: true, text: "X" }]);
    await c.prepare();
    assert.equal(await readFile(path.join(source, "keep"), "utf8"), "SOURCE_CONTROL");
    assert.equal(await readFile(path.join(c.cwd, "keep"), "utf8"), "SOURCE_CONTROLX");
    await assert.rejects(lstat(marker), { code: "ENOENT" });
    await c.restore();
    assert.equal(await readFile(path.join(source, "keep"), "utf8"), "SOURCE_CONTROL");
  } finally { process.env = saved; }
});
