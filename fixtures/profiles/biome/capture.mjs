// Native capture recipe; no parser, stream normalization, or command substitution.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import os from "node:os";

const [toolRoot, project, destination] = process.argv.slice(2).map((path) => resolve(path));
if (!toolRoot || !project || !destination) throw new Error("toolRoot project destination required");
const env = { ...process.env, PATH: `${join(toolRoot, "node_modules/.bin")}:${process.env.PATH}` };
const version = spawnSync("biome", ["--version"], { env, encoding: "utf8" });
if (version.status !== 0 || version.stdout.trim() !== "Version: 2.2.6") throw new Error("Biome pin mismatch");
mkdirSync(project, { recursive: true });
mkdirSync(destination, { recursive: true });
const config = {
  formatter: { indentStyle: "tab" },
  linter: { rules: { recommended: false, correctness: { noUnusedVariables: "warn" },
    style: { useConst: "info" }, suspicious: { noDebugger: "error" } } },
  assist: { enabled: false },
};
const sources = {
  "clean.js": "export const value = 1;\n",
  "warning.js": "export function sample() {\n\tlet unused = \"café 🪨\";\n\treturn 2;\n}\n",
  "error.js": "export function broken() {\n\tdebugger;\n}\n",
  "parse.js": "export const broken = ;\n",
  "unformatted.js": "export const value={x:1,y:2}\n",
  "fix.js": "export function sample(){let value=1;return value}\n",
};
const definitions = [
  ["check-clean", ["check", "clean.js"], 0],
  ["lint-clean", ["lint", "clean.js"], 0],
  ["format-clean", ["format", "clean.js"], 0],
  ["lint-warning-advice", ["lint", "warning.js"], 0],
  ["check-warning-advice", ["check", "warning.js"], 0],
  ["lint-warning-failure", ["lint", "--error-on-warnings", "warning.js"], 1],
  ["check-multifile-failure", ["check", "warning.js", "error.js", "unformatted.js"], 1],
  ["lint-error", ["lint", "error.js"], 1],
  ["format-diff", ["format", "unformatted.js"], 1],
  ["check-parse-error", ["check", "parse.js"], 1],
  ["check-write", ["check", "--write", "fix.js"], 0],
  ["format-write", ["format", "--write", "unformatted.js"], 0],
  ["lint-json-warning", ["lint", "--reporter=json", "warning.js"], 0],
  ["check-json-multifile", ["check", "--reporter=json", "warning.js", "error.js", "unformatted.js"], 1],
  ["format-json-clean", ["format", "--reporter=json", "clean.js"], 0],
  ["format-json-diff", ["format", "--reporter=json", "unformatted.js"], 1],
  ["lint-write-unsafe", ["lint", "--write", "--unsafe", "warning.js"], 0],
  ["lint-ansi-warning", ["lint", "--colors=force", "warning.js"], 0],
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const cases = [];
for (const [name, argv, expectedStatus] of definitions) {
  const dir = join(destination, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(project, "biome.json"), `${JSON.stringify(config, null, 2)}\n`);
  const inputs = argv.filter((arg) => arg.endsWith(".js"));
  mkdirSync(join(dir, "before"), { recursive: true });
  mkdirSync(join(dir, "after"), { recursive: true });
  copyFileSync(join(project, "biome.json"), join(dir, "biome.json"));
  for (const file of inputs) {
    writeFileSync(join(project, file), sources[file]);
    copyFileSync(join(project, file), join(dir, "before", file));
  }
  // Python launches the original biome argv; both descriptors share one real pipe.
  const result = spawnSync("python3", ["-c",
    'import subprocess,sys; p=subprocess.run(["biome",*sys.argv[1:]],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT); sys.stdout.buffer.write(p.stdout); sys.exit(p.returncode)',
    ...argv], { cwd: project, env, timeout: 30000, maxBuffer: 1024 * 1024 });
  writeFileSync(join(dir, "output.txt"), result.stdout);
  if (result.error || result.signal || result.status !== expectedStatus) {
    throw new Error(`${name}: ${JSON.stringify({ status: result.status, signal: result.signal, error: result.error?.message })}`);
  }
  const hashes = {};
  for (const file of inputs) {
    copyFileSync(join(project, file), join(dir, "after", file));
    for (const phase of ["before", "after"]) hashes[`${phase}/${file}`] = sha256(readFileSync(join(dir, phase, file)));
  }
  const output = readFileSync(join(dir, "output.txt"));
  cases.push({ name: `L02/${name}`, family: "biome", command: `biome ${argv.join(" ")}`, argv: ["biome", ...argv],
    file: `${name}/output.txt`, status: result.status, termination: { kind: "exited", code: result.status },
    completeness: "complete", presentation: "unknown", version: "2.2.6",
    platform: { os: process.platform, arch: process.arch, release: os.release(), node: process.version },
    provenance: { registry: "https://registry.npmjs.org", package: "@biomejs/biome@2.2.6",
      cwd: project, launcher: "direct biome on isolated PATH", boundary: "stdout pipe with stderr=STDOUT in subprocess.run; no rewriting",
      outputBytes: output.length, outputSha256: sha256(output), sourceSha256: hashes,
      configSha256: sha256(readFileSync(join(dir, "biome.json"))) } });
}
writeFileSync(join(destination, "cases.json"), `{"schema":"native-cases1","cases":[\n${cases.map((item) => JSON.stringify(item)).join(",\n")}\n]}\n`);
console.log(JSON.stringify(cases.map(({ name, status, provenance }) => ({ name, status, bytes: provenance.outputBytes }))));
