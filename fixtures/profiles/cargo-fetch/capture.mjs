// Original C08 collector. Native subprocess writes one shared stdout/stderr file descriptor.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const tempParent = "/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode";
const root = await mkdtemp(path.join(tempParent, "c08-native-"));
await cp(path.join(directory, "project"), path.join(root, "project"), { recursive: true });
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const quote = word => /^[A-Za-z0-9_./:+,=-]+$/.test(word) ? word : JSON.stringify(word);
const version = tool => {
  const result = spawnSync(tool, ["--version"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${tool} version failed: ${result.stderr}`);
  return result.stdout.trim();
};
const versions = { cargo: version("cargo"), rustc: version("rustc") };
if (!versions.cargo.startsWith("cargo 1.98.0 ")) throw new Error("Requires real Cargo 1.98.0");
const recipeSHA256 = hash(await readFile(fileURLToPath(import.meta.url)));
const cases = [];
const archives = [];
const cargoHome = path.join(root, "cargo-home");
const target = path.join(root, "target");
const installRoot = path.join(root, "install-root");
const tmp = path.join(root, "tmp");
for (const dir of [cargoHome, target, installRoot, tmp]) await mkdir(dir, { recursive: true });
const env = {
  ...process.env, CARGO_HOME: cargoHome, CARGO_TARGET_DIR: target,
  TMPDIR: tmp, CARGO_TERM_COLOR: "never", CARGO_TERM_PROGRESS_WHEN: "never",
  CARGO_NET_RETRY: "0", CARGO_HTTP_TIMEOUT: "30", RUSTUP_TOOLCHAIN: "1.98.0",
};
// Do not let host Rust/Cargo flags or wrappers rewrite this fixture's commands.
for (const key of ["RUSTFLAGS", "CARGO_ENCODED_RUSTFLAGS", "RUSTC_WRAPPER", "RUSTC_WORKSPACE_WRAPPER", "CARGO_BUILD_RUSTFLAGS"]) delete env[key];
async function capture(id, args, cwd, extra = {}) {
  const dest = path.join(directory, id);
  await mkdir(dest, { recursive: true });
  const native = path.join(dest, "native.txt");
  const fd = openSync(native, "w");
  const started = new Date().toISOString();
  const before = performance.now();
  let result;
  try {
    result = spawnSync("cargo", args, {
      cwd, env: { ...env, ...extra.environment }, stdio: ["ignore", fd, fd], timeout: 180000,
    });
  } finally { closeSync(fd); }
  const raw = await readFile(native);
  if (result.error || result.signal || result.status === null) {
    await writeFile(path.join(dest, "interrupted.json"), JSON.stringify({ error: String(result.error), signal: result.signal, started }, null, 2));
    throw new Error(`Incomplete capture ${id}; raw output retained`);
  }
  const entry = {
    id, name: `cargo-fetch-${id}`, family: "cargo-fetch", version: versions.cargo,
    platform: `${process.platform}/${process.arch}`, argv: ["cargo", ...args],
    command: ["cargo", ...args].map(quote).join(" "), cwd, started,
    elapsedMs: performance.now() - before, source: "shell",
    termination: { kind: "exited", code: result.status }, completeness: "complete", presentation: "unknown",
    file: `${id}/native.txt`, status: "passthrough", removableBytes: 0,
    inputBytes: raw.length, eof: raw.length ? (raw.at(-1) === 10 ? "LF" : "no-LF") : "empty",
    environment: { CARGO_HOME: cargoHome, CARGO_TARGET_DIR: target, TMPDIR: tmp,
      CARGO_TERM_COLOR: "never", CARGO_TERM_PROGRESS_WHEN: "never", RUSTUP_TOOLCHAIN: "1.98.0", ...extra.environment },
    cacheFrom: extra.cacheFrom ?? null, installRoot: args[0] === "install" ? installRoot : null,
    provenance: { sha256: hash(raw), record: "SOURCES.md", recipe: "capture.mjs", recipeSHA256,
      completedStream: true, boundary: "shared file descriptor stdout=stderr; waited for process exit; no normalization" },
  };
  if (args[0] === "install" && result.status === 0) {
    const executable = path.join(installRoot, "bin", "c08-local-bin");
    const bytes = await readFile(executable);
    const run = spawnSync(executable, [], { env, cwd, encoding: "utf8" });
    const executionFile = `${id}/executable-output.txt`;
    await writeFile(path.join(directory, executionFile), run.stdout + run.stderr);
    archives.push(executionFile);
    entry.artifacts = [{ path: executable, sha256: hash(bytes), bytes: bytes.length,
      mode: (await stat(executable)).mode, execution: { argv: [executable], exit: run.status,
        file: executionFile, sha256: hash(Buffer.from(run.stdout + run.stderr)) } }];
  }
  cases.push(entry);
  console.log(`${id}: exit=${result.status}, bytes=${raw.length}`);
  return entry;
}
const fetchDir = path.join(root, "project", "fetch");
await capture("fetch-cold", ["fetch"], fetchDir);
await capture("fetch-cache", ["fetch"], fetchDir, { cacheFrom: "fetch-cold" });
await capture("fetch-locked", ["fetch", "--locked"], fetchDir, { cacheFrom: "fetch-cold" });
await capture("fetch-offline-cache", ["fetch", "--offline", "--locked"], fetchDir, { cacheFrom: "fetch-cold" });
const emptyHome = path.join(root, "empty-cargo-home");
await mkdir(emptyHome);
await capture("fetch-offline-cold-failure", ["fetch", "--offline", "--locked"], fetchDir, { environment: { CARGO_HOME: emptyHome } });
const lockedDir = path.join(root, "locked-missing");
await cp(fetchDir, lockedDir, { recursive: true, filter: source => !source.endsWith("Cargo.lock") });
await capture("fetch-locked-missing-failure", ["fetch", "--locked"], lockedDir, { cacheFrom: "fetch-cold" });
const resolutionDir = path.join(root, "resolution-failure");
await cp(fetchDir, resolutionDir, { recursive: true, filter: source => !source.endsWith("Cargo.lock") });
const manifest = await readFile(path.join(resolutionDir, "Cargo.toml"), "utf8");
await writeFile(path.join(resolutionDir, "Cargo.toml"), manifest.replace('=1.0.15', '=999.0.0'));
await capture("fetch-resolution-failure", ["fetch"], resolutionDir, { cacheFrom: "fetch-cold" });
const binDir = path.join(root, "project", "bin");
const install = ["install", "--path", binDir, "--root", installRoot];
await capture("install-cold", install, binDir);
await capture("install-already-installed", install, binDir, { cacheFrom: "install-cold" });
await capture("install-cache-force", [...install, "--force"], binDir, { cacheFrom: "install-cold" });
await capture("install-features", [...install, "--force", "--features", "extra"], binDir, { cacheFrom: "install-cache-force" });
await capture("install-collision", [...install, "--force", "--features", "collision"], binDir);
await capture("install-collision-verbose", [...install, "--force", "--features", "collision", "-vv"], binDir, {
  environment: { CARGO_TARGET_DIR: path.join(root, "collision-target") },
});
// Preserve exact project and lockfiles after native execution; no binaries/cache vendored.
await cp(path.join(root, "project"), path.join(directory, "captured-project"), { recursive: true });
await cp(lockedDir, path.join(directory, "captured-project", "locked-missing"), { recursive: true });
await cp(resolutionDir, path.join(directory, "captured-project", "resolution-failure"), { recursive: true });
const projectHashes = {};
async function inventory(dir, relative = "") {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const name = relative ? `${relative}/${item.name}` : item.name;
    if (item.isDirectory()) await inventory(path.join(dir, item.name), name);
    else projectHashes[name] = hash(await readFile(path.join(dir, item.name)));
  }
}
await inventory(path.join(directory, "captured-project"));
await writeFile(path.join(directory, "cases.json"), JSON.stringify({
  schema: "hugr-lean/native-cases/1", family: "cargo-fetch", state: "CAPTURED", baseline: "71bcaea",
  versions, platform: `${process.platform}/${process.arch}`, root, recipeSHA256, projectHashes, archives, cases,
}, null, 2) + "\n");
console.log(`Native state retained: ${root}`);
