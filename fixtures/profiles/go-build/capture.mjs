// Original MIT native capture producer. No HuGR filter or command rewriting.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const cwd = await mkdtemp("/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/g04-native-");
await cp(join(root, "project"), cwd, { recursive: true });
const captures = join(root, "captures");
await mkdir(captures, { recursive: true });
async function execute(argv) {
  const chunks = [], out = [], err = [];
  const started = new Date().toISOString();
  const child = spawn(argv[0], argv.slice(1), { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (b) => { out.push(b); chunks.push(b); });
  child.stderr.on("data", (b) => { err.push(b); chunks.push(b); });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => signal ? reject(new Error(signal)) : resolve(code));
  });
  return { output: Buffer.concat(chunks), stdout: Buffer.concat(out), stderr: Buffer.concat(err), code, started };
}
const version = await execute(["go", "version"]);
if (version.code !== 0 || version.stdout.toString().trim() !== "go version go1.27.1 darwin/amd64") throw new Error("unexpected Go pin");
const target = await execute(["go", "env", "GOOS", "GOARCH"]);
if (target.code !== 0 || target.stdout.toString() !== "darwin\namd64\n") throw new Error("unexpected target");
for (const [name, result] of [["go-version", version], ["go-target", target]]) {
  await writeFile(join(captures, `${name}.stdout`), result.stdout);
  await writeFile(join(captures, `${name}.stderr`), result.stderr);
}
const specs = [
  ["build-verbose", ["build", "-v", "./..."], "requested-package-list"],
  ["build-all", ["build", "./..."], "no-noise"],
  ["build-packages", ["build", "./lib", "./cmd/quiet"], "no-noise"],
  ["build-tag-verbose", ["build", "-v", "-tags=capturetag", "./..."], "requested-package-list"],
  ["build-tag", ["build", "-tags=capturetag", "./..."], "no-noise"],
  ["build-target-output", ["build", "-o", "quiet-native", "./cmd/quiet"], "no-noise-artifact"],
  ["vet-all", ["vet", "./..."], "no-noise"],
  ["vet-packages", ["vet", "./lib", "./cmd/quiet"], "no-noise"],
  ["vet-tag", ["vet", "-tags=capturetag", "./..."], "no-noise"],
  ["build-error", ["build", "-tags=buildbad", "./..."], "nonzero-diagnostic"],
  ["vet-error", ["vet", "-tags=vetbad", "./..."], "nonzero-diagnostic"],
  ["explicit-goos-unsupported", ["build", "-GOOS=linux", "./..."], "unsupported-native-flag"],
  ["run-quiet", ["run", "./cmd/quiet"], "no-noise"],
  ["run-arbitrary", ["run", "./cmd/noisy"], "opaque-application-streams"],
  ["run-arbitrary-nonzero", ["run", "./cmd/noisy", "fail"], "nonzero-opaque-application-streams"],
];
const cases = [];
for (const [id, args, disposition] of specs) {
  const argv = ["go", ...args], command = argv.join(" ");
  const result = await execute(argv);
  const files = {};
  for (const stream of ["output", "stdout", "stderr"]) {
    const file = `${id}.${stream}`;
    await writeFile(join(captures, file), result[stream]);
    files[stream] = { file: `captures/${file}`, sha256: sha(result[stream]), bytes: result[stream].length };
  }
  cases.push({ id: `G04-${id}`, command, commandSha256: sha(Buffer.from(command)), argv, ...files,
    source: "shell", termination: { kind: "exited", code: result.code }, completeness: "complete",
    presentation: "unknown", toolVersion: version.stdout.toString().trim(), platform: "darwin/amd64",
    provenance: { cwd, started: result.started, boundary: "native child streams; arrival-order concatenation", environment: "inherited; no per-command assignments", producer: "capture.mjs" },
    expectedDisposition: "exact", exactReason: disposition, removableBytes: 0 });
}
const sources = [];
async function inventory(path, relative = "project") {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const name = `${relative}/${entry.name}`;
    if (entry.isDirectory()) await inventory(join(path, entry.name), name);
    else sources.push({ file: name, sha256: sha(await readFile(join(path, entry.name))) });
  }
}
await inventory(join(root, "project"));
sources.push({ file: "capture.mjs", sha256: sha(await readFile(fileURLToPath(import.meta.url))) });
await writeFile(join(root, "cases.json"), JSON.stringify({ schema: "hugr-lean/native-cases/1", owner: "G04", baseline: "07ffe15e2263c2925778022194c5385807216603", sources, cases }, null, 2) + "\n");
console.log(JSON.stringify({ cwd, cases: cases.map(({ id, termination, output }) => ({ id, code: termination.code, bytes: output.bytes })) }, null, 2));
