// Capture only: prints completed native streams and receipts; never invokes HuGR.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const sha = value => createHash("sha256").update(value).digest("hex");
const version = tool => {
  const result = spawnSync(tool, ["--version"], { encoding: "utf8" });
  if (result.status !== 0 || result.error) throw result.error ?? new Error(result.stderr);
  return result.stdout.trimEnd();
};
const versions = Object.fromEntries(["cargo", "rustdoc", "rustc"].map(tool => [tool, version(tool)]));
const root = mkdtempSync(join(tmpdir(), "hugr-c05-doc-"));
cpSync(join(here, "project"), root, { recursive: true });
const env = { ...process.env, CARGO_TERM_COLOR: "never", CARGO_NET_OFFLINE: "true",
  RUSTFLAGS: "", RUSTDOCFLAGS: "", LC_ALL: "C" };
const specs = [
  ["default", []],
  ["cached", [], "default"],
  ["no-deps", ["--no-deps"]],
  ["workspace", ["--workspace", "--no-deps"]],
  ["package", ["-p", "doc-beta"]],
  ["features", ["--features", "doc-warning", "--no-deps"]],
  ["explicit-target", ["--target", "x86_64-apple-darwin", "--no-deps"]],
  ["private-items", ["--document-private-items", "--no-deps"]],
  ["workspace-warning", ["--workspace", "--features", "doc-alpha/doc-warning", "--document-private-items"]],
  ["opaque-log", ["--features", "opaque-log", "--workspace"]],
  ["syntax-fail", ["--features", "syntax-fail", "--no-deps"]],
];
const inventory = (directory, accept = () => true) => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? inventory(path, accept) : accept(path)
    ? [{ file: relative(root, path), sha256: sha(readFileSync(path)) }] : [];
});
try {
  const cases = specs.map(([id, flags, cache]) => {
    console.error(`Capturing ${id}`);
    const argv = ["cargo", "doc", "--offline", ...flags];
    const target = join(root, "targets", cache ?? id);
    const started = new Date().toISOString();
    const start = process.hrtime.bigint();
    // Both child descriptors share one pipe: native write order, no stdout/stderr concatenation.
    const result = spawnSync("/bin/sh", ["-c", 'exec "$@" 2>&1', "capture", ...argv], {
      cwd: root, env: { ...env, CARGO_TARGET_DIR: target }, encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 60000,
    });
    if (result.error || result.signal || result.status === null) throw result.error ?? new Error("capture incomplete");
    return { id, argv, command: argv.join(" "), cwd: root,
      source: "shell", termination: { kind: "exited", code: result.status }, completeness: "complete",
      presentation: "unknown", boundary: "native stdout/stderr merged into one pipe before capture",
      started, elapsedMs: Number(process.hrtime.bigint() - start) / 1e6,
      environment: { CARGO_TERM_COLOR: "never", CARGO_NET_OFFLINE: "true", CARGO_TARGET_DIR: target,
        RUSTFLAGS: "", RUSTDOCFLAGS: "", LC_ALL: "C" },
      cacheFrom: cache ?? null, output: result.stdout, rawSHA256: sha(result.stdout),
      inputBytes: Buffer.byteLength(result.stdout),
      artifacts: inventory(target, path => /\/doc\/doc_(alpha|beta)\/index\.html$/.test(path)),
    };
  });
  console.log(JSON.stringify({ schema: "hugr-lean/native-cases/1", family: "cargo-doc",
    baseline: "07ffe15", platform: `${process.platform}/${process.arch}`, versions,
    provenance: { record: "SOURCES.md", recipe: "capture.mjs", recipeSHA256: sha(readFileSync(fileURLToPath(import.meta.url))),
      sourceFiles: inventory(join(root, "alpha")).concat(inventory(join(root, "beta")),
        [{ file: "Cargo.toml", sha256: sha(readFileSync(join(root, "Cargo.toml"))) }]),
      completedStream: true }, cases }, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true });
}
