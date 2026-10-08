// Capture only: never imports the filter or claims parser support.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const cwd = process.argv[2] ?? "/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/c03-clippy-native-project-v3";
const version = (tool, args) => {
  const result = spawnSync(tool, args, { encoding: "utf8" });
  if (result.status !== 0 || result.error) throw result.error ?? Error(result.stderr);
  return result.stdout.trim();
};
const nativeVersion = {
  cargo: version("cargo", ["--version"]), rustc: version("rustc", ["--version"]),
  clippy: version("cargo", ["clippy", "--version"]),
  components: version("rustup", ["component", "list", "--installed"]),
};
if (nativeVersion.cargo !== "cargo 1.98.0 (797e8a9bc 2026-08-05)" ||
    nativeVersion.rustc !== "rustc 1.98.0 (88d9e12ae 2026-08-18)" ||
    nativeVersion.clippy !== "clippy 0.1.98 (88d9e12ae1 2026-08-18)" ||
    !nativeVersion.components.includes("clippy-x86_64-apple-darwin")) throw Error("Toolchain pin mismatch");
mkdirSync(cwd); // Fresh disposable project required; refuse accidental cache reuse.
cpSync(join(root, "project"), cwd, { recursive: true });
mkdirSync(join(root, "captures"), { recursive: true });
const env = { ...process.env, CARGO_TERM_COLOR: "never", CARGO_BUILD_JOBS: "1" };
for (const key of ["RUSTFLAGS", "CARGO_ENCODED_RUSTFLAGS", "RUSTC_WRAPPER", "RUSTC_WORKSPACE_WRAPPER", "CARGO_TARGET_DIR"]) delete env[key];
const specs = [
  ["workspace", ["--workspace"], 0],
  ["cache", ["--workspace"], 0],
  ["package-features-target", ["-p", "capture_alpha", "--features", "extra", "--target", "x86_64-apple-darwin", "--all-targets"], 0],
  ["checking-target", ["-p", "capture_beta", "--target", "x86_64-apple-darwin", "--lib"], 0],
  ["workspace-features-target-cache", ["--workspace", "--features", "capture_alpha/extra", "--target", "x86_64-apple-darwin"], 0],
  ["two-packages", ["-p", "capture_alpha", "-p", "capture_beta", "--lib"], 0],
  ["deny-warnings", ["--workspace", "--", "-D", "warnings"], 101],
  ["collision", ["-p", "capture_alpha", "--features", "collision"], 0],
];
const cases = [];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const [id, flags, exitCode] of specs) {
  const argv = ["clippy", "--offline", ...flags];
  const result = spawnSync("cargo", argv, { cwd, env, encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 60000 });
  if (result.error || result.signal || result.status !== exitCode) throw result.error ?? Error(`${id}: ${result.status} ${result.stderr}`);
  if (result.stdout !== "" || !result.stderr.includes("clippy::")) throw Error(`${id}: unexpected boundary or absent lint`);
  const output = result.stderr;
  const file = `captures/${id}.txt`;
  writeFileSync(join(root, file), output);
  // Independent suffix policy: only leading native progress, never later progress.
  const prefix = /^(?:(?:   Compiling|    Checking) [^\n]+\n)+/.exec(output)?.[0] ?? "";
  const reducible = exitCode === 0 && id !== "collision" && prefix.length > 0;
  const expectedFile = reducible ? `captures/${id}.expected.txt` : undefined;
  if (expectedFile) writeFileSync(join(root, expectedFile), output.slice(prefix.length));
  cases.push({ id: `C03-${id}`, command: `cargo ${argv.join(" ")}`, file,
    status: reducible ? "reduced" : "passthrough", ...(expectedFile ? { expectedFile } : {}),
    termination: { kind: "exited", code: result.status }, completeness: "complete",
    presentation: "terminal-rendered", boundary: "stdout empty; original stderr bytes; color disabled; no rewriting or merge ordering",
    provenance: { sha256: hash(output) },
    removableBytes: reducible ? Buffer.byteLength(prefix) : 0,
    policy: reducible ? "PROPOSED_REDUCTION" : exitCode ? "FAILED_EXACT" : id === "collision" ? "AMBIGUOUS_EXACT" : "NO_REMOVABLE_MATERIAL",
  });
}
const base = cases[0];
const original = readFileSync(join(root, base.file), "utf8");
for (const [id, output, completeness, termination] of [
  ["unknown-line", `${original}opaque producer sentinel\n`, "complete", base.termination],
  ["new-format", original.replace("warning:", "warning[future-format]:"), "complete", base.termination],
  ["incomplete", original.slice(0, original.lastIndexOf("    Finished")), "truncated", base.termination],
  ["unknown-boundary", original, "unknown", { kind: "unknown" }],
]) {
  const file = `captures/${id}.txt`;
  writeFileSync(join(root, file), output);
  cases.push({ ...base, id: `C03-${id}`, file, expectedFile: undefined, status: "passthrough",
    completeness, termination, removableBytes: 0, policy: "DERIVED_EXACT",
    boundary: "derived negative witness; source native stderr boundary recorded on C03-workspace",
    provenance: { derivedFrom: base.file, modification: id, sha256: hash(output) } });
}
const regressionFile = "../../utility/cargo/warning/original.log";
cases.push({ id: "C03-existing-warning-regression", command: "cargo test --color never", file: regressionFile,
  status: "passthrough", termination: { kind: "exited", code: 0 }, completeness: "complete",
  presentation: "terminal-rendered", policy: "BASELINE_PRESERVED_REGRESSION_ONLY",
  provenance: { commit: "07ffe15e2263c2925778022194c5385807216603", receipt: "../../utility/cargo/warning/receipt.json",
    sha256: hash(readFileSync(join(root, regressionFile))) } });
writeFileSync(join(root, "cases.json"), JSON.stringify({ schema: "native-cases-1", stage: "CAPTURED",
  expectationScope: "proposed policy, not executed filter results", nativeVersion,
  provenance: { cwd, capturedAt: new Date().toISOString(), platform: `${process.platform}/${process.arch}`,
    recipe: "capture.mjs", environment: { CARGO_TERM_COLOR: "never", CARGO_BUILD_JOBS: "1" },
    clearedEnvironment: ["RUSTFLAGS", "CARGO_ENCODED_RUSTFLAGS", "RUSTC_WRAPPER", "RUSTC_WORKSPACE_WRAPPER", "CARGO_TARGET_DIR"],
    license: "MIT", baseline: "07ffe15e2263c2925778022194c5385807216603" }, cases }, null, 2) + "\n");
cpSync(join(cwd, "Cargo.lock"), join(root, "project/Cargo.lock"));
const sources = [];
function inventory(dir, relative = "") {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name), name = join(relative, entry.name);
    if (entry.isDirectory()) inventory(path, name);
    else sources.push(`${hash(readFileSync(path))}  ${name}`);
  }
}
inventory(join(root, "project"), "project");
sources.push(`${hash(readFileSync(fileURLToPath(import.meta.url)))}  capture.mjs`);
writeFileSync(join(root, "source-hashes.txt"), sources.join("\n") + "\n");
console.log(JSON.stringify(cases.map(({ id, termination, removableBytes }) => ({ id, termination, removableBytes })), null, 2));
