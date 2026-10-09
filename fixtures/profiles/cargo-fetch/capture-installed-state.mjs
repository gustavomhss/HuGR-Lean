// Supplemental native listing; do not rerun or rewrite earlier capture inputs.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const directory = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(directory, "cases.json"), "utf8"));
const prior = manifest.cases.find(entry => entry.id === "install-collision-verbose");
const environment = prior.environment;
const args = ["install", "--list", "--root", prior.installRoot];
const id = "install-list-already-installed";
await mkdir(path.join(directory, id), { recursive: true });
const fd = openSync(path.join(directory, id, "native.txt"), "w");
const started = new Date().toISOString();
const before = performance.now();
let result;
try {
  result = spawnSync("cargo", args, { cwd: prior.cwd, env: { ...process.env, ...environment }, stdio: ["ignore", fd, fd] });
} finally { closeSync(fd); }
if (result.error || result.signal || result.status === null) throw new Error("Native listing incomplete; raw retained");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const raw = await readFile(path.join(directory, id, "native.txt"));
manifest.cases.push({
  id, name: `cargo-fetch-${id}`, family: "cargo-fetch", version: manifest.versions.cargo,
  platform: manifest.platform, argv: ["cargo", ...args], command: ["cargo", ...args].join(" "),
  cwd: prior.cwd, environment, started, elapsedMs: performance.now() - before,
  source: "shell", termination: { kind: "exited", code: result.status }, completeness: "complete", presentation: "unknown",
  file: `${id}/native.txt`, status: "passthrough", removableBytes: 0, inputBytes: raw.length,
  eof: raw.at(-1) === 10 ? "LF" : "no-LF", cacheFrom: prior.id, installRoot: prior.installRoot,
  provenance: { sha256: hash(raw), record: "SOURCES.md", recipe: "capture-installed-state.mjs",
    recipeSHA256: hash(await readFile(fileURLToPath(import.meta.url))), completedStream: true,
    boundary: "shared file descriptor stdout=stderr; waited for process exit; no normalization" },
});
await mkdir(path.join(directory, "installed-state"), { recursive: true });
for (const name of [".crates.toml", ".crates2.json"]) {
  await cp(path.join(prior.installRoot, name), path.join(directory, "installed-state", name));
}
const registry = path.join(manifest.root, "cargo-home/registry");
const index = "index.crates.io-1949cf8c6b5b557f";
const crate = path.join(registry, "cache", index, "itoa-1.0.15.crate");
manifest.download = {
  package: "itoa", version: "1.0.15", sha256: hash(await readFile(crate)),
  vcsCommit: "e2766b868e4ac1ae2bf5bea1ac43d4c0da23b899", license: "MIT OR Apache-2.0",
  repository: "https://github.com/dtolnay/itoa", modification: "none; fetched by Cargo, not vendored",
};
await writeFile(path.join(directory, "cases.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`${id}: exit=${result.status}, bytes=${raw.length}`);
