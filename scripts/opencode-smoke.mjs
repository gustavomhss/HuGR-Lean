#!/usr/bin/env node
/** Package-plugin wiring against a native cargo fixture; real-host controls live in the boundary script. */
import assert from "node:assert/strict";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isolatedEnvironment, runProcess, runScenario } from "./opencode-boundary.mjs";

export const SUMMARY = "test result: ok. 40 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s";
export const CARGO = `    Finished \`test\` profile [unoptimized + debuginfo] target(s) in 0.01s\n     Running unittests src/lib.rs (target/debug/deps/boundary-0000000000000000)\n\nrunning 40 tests\n${Array.from({ length: 40 }, (_, i) => `test case_${i} ... ok\n`).join("")}\n${SUMMARY}\n\n`;
const UNKNOWN = "HUGR_UNKNOWN_OUTPUT café 🔥\r\nnot a Cargo grammar\n";

function cargoFixture(output, exit = 0) {
  return async ({ cwd, env }) => {
    const bin = path.join(cwd, "bin");
    await mkdir(bin);
    const cargo = path.join(bin, "cargo");
    await writeFile(cargo, `#!/bin/sh\nprintf '%s' '${output.replaceAll("'", "'\\''")}'\nexit ${exit}\n`);
    await chmod(cargo, 0o755);
    env.PATH = `${bin}${path.delimiter}${env.PATH}`;
  };
}

export function assertReduction(raw, filtered) {
  assert.equal(raw.modelResult.content, CARGO, "No-plugin native fixture differs from its expected output");
  assert.equal(raw.tool.state.metadata.exit, 0);
  const output = filtered.modelResult.content;
  assert.equal(typeof output, "string", "Model-visible package output is not text");
  assert.equal(output, filtered.tool.state.output, "Model and host completion text differ");
  assert.ok(Buffer.byteLength(output, "utf8") < Buffer.byteLength(CARGO, "utf8"), "Package plugin did not reduce model-visible Cargo output");
  assert.ok(output.includes(SUMMARY), "Package plugin lost the exact Cargo summary");
  assert.deepEqual(filtered.tool.state.metadata, raw.tool.state.metadata, "Package plugin changed native metadata");
  assert.equal(filtered.command, raw.command, "Package plugin changed native command identity");
  assert.equal(filtered.tool.state.title, raw.tool.state.title, "Package plugin changed native title");
}

export function assertPackageTuple(result, enabled) {
  assert.deepEqual(result.pluginEntry, ["hugr-lean", { enabled }], "Host config did not use the literal package-name tuple");
  if (!enabled) assert.equal(result.modelResult.content, CARGO, "Package-name tuple options did not disable filtering");
}

export async function runSmoke({ plugin = process.env.HUGR_PLUGIN, ...options } = {}) {
  assert.ok(plugin, "HUGR_PLUGIN must point to the compiled real package plugin");
  plugin = plugin.startsWith("file:") ? fileURLToPath(plugin) : path.resolve(plugin);
  assert.ok((await stat(plugin)).isFile(), `HUGR_PLUGIN is not a file: ${plugin}`);
  const common = { ...options, command: "cargo test", setup: cargoFixture(CARGO) };
  const raw = await runScenario(common);
  const filtered = await runScenario({ ...common, plugin });
  assertReduction(raw, filtered);
  const preserved = [];
  // A failing executable emits the same reducible grammar: removing a failure guard must not pass by grammar fallback.
  for (const [output, exit] of [[CARGO, 101], [UNKNOWN, 0]]) {
    const result = await runScenario({ ...options, plugin, command: "cargo test", setup: cargoFixture(output, exit) });
    assert.equal(result.modelResult.content, output, "Package plugin changed failed or unknown native output");
    assert.equal(result.tool.state.output, output);
    assert.equal(result.tool.state.metadata.exit, exit, "Package plugin changed native exit status");
    assert.equal(result.tool.state.metadata.truncated, false);
    preserved.push({ exit, outputBytes: Buffer.byteLength(output, "utf8") });
  }
  return { status: "proved", plugin, command: "cargo test", inputBytes: Buffer.byteLength(CARGO, "utf8"), outputBytes: Buffer.byteLength(filtered.modelResult.content, "utf8"), preserved };
}

export async function packLocalPackage(directory = fileURLToPath(new URL("../", import.meta.url))) {
  const root = await mkdtemp(path.join(tmpdir(), "hugr-local-pack-"));
  try {
    const result = await runProcess("npm", ["pack", "--offline", "--ignore-scripts", "--json", "--pack-destination", root], { cwd: directory, env: isolatedEnvironment(root), timeout: 30000 });
    assert.equal(result.code, 0, `Local npm pack failed\n${result.stdout}\n${result.stderr}`);
    const packed = JSON.parse(result.stdout);
    assert.equal(packed.length, 1, "Local npm pack did not produce exactly one package");
    const tarball = path.join(root, packed[0].filename);
    assert.ok((await stat(tarball)).isFile(), "Local package tarball is missing");
    return { root, tarball };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}

export async function preloadPackage({ env }, tarball, withoutServer = false) {
  // Install independently of the SDK tree: its npm metadata may not exist in this isolated cache.
  const cache = path.join(env.XDG_CACHE_HOME, "opencode", "packages", "hugr-lean@latest");
  await mkdir(cache, { recursive: true });
  await writeFile(path.join(cache, "package.json"), JSON.stringify({ private: true, type: "module" }));
  const result = await runProcess("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", tarball], { cwd: cache, env, timeout: 30000 });
  assert.equal(result.code, 0, `Isolated tarball install failed\n${result.stdout}\n${result.stderr}`);
  // Pinned OpenCode 1.18.17 Npm.add("hugr-lean@latest") checks this private cache before registry access.
  const cached = path.join(cache, "node_modules", "hugr-lean");
  const installed = path.join(env.OPENCODE_CONFIG_DIR, "node_modules", "hugr-lean");
  await cp(cached, installed, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(installed, "package.json"), "utf8"));
  assert.equal(manifest.name, "hugr-lean", "Installed tarball is not hugr-lean");
  if (withoutServer) {
    delete manifest.exports["./server"]; // Destructive probe touches only the isolated installed copy.
    await writeFile(path.join(cached, "package.json"), JSON.stringify(manifest));
  }
  return { name: manifest.name, version: manifest.version, server: manifest.exports?.["./server"] ?? null, installed, cached };
}

export async function runPackageSmoke({ tarball = process.env.HUGR_TARBALL, withoutServer = process.env.HUGR_PACKAGE_PROBE_NO_SERVER === "1", keep = process.env.HUGR_KEEP_SMOKE === "1", ...options } = {}) {
  const packed = tarball ? undefined : await packLocalPackage();
  tarball = path.resolve(tarball ?? packed.tarball);
  try {
    assert.ok((await stat(tarball)).isFile(), "Package-name proof requires a local tarball");
    let installation;
    let hostVersion;
    const setup = (output, exit = 0, install = true) => async (context) => {
      if (!hostVersion) {
        const version = await runProcess(options.binary ?? process.env.OPENCODE_BIN ?? "opencode", [...options.binaryArgs ?? [], "--version"], { cwd: context.cwd, env: context.env, timeout: 45000 });
        assert.equal(version.code, 0, version.stderr);
        hostVersion = version.stdout.trim();
        assert.equal(hostVersion, "1.18.17", "Package-name cache oracle is pinned to OpenCode 1.18.17");
      }
      if (install) installation = await preloadPackage(context, tarball, withoutServer);
      await cargoFixture(output, exit)(context);
    };
    const common = { ...options, keep, command: "cargo test" };
    const raw = await runScenario({ ...common, setup: setup(CARGO, 0, false) });
    const enabled = await runScenario({ ...common, pluginSpec: "hugr-lean", pluginOptions: { enabled: true }, setup: setup(CARGO) });
    assertPackageTuple(enabled, true);
    assertReduction(raw, enabled);
    const disabled = await runScenario({ ...common, pluginSpec: "hugr-lean", pluginOptions: { enabled: false }, setup: setup(CARGO) });
    assertPackageTuple(disabled, false);
    assert.deepEqual(disabled.tool.state.metadata, raw.tool.state.metadata);
    for (const [output, exit] of [[CARGO, 101], [UNKNOWN, 0]]) {
      const result = await runScenario({ ...common, pluginSpec: "hugr-lean", pluginOptions: { enabled: true }, setup: setup(output, exit) });
      assert.equal(result.modelResult.content, output, "Package-name plugin changed failed or unknown output");
      assert.equal(result.tool.state.metadata.exit, exit);
    }
    return { status: "proved", route: "host-package-name", hostVersion, specifier: "hugr-lean", tupleOptions: "enabled true/false", installation, tarball, sha256: createHash("sha256").update(await readFile(tarball)).digest("hex"), inputBytes: Buffer.byteLength(CARGO, "utf8"), outputBytes: Buffer.byteLength(enabled.modelResult.content, "utf8"), preservedExits: [101, 0], sdkReuse: options.dependencies ?? process.env.HUGR_SMOKE_DEPS ?? null };
  } finally { if (packed && !keep) await rm(packed.root, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.ok(process.argv.length === 2 || process.argv[2] === "--package", "Usage: opencode-smoke.mjs [--package]");
    console.log(JSON.stringify(process.argv[2] === "--package" ? await runPackageSmoke() : await runSmoke(), null, 2));
  }
  catch (error) { console.error(error.stack); process.exitCode = 1; }
}
