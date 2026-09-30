import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, lstat, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { profiles } from "../src/profiles/index.js";
import { RawStore } from "../src/raw/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(new URL("../dist/cli/index.js", import.meta.url));
const summary = "    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.46s\n";
const cargo = "   Compiling cli_fixture v0.1.0 (/tmp/🔥 café)\n" + summary;
const complete = ["filter", "--command", "cargo build", "--exit-code", "0", "--complete"];

before(async () => {
  // npm test also works on a clean checkout, where check builds only after tests.
  await promisify(execFile)(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.build.json"], { cwd: root });
  assert.ok((await readFile(cli, "utf8")).startsWith("#!/usr/bin/env node\n"));
});

async function sandbox(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "hugr-lean-cli-"));
  const children: ReturnType<typeof spawn>[] = [];
  t.after(async () => {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill();
    await rm(directory, { recursive: true, force: true });
  });
  function start(args: string[]) {
    const child = spawn(process.execPath, [cli, ...args], { cwd: directory,
      env: { ...process.env, HOME: directory, USERPROFILE: directory }, stdio: ["pipe", "pipe", "pipe"], timeout: 15_000 });
    children.push(child);
    const out: Buffer[] = [], err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.stdin.on("error", (error: NodeJS.ErrnoException) => { if (error.code !== "EPIPE") err.push(Buffer.from(error.message)); });
    const done = new Promise<{ code: number | null; stdout: Buffer; stderr: string }>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => {
        if (signal) reject(new Error(`CLI terminated by ${signal}: ${Buffer.concat(err)}`));
        else resolve({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString("utf8") });
      });
    });
    return { child, done };
  }
  async function run(args: string[], input: string | Buffer = "") {
    const { child, done } = start(args);
    child.stdin.end(input);
    return await done;
  }
  return { directory, start, run };
}
function exact(result: { code: number | null; stdout: Buffer; stderr: string }, expected: string | Buffer): void {
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(result.stdout, Buffer.from(expected));
}

test("compiled version and doctor report package facts from an isolated cwd", async (t) => {
  const { directory, run } = await sandbox(t);
  const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  for (const command of ["version", "--version"]) exact(await run([command]), `${version}\n`);
  const result = await run(["doctor"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout.toString()), { version, node: process.version,
    profiles: profiles.map((profile) => profile.id), defaultRawDirectory: join(directory, ".cache", "hugr-lean", "raw"), pluginURL: new URL("../dist/index.js", import.meta.url).href });
  assert.deepEqual(await readdir(directory), [], "doctor must not create the raw directory");
});

test("filter emits only exact admitted replacement, including unterminated output and CRLF", async (t) => {
  const { run } = await sandbox(t);
  exact(await run(complete, cargo), summary);
  exact(await run(complete, cargo.trimEnd()), summary.trimEnd());
  exact(await run(complete, cargo.replaceAll("\n", "\r\n")), summary.replaceAll("\n", "\r\n"));
});

test("missing execution metadata and failed exit never infer success", async (t) => {
  const { run } = await sandbox(t);
  for (const flags of [[], ["--complete"], ["--exit-code", "0"], ["--exit-code", "1", "--complete"], ["--exit-code", "137", "--complete", "--terminal-rendered"]]) {
    exact(await run(["filter", "--command", "cargo build", ...flags], cargo), cargo);
  }
});

test("unknown commands, shell pipelines, warnings and invalid UTF-8 retain original bytes", async (t) => {
  const { directory, run, start } = await sandbox(t);
  const literal = `${JSON.stringify(process.execPath)} -e ${JSON.stringify("require('node:fs').writeFileSync('executed', 'bad')")}`;
  for (const command of ["unknown", "cargo build | tee executed", literal]) {
    exact(await run(["filter", "--command", command, "--complete", "--exit-code", "0"], cargo), cargo);
  }
  for (const input of ["warning: café 🔥\n" + cargo, "\ufeff" + cargo, "", "\x1b[31mFAIL\x1b[0m\r\n🔥\0last", Buffer.from([0xff, 0xc3, 0x28, 0xe2, 0x82])]) {
    exact(await run([...complete, "--terminal-rendered"], input), input);
  }
  const unicode = Buffer.from("unknown 🔥 café 漢字\r\nlast");
  const { child, done } = start(complete);
  for (const byte of unicode) child.stdin.write(Buffer.from([byte]));
  child.stdin.end();
  exact(await done, unicode);
  assert.deepEqual(await readdir(directory), [], "literal command must never execute");
});

test("SGR removal requires explicit terminal presentation and admitted grammar", async (t) => {
  const { run } = await sandbox(t);
  const colored = `\x1b[32m${cargo}\x1b[0m`;
  exact(await run(complete, colored), colored);
  exact(await run([...complete, "--terminal-rendered"], colored), summary);
  exact(await run([...complete, "--terminal-rendered"], `\x1b[32m${summary}\x1b[0m`), summary);
});

test("4 MiB admission boundary uses bytes and larger input stays exact", async (t) => {
  const { run } = await sandbox(t);
  const head = "   Compiling cli_fixture v0.1.0 (", tail = ")\n" + summary;
  const limit = 4 * 1024 * 1024;
  const input = head + "é".repeat((limit - Buffer.byteLength(head + tail) - 1) / 2) + "x" + tail;
  assert.equal(Buffer.byteLength(input), limit);
  exact(await run(complete, input), summary);
  const larger = input.replace(")\n", "x)\n");
  exact(await run(complete, larger), larger);
});

test("oversized stdin streams before EOF and preserves bytes beyond 16 MiB", async (t) => {
  const { start } = await sandbox(t);
  const { child, done } = start(complete);
  const prefix = Buffer.alloc(4 * 1024 * 1024 + 1, 0x61), suffix = Buffer.alloc(12 * 1024 * 1024 + 1, 0xff);
  const first = once(child.stdout, "data");
  child.stdin.write(prefix);
  await Promise.race([first, done.then(() => { throw new Error("CLI did not stream before EOF"); })]);
  assert.equal(child.exitCode, null);
  child.stdin.end(suffix);
  exact(await done, Buffer.concat([prefix, suffix]));
});

test("strict syntax rejects unknown, duplicate, missing and malformed options", async (t) => {
  const { directory, run } = await sandbox(t);
  const cases = [[], ["unknown"], ["--version", "extra"], ["doctor", "--unknown"], ["filter"],
    ["filter", "--command"], ["filter", "--command", ""], [...complete, "--unknown"], [...complete, "extra"],
    [...complete, "--complete"], [...complete, "--command", "cargo build"], [...complete, "--exit-code", "0"],
    ["filter", "--command", "--complete"], ["raw"], ["raw", "get"], ["raw", "list", "extra"],
    ["raw", "list", "--directory"], ["raw", "purge", "--unknown"], ["raw", "list", "--directory", "raw", "--directory", "raw"]];
  for (const value of ["-1", "1.5", "NaN", "Infinity", "1e2", "9007199254740992"]) cases.push(["filter", "--command", "cargo build", "--exit-code", value]);
  for (const args of cases) {
    const result = await run(args);
    assert.equal(result.code, 1, JSON.stringify(args));
    assert.equal(result.stdout.length, 0);
    assert.ok(result.stderr.length > 0);
  }
  assert.deepEqual(await readdir(directory), [], "option failures must not access raw storage");
});

test("raw list/get/purge recover exact text, empty records, permissions and unavailable status", async (t) => {
  const { directory, run } = await sandbox(t);
  const raw = join(directory, "raw space"), store = new RawStore({ directory: raw });
  const text = "🔥 café\r\n\0last", id = await store.put(text), empty = await store.put("");
  const list = await run(["raw", "list", "--directory", raw]);
  assert.equal(list.code, 0, list.stderr);
  assert.equal(list.stderr, "");
  const entries = JSON.parse(list.stdout.toString()) as { id: string; bytes: number; createdAt: number }[];
  assert.deepEqual(entries.map((entry) => entry.id).sort(), [id, empty].sort());
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry).sort(), ["bytes", "createdAt", "id"]);
    assert.ok(Number.isSafeInteger(entry.createdAt));
    const stat = await lstat(join(raw, `${entry.id}.json`));
    assert.equal(entry.bytes, stat.size);
    if (process.platform !== "win32") assert.equal(stat.mode & 0o777, 0o600);
  }
  if (process.platform !== "win32") assert.equal((await lstat(raw)).mode & 0o777, 0o700);
  exact(await run(["raw", "get", id, "--directory", raw]), text);
  exact(await run(["raw", "get", empty, "--directory", raw]), "");
  await writeFile(join(raw, "notes.txt"), "keep");
  exact(await run(["raw", "purge", "--directory", raw]), "");
  exact(await run(["raw", "list", "--directory", raw]), "[]\n");
  assert.equal(await readFile(join(raw, "notes.txt"), "utf8"), "keep");
  const missing = await run(["raw", "get", id, "--directory", raw]);
  assert.deepEqual(missing, { code: 2, stdout: Buffer.alloc(0), stderr: "unavailable\n" });
});

test("raw bad identifiers and corrupt record errors preserve files", async (t) => {
  const { directory, run } = await sandbox(t);
  const raw = join(directory, "raw"), id = await new RawStore({ directory: raw }).put("evidence");
  const file = join(raw, `${id}.json`), corrupt = Buffer.from("{broken record\n");
  await writeFile(file, corrupt);
  for (const args of [["get", "../escape"], ["get", "F".repeat(32)], ["get", id], ["list"], ["purge"]]) {
    const result = await run(["raw", ...args, "--directory", raw]);
    assert.equal(result.code, 1);
    assert.equal(result.stdout.length, 0);
    assert.ok(result.stderr.length > 0);
    assert.deepEqual(await readFile(file), corrupt);
  }
});

test("raw unsafe POSIX permissions fail loudly without modifying records", { skip: process.platform === "win32" ? "POSIX mode checks do not establish Windows ACL isolation" : false }, async (t) => {
  const { directory, run } = await sandbox(t);
  const raw = join(directory, "raw"), id = await new RawStore({ directory: raw }).put("evidence");
  const file = join(raw, `${id}.json`), before = await readFile(file);
  for (const [path, mode, message] of [[file, 0o644, /0600/], [raw, 0o755, /0700/]] as const) {
    await chmod(path, mode);
    const result = await run(["raw", "get", id, "--directory", raw]);
    assert.equal(result.code, 1);
    assert.equal(result.stdout.length, 0);
    assert.match(result.stderr, message);
    assert.deepEqual(await readFile(file), before);
    await chmod(path, path === file ? 0o600 : 0o700);
  }
});
