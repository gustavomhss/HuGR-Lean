#!/usr/bin/env node
// Original MIT continuation. Capture/fact helpers adapted from utility-native-cargo.mjs
// at 582784f752f1d827a460dbab063c0423628d7c09; adds immutable links and before/after sources.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureCommand } from "./real-world/capture.mjs";
import { isolatedEnvironment } from "./opencode-boundary.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));
const priorRoot = path.join(repository, "private.native-captures/cargo-AAzRUV");
const priorIndexSHA256 = "9f16140d5d3aa8f9f5169e1c3322d3ac236232554424caf5318aaeb46c5b378c";
const priorCommit = "582784f752f1d827a460dbab063c0423628d7c09";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const sourceHash = async file => {
  const bytes = await readFile(file);
  return { sha256: hash(bytes), bytes: bytes.length };
};

async function inventory(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `PRIVATE_ALIAS_REJECTED: ${file}`);
    if (entry.isDirectory()) {
      for (const item of await inventory(file)) result.push({ ...item, file: path.join(entry.name, item.file) });
    } else {
      assert(entry.isFile(), `PRIVATE_NONFILE_REJECTED: ${file}`);
      result.push({ file: entry.name, ...await sourceHash(file) });
    }
  }
  return result.sort((left, right) => left.file.localeCompare(right.file));
}

async function noCargoConfig(cwd, env) {
  const checked = [];
  for (let directory = cwd;; directory = path.dirname(directory)) {
    checked.push(path.join(directory, ".cargo/config"), path.join(directory, ".cargo/config.toml"));
    if (directory === path.dirname(directory)) break;
  }
  checked.push(path.join(env.CARGO_HOME, "config"), path.join(env.CARGO_HOME, "config.toml"));
  for (const file of checked) {
    let exists = true;
    try { await access(file); }
    catch (error) { if (error.code !== "ENOENT") throw error; exists = false; }
    assert(!exists, `UNTRUSTED_CARGO_CONFIG: ${file}`);
  }
  return checked;
}

function facts(output) {
  if (typeof output !== "string") return { available: false };
  const rows = output.split("\n");
  return {
    available: true, finished: rows.filter(row => /^\s*Finished /.test(row)),
    headers: rows.filter(row => /^\s*(?:Running |Doc-tests )/.test(row)),
    running: rows.filter(row => /^running \d+ tests?$/.test(row)),
    summaries: rows.filter(row => /^test result: /.test(row)),
    ignored: rows.filter(row => /^test .* \.\.\. ignored/.test(row)),
    warnings: rows.filter(row => /^warning:/.test(row)), errors: rows.filter(row => /^error/.test(row)),
    streamOrdering: "stdout/stderr chunk arrival order; no rewriting or cross-stream causal guarantee",
  };
}

async function main() {
  const root = await mkdtemp(path.join(priorRoot, "remaining-"));
  const indexPath = path.join(root, "completion-index.json");
  const index = { schema: "hugr-lean/private-native-continuation/1", family: "cargo", root,
    state: "preparing", createdAt: new Date().toISOString(), captures: [], failures: [],
    prior: { file: "../capture-index.json", sha256: priorIndexSHA256, producerCommit: priorCommit },
    leadDecision: "Native 2m 01s is valid minute evidence; original collector assertion was a bug.",
    delay: { additionalSleepSeconds: 0, coldFullRecaptured: false, filterLatencyMeasured: false } };
  const save = () => writeFile(indexPath, json(index));
  await save();
  try {
    assert.equal(hash(Buffer.alloc(0)), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "HASH_CONTROL_FAILED");
    const priorBytes = await readFile(path.join(priorRoot, "capture-index.json"));
    assert.equal(hash(priorBytes), priorIndexSHA256, "PRIOR_INDEX_CHANGED");
    const prior = JSON.parse(priorBytes);
    assert.equal(prior.root, priorRoot, "PRIOR_ROOT_MISMATCH");
    const full = prior.captures.find(item => item.id === "full");
    assert(full?.complete && full.nativeSpawned && full.nativeExitObserved && full.exitCode === 0, "PRIOR_FULL_INVALID");
    assert.deepEqual(JSON.parse(await readFile(path.join(priorRoot, "captures/full/receipt.json"), "utf8")), full,
      "PRIOR_FULL_RECEIPT_MISMATCH");
    const inspectionBytes = await readFile(path.join(priorRoot, "inspection-receipt.json"));
    assert.equal(hash(inspectionBytes), "d78e73af9f45ad6baab3d4923498d6ac35eee3f4dfc0d49be9b09cd991eee95b", "PRIOR_INSPECTION_CHANGED");
    const inspection = JSON.parse(inspectionBytes);
    for (const item of full.fixtureSources) {
      const actual = await sourceHash(path.join(priorRoot, "project", item.file));
      assert.equal(actual.sha256, item.file === "Cargo.lock"
        ? inspection.sourcePostCaptureInspection["Cargo.lock"].afterSHA256 : item.sha256, "PRIOR_SOURCE_CHANGED");
    }
    for (const item of Object.values(full.artifacts)) {
      assert.deepEqual(await sourceHash(path.join(priorRoot, item.file)),
        { sha256: item.sha256, bytes: item.bytes }, "PRIOR_RAW_DIGEST_MISMATCH");
    }
    const fullText = await readFile(path.join(priorRoot, full.artifacts.original.file), "utf8");
    assert(facts(fullText).finished.some(row => /\bin [1-9]\d*m \d+(?:\.\d+)?s$/.test(row)), "PRIOR_MINUTE_ROW_MISSING");
    assert.equal(facts(fullText).summaries.length, 3, "PRIOR_FULL_SUMMARIES_MISSING");
    index.prior.full = { command: full.command, artifacts: full.artifacts, nativeFacts: full.nativeFacts };
    index.baseline = prior.baseline;
    index.tools = prior.tools;
    index.producer = { script: "scripts/utility-native-cargo-remaining.mjs", ...await sourceHash(fileURLToPath(import.meta.url)) };
    index.amendedProducer = { script: "scripts/utility-native-cargo.mjs", ...await sourceHash(path.join(repository, "scripts/utility-native-cargo.mjs")) };
    index.runtime = { executable: process.execPath, node: process.version, platform: process.platform, arch: process.arch };
    index.helpers = prior.helpers;
    for (const item of prior.helpers) assert.deepEqual(await sourceHash(path.join(repository, item.file)),
      { sha256: item.sha256, bytes: item.bytes }, "CAPTURE_HELPER_CHANGED");
    const bin = prior.discovery.toolchainBin;
    for (const [name, executable] of Object.entries(prior.discovery.executables)) {
      assert.equal(await realpath(path.join(bin, name)), executable, "INSTALLED_TOOLCHAIN_PATH_CHANGED");
    }
    const env = isolatedEnvironment(priorRoot, { PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`,
      CARGO_HOME: path.join(priorRoot, "cargo-home"), CARGO_TARGET_DIR: path.join(priorRoot, "target"),
      CARGO_NET_OFFLINE: "true", RUSTC: prior.discovery.executables.rustc, RUSTDOC: prior.discovery.executables.rustdoc });
    assert.deepEqual(env, prior.environment, "WARM_ENVIRONMENT_CHANGED");
    index.environmentPolicy = prior.environmentPolicy;
    index.prior.immutableBefore = [];
    for (const directory of ["captures", "project", "source-snapshots"]) {
      for (const item of await inventory(path.join(priorRoot, directory)))
        index.prior.immutableBefore.push({ ...item, file: path.join(directory, item.file) });
    }
    for (const file of ["capture-index.json", "inspection-receipt.json"])
      index.prior.immutableBefore.push({ file, ...await sourceHash(path.join(priorRoot, file)) });
    index.prior.buildInvocationBefore = [];
    const buildDirectory = path.join(priorRoot, "target/debug/build");
    for (const name of await readdir(buildDirectory)) {
      const file = path.join(buildDirectory, name, "invoked.timestamp");
      try { index.prior.buildInvocationBefore.push({ file, mtimeMs: (await stat(file)).mtimeMs }); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    assert(index.prior.buildInvocationBefore.length > 0, "WARM_BUILD_INVOCATION_MARKER_MISSING");
    const capture = async (id, command, cwd, expectedExit, environment) => {
      const directory = path.join(root, "captures", id);
      await mkdir(directory, { recursive: true });
      const before = await inventory(cwd);
      const record = { id, command, cwd, expectedExit, state: "capturing", timeoutMs: 300000,
        producer: index.producer, amendedProducer: index.amendedProducer, baseline: index.baseline,
        priorIndexSHA256, originalProducerCommit: priorCommit, tools: index.tools, runtime: index.runtime,
        helpers: index.helpers, environmentPolicy: index.environmentPolicy, environment,
        fixtureSourcesBefore: before, checkedAbsentConfigs: await noCargoConfig(cwd, environment) };
      index.captures.push(record);
      for (const item of before) {
        const snapshot = path.join(directory, "sources-before", item.file);
        await mkdir(path.dirname(snapshot), { recursive: true });
        await writeFile(snapshot, await readFile(path.join(cwd, item.file)), { flag: "wx" });
      }
      await save();
      let result;
      try { result = await captureCommand({ command, cwd }, environment, { timeout: 300000, logDir: directory }); }
      catch (error) {
        record.state = "failed-capture";
        record.captureError = { name: error.name, message: error.message, stack: error.stack };
        await writeFile(path.join(directory, "receipt.json"), json(record));
        await save();
        throw error;
      }
      const { raw, stdout, stderr, output, ...receipt } = result;
      Object.assign(record, receipt, { state: "captured", nativeFacts: facts(output), artifacts: {} });
      for (const [name, bytes] of [["original", raw], ["stdout", stdout], ["stderr", stderr]]) {
        const file = path.join(directory, `${name}.log`);
        await writeFile(file, bytes, { flag: "wx" });
        record.artifacts[name] = { file: path.relative(root, file), sha256: hash(bytes), bytes: bytes.length };
      }
      record.fixtureSourcesAfter = await inventory(cwd);
      for (const item of record.fixtureSourcesAfter) {
        const snapshot = path.join(directory, "sources-after", item.file);
        await mkdir(path.dirname(snapshot), { recursive: true });
        await writeFile(snapshot, await readFile(path.join(cwd, item.file)), { flag: "wx" });
      }
      record.sourceChanges = record.fixtureSourcesAfter.filter(item =>
        !before.some(old => old.file === item.file && old.sha256 === item.sha256));
      await writeFile(path.join(directory, "receipt.json"), json(record));
      await save();
      assert(result.nativeSpawned && result.nativeExitObserved && result.complete && !result.timedOut,
        `NATIVE_CAPTURE_INCOMPLETE: ${id}`);
      assert.equal(result.encodingError, undefined, `NATIVE_ENCODING_ERROR: ${id}`);
      assert.equal(result.exitCode, expectedExit, `NATIVE_EXIT_MISMATCH: ${id}`);
      return record;
    };
    const lib = await capture("lib", "cargo test --lib --color never", path.join(priorRoot, "project"), 0, env);
    assert.equal(lib.nativeFacts.summaries.length, 1, "LIB_SUITE_SUMMARY_MISSING");
    for (const item of index.prior.buildInvocationBefore)
      assert.equal((await stat(item.file)).mtimeMs, item.mtimeMs, "COLD_BUILD_SCRIPT_RERAN");
    index.prior.buildInvocationUnchanged = true;
    for (const kind of ["failure", "warning"]) {
      const cwd = path.join(root, "projects", kind);
      const files = {
        "Cargo.toml": `# Original MIT dependency-free fixture.\n[package]\nname = "hugr_utility_cargo_${kind}"\nversion = "0.1.0"\nedition = "2021"\nlicense = "MIT"\n`,
        "Cargo.lock": `# Original MIT lockfile.\nversion = 4\n\n[[package]]\nname = "hugr_utility_cargo_${kind}"\nversion = "0.1.0"\n`,
        "src/lib.rs": '// Original MIT fixture; SPDX-License-Identifier: MIT\n' + (kind === "failure"
          ? 'compile_error!("HUGR_CARGO_COMPILE_ERROR_SENTINEL café 🦀");\n'
          : 'fn original_unused_warning_sentinel() {}\n#[cfg(test)]\nmod tests {\n    #[test]\n    fn compiler_warning_control() { assert_eq!(2 + 3, 5); }\n}\n'),
      };
      for (const [file, text] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
        await writeFile(path.join(cwd, file), text, { flag: "wx" });
      }
      const environment = { ...env, CARGO_TARGET_DIR: path.join(root, "target-controls") };
      await mkdir(environment.CARGO_TARGET_DIR, { recursive: true });
      const result = await capture(kind, "cargo test --color never", cwd, kind === "failure" ? 101 : 0, environment);
      assert(result.nativeFacts[kind === "failure" ? "errors" : "warnings"].length > 0, `NATIVE_${kind.toUpperCase()}_CONTROL_MISSING`);
    }
    for (const item of index.prior.immutableBefore) assert.deepEqual(await sourceHash(path.join(priorRoot, item.file)),
      { sha256: item.sha256, bytes: item.bytes }, `PRIOR_EVIDENCE_CHANGED: ${item.file}`);
    index.prior.immutableAfterVerified = true;
    index.state = "prepared-awaiting-lead-inspection";
    index.completedAt = new Date().toISOString();
    await save();
    console.log(json({ indexPath, indexSHA256: (await sourceHash(indexPath)).sha256,
      cases: index.captures.map(item => ({ id: item.id, exitCode: item.exitCode, complete: item.complete,
        artifacts: item.artifacts, nativeFacts: item.nativeFacts, sourceChanges: item.sourceChanges })) }));
  } catch (error) {
    index.state = "blocked";
    index.failures.push({ name: error.name, message: error.message, stack: error.stack, at: new Date().toISOString() });
    await save();
    console.error(`NATIVE_REMAINING_BLOCKED: ${error.message}\nReceipt: ${indexPath}`);
    process.exitCode = 1;
  }
}

await main();
