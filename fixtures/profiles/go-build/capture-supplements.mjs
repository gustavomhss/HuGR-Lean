// Original MIT capture recipe. Run once; verification never reruns native commands.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const go = dirname(fileURLToPath(import.meta.url));
const fmt = resolve(go, "../cargo-fmt");
const parent = "/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const facts = bytes => ({ bytes: bytes.length, sha256: sha(bytes), readThroughEOF: true,
  finalLF: bytes.at(-1) === 10, lastBytesHex: bytes.subarray(-32).toString("hex") });
async function run(command, cwd, overrides = {}) {
  const start = new Date().toISOString();
  const child = spawn(command[0], command.slice(1), { cwd, env: { ...process.env, ...overrides }, stdio: ["ignore", "pipe", "pipe"] });
  const stdout = [], stderr = [], combined = [];
  let outEOF = false, errEOF = false;
  child.stdout.on("data", b => { stdout.push(b); combined.push(b); });
  child.stderr.on("data", b => { stderr.push(b); combined.push(b); });
  child.stdout.on("end", () => { outEOF = true; });
  child.stderr.on("end", () => { errEOF = true; });
  const [code, signal] = await new Promise((yes, no) => { child.once("error", no); child.once("close", (c, s) => yes([c, s])); });
  assert.equal(signal, null); assert.equal(code, 0); assert.ok(outEOF && errEOF);
  return { command, cwd, start, end: new Date().toISOString(), environmentOverrides: overrides,
    termination: { kind: "exited", code }, completeness: "complete", presentation: "unknown",
    output: Buffer.concat(combined), stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) };
}
async function sources(root, relative = "supplement-project") {
  const rows = [];
  for (const entry of (await readdir(join(root, relative), { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    const file = `${relative}/${entry.name}`;
    if (entry.isDirectory()) rows.push(...await sources(root, file));
    else rows.push({ file, ...facts(await readFile(join(root, file))) });
  }
  return rows;
}
const tools = {};
for (const command of [["go", "version"], ["cargo", "--version"], ["rustfmt", "--version"], ["rustc", "--version"]]) {
  const result = await run(command, parent);
  tools[command[0]] = { command, stdout: result.stdout.toString(), stderr: result.stderr.toString(), termination: result.termination };
}
assert.equal(tools.go.stdout, "go version go1.27.1 darwin/amd64\n");
assert.equal(tools.cargo.stdout, "cargo 1.98.0 (797e8a9bc 2026-08-05)\n");
assert.equal(tools.rustfmt.stdout, "rustfmt 1.9.0-stable (88d9e12ae1 2026-08-18)\n");
assert.equal(tools.rustc.stdout, "rustc 1.98.0 (88d9e12ae 2026-08-18)\n");
for (const [root, family, name] of [[go, "go-build", "G04/cross-linux-amd64-success"], [fmt, "cargo-fmt", "C04/workspace-clean-all"]]) {
  const privateRoot = await mkdtemp(join(parent, `${family}-supplement-`));
  const cwd = join(privateRoot, "supplement-project");
  await cp(join(root, "supplement-project"), cwd, { recursive: true });
  const before = await sources(root);
  const copiedBefore = await sources(privateRoot);
  assert.deepEqual(copiedBefore, before);
  const artifactPath = join(privateRoot, "cross-linux-amd64");
  let command, env;
  if (family === "go-build") {
    for (const dir of ["gocache", "gomodcache", "gotmp"]) await mkdir(join(privateRoot, dir));
    command = ["go", "build", "-o", artifactPath, "./..."];
    env = { GOOS: "linux", GOARCH: "amd64", CGO_ENABLED: "0", GOCACHE: join(privateRoot, "gocache"), GOMODCACHE: join(privateRoot, "gomodcache"), GOTMPDIR: join(privateRoot, "gotmp"), GOTOOLCHAIN: "local", GOPROXY: "off", GOSUMDB: "off", GOENV: "off", GOFLAGS: "" };
  } else {
    command = ["cargo", "fmt", "--all", "--check"];
    env = { CARGO_NET_OFFLINE: "true", CARGO_TERM_COLOR: "never", RUSTUP_TOOLCHAIN: "stable" };
  }
  const native = await run(command, cwd, env);
  assert.equal(native.output.length, 0);
  const after = await sources(privateRoot);
  assert.deepEqual(after, before);
  const id = name.split("/")[1];
  const streams = {};
  for (const stream of ["output", "stdout", "stderr"]) {
    const file = `${family === "go-build" ? "captures" : "output"}/${id}.${stream}`;
    await writeFile(join(root, file), native[stream]);
    streams[stream] = { file, ...facts(native[stream]) };
  }
  let artifact;
  if (family === "go-build") {
    const bytes = await readFile(artifactPath);
    assert.equal(bytes.subarray(0,4).toString("hex"), "7f454c46");
    assert.equal(bytes[4], 2); assert.equal(bytes[5], 1); assert.equal(bytes.readUInt16LE(18), 62);
    artifact = { path: artifactPath, bytes: bytes.length, sha256: sha(bytes), headerHex: bytes.subarray(0,64).toString("hex"), magic: "7f454c46", elfClass: 2, endianness: 1, machine: 62, target: "linux/amd64", executed: false,
      scope: "Private native artifact inspected at capture; metadata is committed, executable is not." };
  }
  const version = family === "go-build" ? tools.go.stdout.trimEnd() : [tools.cargo, tools.rustfmt, tools.rustc].map(t => t.stdout.trimEnd()).join("; ");
  const { output, stdout, stderr, ...metadata } = native;
  const receipt = { schema: "hugr-lean/native-supplement/1", tools, platform: "darwin/amd64", recipe: { file: "../go-build/capture-supplements.mjs", sha256: sha(await readFile(fileURLToPath(import.meta.url))) },
    sourceBefore: before, sourceAfter: after, cases: [{ name, ...metadata, version, streams, boundary: facts(output),
      method: "Native spawn original argv, separate pipes; combined chunks in Node data callback arrival order, not kernel cross-pipe order. Both end events and normal close observed.", ...(artifact ? { artifact } : {}) }] };
  await writeFile(join(root, "supplement-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  const originalManifest = await readFile(join(root, "cases.json"), "utf8");
  const manifest = JSON.parse(originalManifest);
  assert.ok(!manifest.cases.some(c => c.name === name), "Capture is one-shot; do not overwrite evidence");
  manifest.archives = [...new Set([...(manifest.archives ?? []), "supplement-receipt.json"])];
  manifest.cases.push({ name, family, command, file: streams.output.file, expected: "", status: "passthrough", termination: native.termination, completeness: "complete", presentation: "unknown", version, platform: "darwin/amd64",
    provenance: { kind: "original", license: "MIT", record: "SOURCES.md", receipt: "supplement-receipt.json", case: name, sha256: streams.output.sha256 } });
  const appended = originalManifest.replace(/\n  \]\n}\n$/, `,\n    ${JSON.stringify(manifest.cases.at(-1))}\n  ]\n}\n`);
  assert.notEqual(appended, originalManifest);
  const declared = originalManifest.includes('"archives"')
    ? appended.replace(/"archives": \[[^\]]*\]/, `"archives": ${JSON.stringify(manifest.archives)}`)
    : appended.replace('"schema": "hugr-lean/native-cases/1",', `"schema": "hugr-lean/native-cases/1",\n  "archives": ${JSON.stringify(manifest.archives)},`);
  await writeFile(join(root, "cases.json"), declared);
  if (family === "cargo-fmt") {
    const ledger = await readFile(join(root, "sha256.txt"), "utf8");
    await writeFile(join(root, "sha256.txt"), ledger.replace(/^[a-f0-9]{64}  cases\.json$/m, `${sha(await readFile(join(root, "cases.json")))}  cases.json`));
  }
  console.log(JSON.stringify({ name, cwd, boundary: receipt.cases[0].boundary, artifact, sourcesUnchanged: true }));
}
