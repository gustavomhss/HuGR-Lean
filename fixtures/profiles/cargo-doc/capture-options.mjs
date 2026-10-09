// Generic custom profile / manifest path values with the native host target.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
const here = dirname(fileURLToPath(import.meta.url));
const sha = value => createHash("sha256").update(value).digest("hex");
const root = mkdtempSync(join(tmpdir(), "hugr-c05-options-"));
cpSync(join(here, "project"), root, { recursive: true });
writeFileSync(join(root, "Cargo.toml"), readFileSync(join(root, "Cargo.toml"), "utf8") + '\n[profile.custom-doc]\ninherits = "dev"\n');
const argv = ["cargo", "doc", "--offline", "--manifest-path", "Cargo.toml", "--profile", "custom-doc", "--target", "x86_64-apple-darwin", "--no-deps", "-p", "doc-alpha", "--features", "doc-warning"];
const environment = { CARGO_TERM_COLOR: "never", CARGO_NET_OFFLINE: "true", CARGO_TARGET_DIR: join(root, "target"),
  RUSTFLAGS: "", RUSTDOCFLAGS: "", LC_ALL: "C" };
try {
  const started = new Date().toISOString(), start = process.hrtime.bigint();
  const result = spawnSync("/bin/sh", ["-c", 'exec "$@" 2>&1', "capture", ...argv], {
    cwd: root, env: { ...process.env, ...environment }, encoding: "utf8", maxBuffer: 1048576, timeout: 60000,
  });
  if (result.error || result.signal || result.status === null) throw result.error ?? new Error("capture incomplete");
  console.log(JSON.stringify({ id: "profile-path", argv, command: argv.join(" "), cwd: root, started,
    elapsedMs: Number(process.hrtime.bigint() - start) / 1e6, environment, source: "shell",
    termination: { kind: "exited", code: result.status }, completeness: "complete", presentation: "unknown",
    boundary: "native stdout/stderr merged into one pipe before capture", output: result.stdout,
    inputBytes: Buffer.byteLength(result.stdout), rawSHA256: sha(result.stdout),
    artifact: { file: "target/x86_64-apple-darwin/doc/doc_alpha/index.html", sha256: sha(readFileSync(join(root, "target/x86_64-apple-darwin/doc/doc_alpha/index.html"))) },
    manifestSHA256: sha(readFileSync(join(root, "Cargo.toml"))), recipeSHA256: sha(readFileSync(fileURLToPath(import.meta.url))) }, null, 2));
} finally { rmSync(root, { recursive: true, force: true }); }
