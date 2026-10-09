// Three dependency-free crates; serial jobs expose progress after a rustdoc diagnostic.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
const here = dirname(fileURLToPath(import.meta.url));
const sha = value => createHash("sha256").update(value).digest("hex");
const root = mkdtempSync(join(tmpdir(), "hugr-c05-three-"));
cpSync(join(here, "project"), root, { recursive: true });
cpSync(join(root, "beta"), join(root, "gamma"), { recursive: true });
writeFileSync(join(root, "gamma/Cargo.toml"), readFileSync(join(root, "beta/Cargo.toml"), "utf8").replace("doc-beta", "doc-gamma"));
writeFileSync(join(root, "Cargo.toml"), readFileSync(join(root, "Cargo.toml"), "utf8").replace('["alpha", "beta"]', '["alpha", "beta", "gamma"]'));
const argv = ["cargo", "doc", "--offline", "--workspace", "--no-deps", "--features", "doc-alpha/doc-warning", "--jobs", "1"];
const environment = { CARGO_TERM_COLOR: "never", CARGO_NET_OFFLINE: "true", CARGO_TARGET_DIR: join(root, "target"),
  RUSTFLAGS: "", RUSTDOCFLAGS: "", LC_ALL: "C" };
try {
  const started = new Date().toISOString(), start = process.hrtime.bigint();
  const result = spawnSync("/bin/sh", ["-c", 'exec "$@" 2>&1', "capture", ...argv], {
    cwd: root, env: { ...process.env, ...environment }, encoding: "utf8", maxBuffer: 1048576, timeout: 60000,
  });
  if (result.error || result.signal || result.status === null) throw result.error ?? new Error("capture incomplete");
  console.log(JSON.stringify({ id: "three-warning", argv, command: argv.join(" "), cwd: root, started,
    elapsedMs: Number(process.hrtime.bigint() - start) / 1e6, environment, source: "shell",
    termination: { kind: "exited", code: result.status }, completeness: "complete", presentation: "unknown",
    boundary: "native stdout/stderr merged into one pipe before capture", output: result.stdout,
    inputBytes: Buffer.byteLength(result.stdout), rawSHA256: sha(result.stdout),
    artifacts: ["alpha", "beta", "gamma"].map(name => ({ file: `target/doc/doc_${name}/index.html`,
      sha256: sha(readFileSync(join(root, `target/doc/doc_${name}/index.html`))) })),
    modifiedSources: ["Cargo.toml", "gamma/Cargo.toml", "gamma/src/lib.rs"].map(file => ({ file, sha256: sha(readFileSync(join(root, file))) })),
    recipeSHA256: sha(readFileSync(fileURLToPath(import.meta.url))) }, null, 2));
} finally { rmSync(root, { recursive: true, force: true }); }
