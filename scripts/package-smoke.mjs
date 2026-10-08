#!/usr/bin/env node
/** Pack and install the actual tarball, then inspect exports, fixtures, raw recovery, notices and CLI. */
import assert from "node:assert/strict";
import { access, cp, lstat, mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ROOT, readCorpus } from "./benchmark.mjs";
import { isolatedEnvironment, runProcess } from "./opencode-boundary.mjs";

// The inspector executes in the temporary consumer, using package names (and Node's exports resolver).
// Its built-in assertions cannot be replaced by a fixture package's own test script.
const INSPECT = String.raw`
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const evidence = JSON.parse(await readFile(process.argv[1], "utf8"));
const root = await import("hugr-lean");
assert.deepEqual(Object.keys(root), ["default"], "Installed package root must export DEFAULT ONLY");
assert.equal(typeof root.default, "function", "Installed package default must be a function");
const server = await import("hugr-lean/server");
assert.deepEqual(Object.keys(server), ["default"], "Installed /server must export DEFAULT ONLY");
assert.equal(server.default, root.default, "Installed /server resolves a different plugin");
const serverResolved = import.meta.resolve("hugr-lean/server");
const { filter } = await import("hugr-lean/core");
const { RawStore } = await import("hugr-lean/raw");
assert.equal(typeof filter, "function", "Installed /core filter is missing");
assert.equal(typeof RawStore, "function", "Installed /raw RawStore is missing");
const packageRoot = path.resolve("node_modules/hugr-lean");
const { profiles } = await import(pathToFileURL(path.join(packageRoot, "dist/profiles/index.js")).href);
assert.ok(Array.isArray(profiles) && profiles.length, "Installed default profile registry is empty");
const profileIds = profiles.map((item) => item.id);
assert.equal(new Set(profileIds).size, profileIds.length, "Installed profile IDs are duplicated");
assert.equal(profileIds.length, 10, "Installed default registry must ship ten real profiles");
assert.equal(evidence.cases.length, 39, "Installed fixture matrix must include legacy and independent native cases");
assert.deepEqual([...new Set(evidence.cases.map((item) => item.family))].sort(), profileIds.toSorted(), "Installed profile/corpus coverage differs");
function covers(spans, [start, end]) {
  let cursor = start;
  for (const [from, to] of spans) {
    if (to <= cursor) continue;
    if (from > cursor) return false;
    cursor = to;
    if (cursor >= end) return true;
  }
  return false;
}
function requiredEvidence(entry) {
  assert.ok(entry.required.length, entry.name + ": empty independent required evidence");
  const profile = profiles.find((item) => item.id === entry.family);
  assert.ok(profile && typeof profile.match === "function" && typeof profile.reduce === "function", entry.name + ": missing real profile");
  const reduction = profile.reduce(entry.observation.output, entry.observation);
  assert.ok(reduction, entry.name + ": installed native grammar rejected");
  const emitted = [];
  let adjacent = false;
  for (const piece of reduction.pieces) {
    if ("text" in piece) { if (piece.text.length) adjacent = false; continue; }
    const previous = emitted.at(-1);
    if (adjacent && previous?.[1] === piece[0]) emitted[emitted.length - 1] = [previous[0], piece[1]];
    else emitted.push(piece);
    adjacent = true;
  }
  for (const span of [...reduction.required, ...emitted]) {
    assert.ok(Number.isSafeInteger(span[0]) && Number.isSafeInteger(span[1]) && span[0] >= 0 && span[0] < span[1] && span[1] <= entry.observation.output.length,
      entry.name + ": invalid UTF-16 source span");
  }
  for (const anchor of entry.required) {
    assert.equal(entry.observation.output.slice(...anchor.sourceSpan), anchor.text, entry.name + ": independent source anchor differs");
    assert.ok(covers(reduction.required, anchor.sourceSpan), entry.name + ": independent critical anchor missing from required: " + anchor.text);
    assert.ok(emitted.some(([from, to]) => from <= anchor.sourceSpan[0] && to >= anchor.sourceSpan[1]), entry.name + ": independent critical anchor not emitted intact: " + anchor.text);
  }
}
const rows = [];
for (const entry of evidence.cases) {
  const result = filter(entry.observation);
  assert.equal(result.status, entry.status, entry.name + ": installed default filter did not " + entry.status);
  const inputBytes = Buffer.byteLength(entry.observation.output, "utf8");
  assert.equal(result.inputBytes, inputBytes, entry.name + ": wrong input bytes");
  if (entry.status === "reduced") {
    assert.equal(result.profile, entry.family, entry.name + ": wrong default profile");
    assert.equal(typeof result.replacement, "string");
    assert.equal(result.outputBytes, Buffer.byteLength(result.replacement, "utf8"));
    assert.ok(result.outputBytes > 0 && result.outputBytes < inputBytes, entry.name + ": fixture did not reduce");
    assert.equal(result.replacement, entry.expected, entry.name + ": independent golden/evidence differs");
    if (entry.required) requiredEvidence(entry);
  } else {
    assert.equal(Object.hasOwn(result, "replacement"), false, entry.name + ": passthrough supplied replacement");
    assert.equal(result.outputBytes, inputBytes, entry.name + ": passthrough bytes changed");
  }
  rows.push({ name: entry.name, status: result.status, inputBytes, outputBytes: result.outputBytes });
}
const cargo = evidence.cases.find((entry) => entry.family === "cargo-test" && entry.status === "reduced");
assert.ok(cargo, "Installed plugin control has no Cargo fixture");
const hooks = await root.default({}, { raw: false });
assert.deepEqual(Object.keys(hooks), ["tool.execute.after"], "Installed default did not load after-hook");
assert.equal(typeof hooks["tool.execute.after"], "function");
for (const exit of [0, 101]) {
  const input = { tool: "bash", args: { command: cargo.observation.command } };
  const output = { title: "Installed smoke", output: cargo.observation.output, metadata: { exit, truncated: false, output: cargo.observation.output } };
  const before = structuredClone(output);
  await hooks["tool.execute.after"](input, output);
  assert.equal(output.output, exit ? before.output : cargo.expected, "Installed plugin changed failed output or did not filter success");
  assert.deepEqual(output.metadata, before.metadata, "Installed plugin changed metadata");
  assert.equal(output.title, before.title, "Installed plugin changed title");
  assert.equal(input.args.command, cargo.observation.command, "Installed plugin changed command");
}
for (const entry of evidence.cases) {
  const obs = entry.observation;
  const input = { tool: "bash", args: { command: obs.command } }, beforeInput = structuredClone(input);
  const metadata = { exit: obs.termination.kind === "exited" ? obs.termination.code : null,
    truncated: obs.completeness === "complete" ? false : obs.completeness === "truncated" ? true : undefined, output: obs.output };
  const output = { title: "Installed matrix " + entry.name, output: obs.output, metadata }, before = structuredClone(output);
  await hooks["tool.execute.after"](input, output);
  assert.equal(output.output, entry.expected, entry.name + ": installed after-hook differs from independent golden");
  assert.deepEqual(input, beforeInput, entry.name + ": installed after-hook changed native args");
  assert.equal(output.metadata, metadata, entry.name + ": installed after-hook replaced metadata");
  assert.deepEqual(output.metadata, before.metadata, entry.name + ": installed after-hook changed metadata");
  assert.equal(output.title, before.title, entry.name + ": installed after-hook changed title");
}
const rawDirectory = path.resolve("raw");
const raw = new RawStore({ directory: rawDirectory });
const text = "exact café 🔥\r\n\u001b[31mwarning\u001b[0m\r\n\u0000\ud800 end";
const id = await raw.put(text);
assert.equal(await raw.get(id), text, "Installed /raw recovery was not exact");
const files = await readdir(rawDirectory);
assert.ok(files.includes(id + ".json"), "Installed /raw did not create a local tempfile record");
const entries = await raw.list();
assert.equal(entries.length, 1);
assert.equal(entries[0].id, id);
await raw.purge();
assert.equal(await raw.get(id), undefined, "Installed /raw purge failed");
console.log(JSON.stringify({ rootExports: Object.keys(root), serverResolved, profileIds, fixtureCount: rows.length, fixtures: rows,
  plugin: { loaded: true, reduced: true, nonzeroExitExact: true, fixtureCount: evidence.cases.length }, raw: { exact: true, inputBytes: Buffer.byteLength(text, "utf8"), tempfile: true, purged: true } }));
`;

const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};

// Delegate ESM resolution to Node, then reject files outside this consumer. This is not a sandbox.
const CONSUMER_LOADER = String.raw`
import { realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = await realpath(fileURLToPath(new URL(".", import.meta.url)));
export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  const url = new URL(resolved.url);
  if (url.protocol === "node:") return resolved;
  if (url.protocol !== "file:") throw new Error("Consumer module must resolve to a file or builtin: " + specifier);
  const target = await realpath(fileURLToPath(url));
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("Consumer module resolved outside canonical root: " + specifier + " -> " + target);
  }
  return resolved;
}
`;

export async function consumerNodeArgs(consumer) {
  const loader = path.join(consumer, "consumer-loader.mjs"), bootstrap = path.join(consumer, "consumer-import.mjs");
  await writeFile(loader, CONSUMER_LOADER);
  await writeFile(bootstrap, 'import { register } from "node:module"; register("./consumer-loader.mjs", import.meta.url);\n');
  return ["--import", pathToFileURL(bootstrap).href];
}

export async function withIsolation(action, source = ROOT) {
  const temporary = await mkdtemp(path.join(tmpdir(), "hugr-installed-"));
  try {
    const [origin, isolated] = await Promise.all([realpath(source), realpath(temporary)]);
    assert.ok(!inside(origin, isolated) && !inside(isolated, origin), "Consumer isolation must be outside source ancestry");
    return await action(temporary);
  } finally { await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
}

export async function isolatedProcess(binary, args, { cwd, isolation, timeout = 45000, variables = {} }) {
  assert.ok(path.isAbsolute(binary), `Absolute binary required: ${binary}`);
  assert.ok(Number.isSafeInteger(timeout) && timeout > 0, "Process timeout must be a positive finite integer");
  assert.ok(path.isAbsolute(isolation), "Absolute isolation directory required");
  assert.ok(Object.keys(variables).every((key) => ["HUGR_PLUGIN", "OPENCODE_BIN", "HUGR_SMOKE_DEPS"].includes(key)), "Unapproved child environment variable");
  const env = isolatedEnvironment(isolation, variables);
  Object.assign(env, { USERPROFILE: env.HOME, TMP: isolation, TEMP: isolation,
    npm_config_prefix: path.join(isolation, "prefix"), npm_config_update_notifier: "false" });
  await Promise.all([env.HOME, env.XDG_CONFIG_HOME, env.XDG_DATA_HOME, env.XDG_CACHE_HOME, env.XDG_STATE_HOME, env.npm_config_cache]
    .map((directory) => mkdir(directory, { recursive: true })));
  await Promise.all([env.npm_config_userconfig, env.npm_config_globalconfig].map((file) => writeFile(file, "")));
  // Reuse the host's bounded detached-pipe helper; do not inherit NODE_PATH, NODE_OPTIONS or credentials.
  return await runProcess(binary, args, { cwd, env, timeout });
}

async function command(binary, args, options) {
  const result = await isolatedProcess(binary, args, options);
  assert.equal(result.code, 0, `Command failed: ${binary} ${args.join(" ")} (${result.code}, ${result.signal})\n${result.stdout}\n${result.stderr}`);
  return result;
}

export async function npmProcess(args, options) {
  // Resolve npm's JS CLI once per invocation; absolute Node also works with paths containing spaces on Windows.
  const cli = await realpath(process.env.npm_execpath ?? path.join(path.dirname(process.execPath),
    process.platform === "win32" ? "node_modules/npm/bin/npm-cli.js" : "npm"));
  return await command(process.execPath, [cli, ...args], options);
}

async function snapshotArtifact(root, destination) {
  await mkdir(destination);
  // Closed artifact surface. Never copy source .npmrc, source code, caches or node_modules.
  for (const file of ["package.json", "dist", "README.md", "LICENSE", "NOTICE", "licenses"]) {
    try { await cp(path.join(root, file), path.join(destination, file), { recursive: true }); }
    catch (error) { if (error.code !== "ENOENT") throw error; } // assertPack names every required missing artifact.
  }
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  if (manifest.files?.includes("src/**/*.md")) {
    await cp(path.join(root, "docs"), path.join(destination, "docs"), { recursive: true });
    for (const module of await readdir(path.join(root, "src"), { withFileTypes: true })) {
      if (!module.isDirectory()) continue;
      const target = path.join(destination, "src", module.name); await mkdir(target, { recursive: true });
      for (const file of await readdir(path.join(root, "src", module.name))) {
        if (file.endsWith(".md")) await cp(path.join(root, "src", module.name, file), path.join(target, file));
      }
    }
    for (const family of ["runners", "formats"]) {
      const target = path.join(destination, "fixtures", family); await mkdir(target, { recursive: true });
      await cp(path.join(root, "fixtures", family, "SOURCES.md"), path.join(target, "SOURCES.md"));
    }
    const utility = path.join(destination, "fixtures", "utility");
    for (const family of ["cargo", "go", "node", "pytest"]) {
      const target = path.join(utility, family); await mkdir(target, { recursive: true });
      await cp(path.join(root, "fixtures", "utility", family, "SOURCES.md"), path.join(target, "SOURCES.md"));
    }
  }
}

export function assertPack(pack) {
  assert.ok(Array.isArray(pack) && pack.length === 1, "npm pack must report exactly one tarball");
  const [entry] = pack;
  assert.ok(typeof entry.filename === "string" && entry.filename === path.basename(entry.filename) && entry.filename.endsWith(".tgz"), "Invalid npm pack tarball filename");
  assert.ok(Array.isArray(entry.files) && entry.files.length, "npm pack file list is missing or empty");
  const files = entry.files.map((file) => file.path);
  assert.ok(files.every((file) => typeof file === "string"), "Invalid npm pack file entry");
  assert.equal(new Set(files).size, files.length, "Duplicate npm pack file entries");
  for (const file of ["package.json", "dist/index.js", "dist/index.d.ts", "dist/core/index.js", "dist/core/index.d.ts", "dist/raw/index.js", "dist/raw/index.d.ts", "LICENSE", "NOTICE"]) {
    assert.ok(files.includes(file), `Packed artifact missing: ${file}`);
  }
  // Both conventional plain-text filenames are accepted; each must be a real shipped nonempty file.
  const donor = files.filter((file) => file === "licenses/TRS-MIT" || file === "licenses/TRS-MIT.txt");
  assert.equal(donor.length, 1, "Packed artifact missing or duplicate donor license: licenses/TRS-MIT[.txt]");
  return { filename: entry.filename, files, notices: ["LICENSE", "NOTICE", donor[0]] };
}

export function assertPlainFileURL(value) {
  assert.equal(typeof value, "string", "Installed CLI doctor plugin URL is missing");
  const url = new URL(value);
  assert.ok(url.protocol === "file:" && !url.href.includes("?") && !url.href.includes("#"), "Installed CLI doctor plugin URL must name a plain file");
  return url;
}

export async function runPackageSmoke({ root = ROOT, cli = true, opencode = false } = {}) {
  if (opencode) assert.ok(process.env.OPENCODE_BIN, "--opencode requires OPENCODE_BIN; missing host is a failure");
  const cases = await readCorpus(root);
  const source = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(source.name, "hugr-lean", "Smoke requires the actual hugr-lean package");
  return await withIsolation(async (temporary) => {
    const packDirectory = path.join(temporary, "pack"), consumer = path.join(temporary, "consumer"), snapshot = path.join(temporary, "artifact");
    await mkdir(packDirectory);
    await mkdir(consumer);
    await snapshotArtifact(root, snapshot);
    const options = { cwd: consumer, isolation: temporary, timeout: 120000 };
    const packed = await npmProcess(["pack", "--json", "--ignore-scripts", "--pack-destination", packDirectory], { ...options, cwd: snapshot });
    let metadata;
    try { metadata = JSON.parse(packed.stdout); }
    catch (error) { throw new Error(`npm pack did not produce valid JSON\n${packed.stdout}\n${packed.stderr}`, { cause: error }); }
    const artifact = assertPack(metadata);
    const tarball = path.join(packDirectory, artifact.filename);
    await access(tarball);
    await writeFile(path.join(consumer, "package.json"), JSON.stringify({ name: "hugr-installed-proof", private: true, type: "module" }));
    await npmProcess(["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"], options);
    const installed = path.join(consumer, "node_modules", "hugr-lean");
    const notices = [];
    for (const file of artifact.notices) {
      const contents = await readFile(path.join(installed, file), "utf8");
      assert.ok(contents.trim().length, `Installed notice/license is empty: ${file}`);
      assert.equal(contents, await readFile(path.join(root, file), "utf8"), `Installed notice/license differs: ${file}`);
      notices.push({ file, bytes: Buffer.byteLength(contents, "utf8") });
    }
    for (const family of ["runners", "formats", "utility/cargo", "utility/go", "utility/node", "utility/pytest"]) {
      const file = `fixtures/${family}/SOURCES.md`;
      const contents = await readFile(path.join(installed, file), "utf8");
      assert.ok(contents.trim().length, `Installed fixture sources note is empty: ${file}`);
      assert.equal(contents, await readFile(path.join(root, file), "utf8"), `Installed fixture sources note differs: ${file}`);
    }
    const evidence = path.join(consumer, "evidence.json");
    await writeFile(evidence, JSON.stringify({ cases }));
    const nodeArgs = await consumerNodeArgs(consumer);
    const checked = await command(process.execPath, [...nodeArgs, "--input-type=module", "-e", INSPECT, evidence], { ...options, timeout: 45000 });
    const inspection = JSON.parse(checked.stdout);
    const manifest = JSON.parse(await readFile(path.join(installed, "package.json"), "utf8"));
    let cliProof = { status: "not requested (--no-cli)", releaseComplete: false };
    if (cli) {
      assert.ok(manifest.bin && typeof manifest.bin["hugr-lean"] === "string", "Installed CLI manifest missing: bin.hugr-lean (lead must add before release smoke)");
      const executable = path.join(consumer, "node_modules", ".bin", process.platform === "win32" ? "hugr-lean.cmd" : "hugr-lean");
      await access(executable);
      const target = path.resolve(installed, manifest.bin["hugr-lean"]);
      assert.ok(inside(installed, target) && (await lstat(target)).isFile(), "Installed CLI bin mapping must name a shipped file");
      if (process.platform === "win32") {
        const shim = (await readFile(executable, "utf8")).replaceAll("\\", "/");
        assert.ok(shim.includes(`/hugr-lean/${path.relative(installed, target).replaceAll("\\", "/")}`), "Installed Windows CLI shim differs from bin mapping");
      } else {
        assert.equal(await realpath(executable), await realpath(target), "Installed CLI shim differs from bin mapping");
        const shim = await command(executable, ["--version"], { ...options, timeout: 30000 });
        assert.equal(shim.stdout.trim(), manifest.version, "Installed CLI shim version differs");
      }
      const version = await command(process.execPath, [...nodeArgs, target, "--version"], { ...options, timeout: 30000 });
      assert.ok([manifest.version, `${manifest.name} ${manifest.version}`].includes(version.stdout.trim()), "Installed CLI --version differs from package version");
      const doctor = await command(process.execPath, [...nodeArgs, target, "doctor"], { ...options, timeout: 30000 });
      const doctorFacts = JSON.parse(doctor.stdout);
      const pluginURL = assertPlainFileURL(doctorFacts.pluginURL);
      // Node's module URL may retain Windows 8.3 spelling; compare OS-canonical file identity.
      assert.deepEqual({ ...doctorFacts, pluginURL: pathToFileURL(await realpath(fileURLToPath(pluginURL))).href }, { version: manifest.version, node: process.version,
        profiles: inspection.profileIds, defaultRawDirectory: path.join(temporary, "home", ".cache", "hugr-lean", "raw"), pluginURL: pathToFileURL(await realpath(path.join(installed, "dist", "index.js"))).href }, "Installed CLI doctor facts differ");
      cliProof = { status: "proved", shimVerified: true, target, version: version.stdout.trim(), doctor: doctorFacts, releaseComplete: true };
    }
    let host = { status: "not requested", releaseComplete: false };
    if (opencode) {
      const binary = process.env.OPENCODE_BIN;
      const version = await command(binary, ["--version"], { ...options, timeout: 60000 });
      assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+/, "OpenCode version is missing");
      const plugin = path.join(installed, "dist", "index.js");
      const variables = { HUGR_PLUGIN: plugin, OPENCODE_BIN: binary };
      if (process.env.HUGR_SMOKE_DEPS) {
        const deps = await realpath(process.env.HUGR_SMOKE_DEPS);
        assert.ok(inside(await realpath(tmpdir()), deps) && deps.endsWith(path.join("config", "opencode")), "Host dependencies must come from an isolated temporary config/opencode install");
        variables.HUGR_SMOKE_DEPS = deps;
      }
      const proof = await command(process.execPath, [path.join(ROOT, "scripts/opencode-smoke.mjs")], { ...options, timeout: 240000, variables });
      host = { ...JSON.parse(proof.stdout), version: version.stdout.trim(), releaseComplete: true };
    }
    return { schema: "hugr-lean/installed-smoke/1", recordedAt: new Date().toISOString(), status: cli && opencode ? "proved" : "partial proof",
      releaseComplete: cli && opencode, package: { name: manifest.name, version: manifest.version, tarball: artifact.filename },
      pack: "npm pack --ignore-scripts --pack-destination isolated-dir (prebuilt artifact snapshot)",
      install: "npm install tarball --ignore-scripts", notices, ...inspection, cli: cliProof, opencode: host };
  }, root);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const flags = process.argv.slice(2);
    assert.ok(new Set(flags).size === flags.length && flags.every((flag) => ["--no-cli", "--opencode"].includes(flag)),
      "Usage: node scripts/package-smoke.mjs [--no-cli] [--opencode]");
    console.log(JSON.stringify(await runPackageSmoke({ cli: !flags.includes("--no-cli"), opencode: flags.includes("--opencode") }), null, 2));
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
