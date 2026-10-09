// Supplement with a distinct binary name; original project remains unchanged.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
const here = dirname(fileURLToPath(import.meta.url));
const sha = value => createHash("sha256").update(value).digest("hex");
const root = mkdtempSync(join(tmpdir(), "hugr-c05-checking-"));
cpSync(join(here, "project"), root, { recursive: true });
const manifest = join(root, "alpha/Cargo.toml");
writeFileSync(manifest, readFileSync(manifest, "utf8") + '\n[[bin]]\nname = "doc-tool"\npath = "src/main.rs"\n');
const argv = ["cargo", "doc", "--offline", "--bins", "--no-deps"];
const environment = { CARGO_TERM_COLOR: "never", CARGO_NET_OFFLINE: "true", CARGO_TARGET_DIR: join(root, "target"),
  RUSTFLAGS: "", RUSTDOCFLAGS: "", LC_ALL: "C" };
try {
  const started = new Date().toISOString(), start = process.hrtime.bigint();
  const result = spawnSync("/bin/sh", ["-c", 'exec "$@" 2>&1', "capture", ...argv], {
    cwd: root, env: { ...process.env, ...environment }, encoding: "utf8", maxBuffer: 1048576, timeout: 60000,
  });
  if (result.error || result.signal || result.status === null) throw result.error ?? new Error("capture incomplete");
  console.log(JSON.stringify({ id: "checking-warning", argv, command: argv.join(" "), cwd: root, started,
    elapsedMs: Number(process.hrtime.bigint() - start) / 1e6, environment, source: "shell",
    termination: { kind: "exited", code: result.status }, completeness: "complete", presentation: "unknown",
    boundary: "native stdout/stderr merged into one pipe before capture", output: result.stdout,
    inputBytes: Buffer.byteLength(result.stdout), rawSHA256: sha(result.stdout),
    artifact: { file: "target/doc/doc_tool/index.html", sha256: sha(readFileSync(join(root, "target/doc/doc_tool/index.html"))) },
    manifestSHA256: sha(readFileSync(manifest)), recipeSHA256: sha(readFileSync(fileURLToPath(import.meta.url))) }, null, 2));
} finally { rmSync(root, { recursive: true, force: true }); }
