// Local C04 recipe; no parser, tests, build, network, or shared collector.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const cwd = process.argv[2];
if (!cwd || !existsSync(dirname(cwd)) || existsSync(cwd)) {
  throw new Error("Pass a new disposable project path under an existing parent");
}
const env = { ...process.env, CARGO_NET_OFFLINE: "true", CARGO_TERM_COLOR: "never" };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function version(tool) {
  const result = spawnSync(tool, ["--version"], { env });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`${tool} version failed`);
  return result.stdout.toString().trim();
}
const versions = { cargo: version("cargo"), rustfmt: version("rustfmt"), rustc: version("rustc") };
cpSync(join(root, "project"), cwd, { recursive: true });
mkdirSync(join(root, "output"), { recursive: true });
const definitions = [
  ["default-clean", ["fmt", "--check"], "silent"],
  ["default-diff", ["fmt", "--check"]],
  ["package-clean", ["fmt", "--check", "--package", "c04-clean"]],
  ["package-diff", ["fmt", "--check", "--package", "c04-dirty"]],
  ["packages-diff", ["fmt", "--check", "-p", "c04-clean", "-p", "c04-dirty"]],
  ["workspace-failed", ["fmt", "--check", "--all"]],
  ["verbose-clean", ["fmt", "--check", "--verbose", "-p", "c04-clean"]],
  ["verbose-diff", ["fmt", "--check", "--verbose", "-p", "c04-dirty"]],
  ["syntax-failed", ["fmt", "--check", "--manifest-path", "broken/Cargo.toml"]],
  ["help", ["fmt", "--help"]],
];
const cases = definitions.map(([id, args, subdir]) => {
  // One OS pipe preserves observed stdout/stderr arrival order; no post-hoc concatenation.
  const file = `output/${id}.txt`;
  const script = 'exec "$@" 2>&1';
  const result = spawnSync("/bin/sh", ["-c", script, "c04-capture", "cargo", ...args], {
    cwd: subdir ? join(cwd, subdir) : cwd, env, maxBuffer: 1024 * 1024,
  });
  if (result.error || result.signal || result.status === null) {
    throw result.error ?? new Error(`Incomplete native capture: ${id}`);
  }
  writeFileSync(join(root, file), result.stdout);
  return {
    name: `C04/${id}`, family: "cargo-fmt", command: ["cargo", ...args],
    file, status: "passthrough",
    expectedFile: file,
      termination: { kind: "exited", code: result.status }, completeness: "complete",
      presentation: "unknown", version: versions, platform: `${process.platform}/${process.arch}`,
      provenance: { kind: "original", license: "MIT", record: "SOURCES.md", sha256: hash(result.stdout),
        cwd: subdir ? join(cwd, subdir) : cwd, boundary: "stdout and stderr merged at OS pipe before capture" },
  };
});
writeFileSync(join(root, "cases.json"), `{\n  "schema": "hugr-lean/native-cases/1",\n  "cases": [\n${cases.map((c) => `    ${JSON.stringify(c)}`).join(",\n")}\n  ]\n}\n`);
function inventory(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${prefix}${entry.name}`;
    return entry.isDirectory() ? inventory(join(dir, entry.name), `${path}/`) : [path];
  });
}
const files = ["capture.mjs", "cases.json", ...inventory(join(root, "project"), "project/"), ...cases.map((c) => c.file)];
writeFileSync(join(root, "sha256.txt"), files.map((file) => `${hash(readFileSync(join(root, file)))}  ${file}\n`).join(""));
console.log(JSON.stringify({ versions, cases: cases.map((c) => ({ name: c.name, code: c.termination.code, bytes: readFileSync(join(root, c.file)).length })) }, null, 2));
