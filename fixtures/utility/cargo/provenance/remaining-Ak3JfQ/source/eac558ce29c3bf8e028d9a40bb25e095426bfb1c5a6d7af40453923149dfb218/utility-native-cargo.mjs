#!/usr/bin/env node
// Original MIT fixture producer. Private preparation evidence only; no filtering or final manifest.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureCommand } from "./real-world/capture.mjs";
import { isolatedEnvironment } from "./opencode-boundary.mjs";

const baseline = "882585e5f916821a482d14bc7bfe7d6a102b772a";
const repository = fileURLToPath(new URL("../", import.meta.url));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const license = "// Original HuGR-Lean utility fixture; SPDX-License-Identifier: MIT\n";
const longName = index => `passing_${String(index).padStart(2, "0")}_` +
  "original_dependency_free_native_evidence_keeps_suite_context_and_long_identity_without_external_dependencies";
const unit = index => `    #[test]\n    fn ${longName(index)}() { assert_eq!(super::add(2, 3), 5); }\n`;
const integration = index => `#[test]\nfn ${longName(index)}() { assert_eq!(hugr_utility_cargo::add(2, 3), 5); }\n`;
const sources = {
  "Cargo.toml": '# Original MIT fixture; no external dependencies.\n[package]\nname = "hugr_utility_cargo"\nversion = "0.1.0"\nedition = "2021"\nlicense = "MIT"\nbuild = "build.rs"\n',
  "Cargo.lock": '# Original MIT dependency-free lockfile.\nversion = 4\n\n[[package]]\nname = "hugr_utility_cargo"\nversion = "0.1.0"\n',
  "build.rs": license + 'fn main() {\n    println!("cargo:rerun-if-changed=build.rs");\n    // Explicit preparation delay: once on the cold build, never filter latency.\n    std::thread::sleep(std::time::Duration::from_secs(61));\n}\n',
  "src/lib.rs": license + '/// Original dependency-free addition example.\n///\n/// ```\n/// assert_eq!(hugr_utility_cargo::add(2, 3), 5);\n/// ```\npub fn add(left: u32, right: u32) -> u32 { left + right }\n\n#[cfg(test)]\nmod tests {\n' +
    Array.from({ length: 6 }, (_, index) => unit(index)).join("") +
    '    #[test]\n    fn duplicate_suite_identity() { assert_eq!(super::add(1, 1), 2); }\n' +
    '    #[test]\n    #[ignore = "original ignored reason: café 🦀 — native Unicode"]\n    fn ignored_unicode_reason() { panic!("ignored sentinel must not execute"); }\n}\n',
  "tests/native_integration.rs": license + 'mod tests {\n' + Array.from({ length: 6 }, (_, index) => integration(index + 6)).join("") +
    '#[test]\nfn duplicate_suite_identity() { assert_eq!(hugr_utility_cargo::add(1, 1), 2); }\n}\n',
};

async function absent(file) {
  try { await access(file); return false; }
  catch (error) { if (error.code === "ENOENT") return true; throw error; }
}

async function rejectAncestorConfig(cwd) {
  const checked = [];
  for (let current = cwd;; current = path.dirname(current)) {
    for (const name of ["config", "config.toml"]) {
      const file = path.join(current, ".cargo", name);
      if (!(await absent(file))) throw new Error(`UNTRUSTED_CARGO_CONFIG: ${file}`);
      checked.push(file);
    }
    if (current === path.dirname(current)) break;
  }
  return checked;
}

async function writeProject(root, files) {
  const inventory = [];
  for (const [file, text] of Object.entries(files)) {
    const destination = path.join(root, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, text, { flag: "wx" });
    const bytes = await readFile(destination);
    inventory.push({ file: path.relative(root, destination), sha256: digest(bytes), bytes: bytes.length });
  }
  return inventory;
}

function nativeFacts(capture) {
  const text = capture.output;
  if (typeof text !== "string") return { available: false, encodingError: capture.encodingError };
  const rows = text.split("\n");
  return {
    available: true,
    finishedRows: rows.filter(row => /^\s*Finished /.test(row)),
    executableHeaders: rows.filter(row => /^\s*Running /.test(row)),
    doctestHeaders: rows.filter(row => /^\s*Doc-tests /.test(row)),
    runningRows: rows.filter(row => /^running \d+ tests?$/.test(row)),
    summaries: rows.filter(row => /^test result: /.test(row)),
    ignoredRows: rows.filter(row => /^test .* \.\.\. ignored/.test(row)),
    passingRows: rows.filter(row => /^test .* \.\.\. ok$/.test(row)),
    warningRows: rows.filter(row => /^warning:/.test(row)),
    errorRows: rows.filter(row => /^error/.test(row)),
    opaqueRows: rows.filter(row => row.includes("HUGR_CARGO_OPAQUE_SENTINEL")),
    streamOrdering: "Observed stdout/stderr chunk arrival order only; no cross-stream causal ordering guarantee.",
  };
}

async function main() {
  assert.equal(process.argv.length <= 3, true, "EXPECTED_OPTIONAL_ABSOLUTE_TOOLCHAIN_BIN_ONLY");
  const privateParent = path.join(repository, "private.native-captures");
  await mkdir(privateParent, { recursive: true });
  const root = await mkdtemp(path.join(privateParent, "cargo-"));
  const indexPath = path.join(root, "capture-index.json");
  const index = {
    schema: "hugr-lean/private-native-prep/1", family: "cargo", baseline,
    stage: "native-preparation-only; lead inspection required before grammar/expected/manifest authoring",
    root, createdAt: new Date().toISOString(), producer: {}, tools: [], projects: [], captures: [],
    failures: [],
    delay: { seconds: 61, phase: "cold build.rs build phase", executionsPlanned: 1,
      filteringMeasured: false, representativeBuildPerformance: false },
    environmentPolicy: "isolatedEnvironment; explicit installed-toolchain PATH; private HOME/XDG/CARGO_HOME/target; offline; no inherited Cargo/Rust/Node variables; ancestor Cargo configs rejected",
  };
  const save = () => writeFile(indexPath, json(index));
  await save();
  try {
    const producerBytes = await readFile(fileURLToPath(import.meta.url));
    index.producer = { script: "scripts/utility-native-cargo.mjs", sourceSHA256: digest(producerBytes), bytes: producerBytes.length };
    index.runtime = { node: process.version, executable: process.execPath, platform: process.platform, arch: process.arch };
    index.helpers = [];
    for (const file of ["scripts/real-world/capture.mjs", "scripts/real-world/owned-process.mjs", "scripts/real-world/process-guardian.mjs", "scripts/opencode-boundary.mjs"]) {
      const bytes = await readFile(path.join(repository, file));
      index.helpers.push({ file, sha256: digest(bytes), bytes: bytes.length });
    }
    const requestedBin = process.argv[2] ?? path.join(homedir(), ".rustup/toolchains/stable-x86_64-apple-darwin/bin");
    assert(path.isAbsolute(requestedBin), "TOOLCHAIN_BIN_MUST_BE_ABSOLUTE");
    const toolchainBin = await realpath(requestedBin);
    const executables = {};
    for (const name of ["cargo", "rustc", "rustdoc"]) {
      executables[name] = await realpath(path.join(toolchainBin, name));
      assert.equal(path.dirname(executables[name]), toolchainBin, "TOOLCHAIN_PROXY_OR_EXTERNAL_ALIAS_REJECTED");
    }
    index.discovery = { method: "explicit installed toolchain directory; no rustup proxy invocation or configuration", requestedBin, toolchainBin, executables };
    const env = isolatedEnvironment(root, {
      PATH: `${toolchainBin}:/usr/bin:/bin:/usr/sbin:/sbin`,
      CARGO_HOME: path.join(root, "cargo-home"), CARGO_TARGET_DIR: path.join(root, "target"),
      CARGO_NET_OFFLINE: "true", RUSTC: executables.rustc, RUSTDOC: executables.rustdoc,
    });
    for (const directory of [env.HOME, env.XDG_CONFIG_HOME, env.XDG_DATA_HOME, env.XDG_CACHE_HOME,
      env.XDG_STATE_HOME, env.CARGO_HOME, env.CARGO_TARGET_DIR]) await mkdir(directory, { recursive: true });
    index.environment = env;
    index.checkedAbsentConfigs = await rejectAncestorConfig(root);
    const capture = async (id, command, cwd, expectedExit, extra = {}) => {
      const directory = path.join(root, "captures", id);
      await mkdir(directory, { recursive: true });
      const record = { id, command, cwd, expectedExit, state: "capturing", baseline,
        producer: index.producer, helpers: index.helpers, runtime: index.runtime, tools: [...index.tools],
        environmentPolicy: index.environmentPolicy, environment: env, timeoutMs: 300000, ...extra };
      index.captures.push(record);
      await save();
      let result;
      try { result = await captureCommand({ command, cwd }, env, { timeout: 300000, logDir: directory }); }
      catch (error) {
        record.state = "failed-capture";
        record.captureError = { name: error.name, message: error.message, stack: error.stack };
        // Existing live streams remain intact, even if captureCommand cannot return bytes.
        await writeFile(path.join(directory, "receipt.json"), json(record));
        await save();
        throw error;
      }
      const { raw, stdout, stderr, output, ...receipt } = result;
      record.artifacts = {};
      for (const [name, bytes] of [["original", raw], ["stdout", stdout], ["stderr", stderr]]) {
        const file = path.join(directory, `${name}.log`);
        await writeFile(file, bytes, { flag: "wx" });
        record.artifacts[name] = { file: path.relative(root, file), sha256: digest(bytes), bytes: bytes.length };
      }
      Object.assign(record, receipt, { state: "captured", nativeFacts: nativeFacts(result) });
      await writeFile(path.join(directory, "receipt.json"), json(record));
      await save();
      assert(result.nativeSpawned && result.nativeExitObserved && result.complete && !result.timedOut,
        `NATIVE_CAPTURE_INCOMPLETE: ${id}`);
      assert.equal(result.launchError, undefined, `NATIVE_LAUNCH_ERROR: ${id}`);
      assert.equal(result.encodingError, undefined, `NATIVE_ENCODING_ERROR: ${id}`);
      assert.equal(result.exitCode, expectedExit, `NATIVE_EXIT_MISMATCH: ${id}`);
      return result;
    };
    for (const name of ["cargo", "rustc", "rustdoc"]) {
      const result = await capture(`version-${name}`, `${quote(executables[name])} --version`, root, 0);
      assert(result.output.trim().startsWith(`${name} `), `TOOL_VERSION_UNRECOGNIZED: ${name}`);
      index.tools.push({ name, executable: executables[name], version: result.output.trim() });
      await save();
    }
    const project = path.join(root, "project");
    const fixtureSources = await writeProject(project, sources);
    index.projects.push({ name: "hugr_utility_cargo", directory: project, license: "MIT", original: true, fixtureSources });
    index.checkedAbsentConfigs.push(...await rejectAncestorConfig(project));
    assert(Array.from({ length: 12 }, (_, index) => longName(index)).every(name => name.length >= 100), "LONG_NAMES_TOO_SHORT");
    const full = await capture("full", "cargo test --color never", project, 0, { fixtureSources, deliberateBuildDelaySeconds: 61 });
    assert(nativeFacts(full).finishedRows.some(row => /\bin [1-9]\d*m \d+(?:\.\d+)?s$/.test(row)), "NATIVE_MINUTE_DURATION_MISSING");
    const lib = await capture("lib", "cargo test --lib --color never", project, 0, { fixtureSources, deliberateBuildDelaySeconds: 0 });
    assert.equal(nativeFacts(full).summaries.length, 3, "FULL_SUITE_SUMMARIES_MISSING");
    assert.equal(nativeFacts(lib).summaries.length, 1, "LIB_SUITE_SUMMARY_MISSING");
    for (const kind of ["failure", "warning"]) {
      const directory = path.join(root, kind);
      const controlSources = {
        "Cargo.toml": `# Original MIT fixture.\n[package]\nname = "hugr_utility_cargo_${kind}"\nversion = "0.1.0"\nedition = "2021"\nlicense = "MIT"\n`,
        "Cargo.lock": `# Original MIT lockfile.\nversion = 4\n\n[[package]]\nname = "hugr_utility_cargo_${kind}"\nversion = "0.1.0"\n`,
        "src/lib.rs": license + (kind === "failure"
          ? 'compile_error!("HUGR_CARGO_COMPILE_ERROR_SENTINEL café 🦀");\n'
          : 'fn original_unused_warning_sentinel() {}\n#[cfg(test)]\nmod tests {\n    #[test]\n    fn opaque_warning_control() { println!("HUGR_CARGO_OPAQUE_SENTINEL café 🦀"); assert_eq!(2 + 3, 5); }\n}\n'),
      };
      const controlInventory = await writeProject(directory, controlSources);
      index.projects.push({ name: `hugr_utility_cargo_${kind}`, directory, license: "MIT", original: true, fixtureSources: controlInventory });
      index.checkedAbsentConfigs.push(...await rejectAncestorConfig(directory));
      await capture(kind, kind === "failure" ? "cargo test --color never" : "cargo test --color never -- --nocapture",
        directory, kind === "failure" ? 101 : 0, { fixtureSources: controlInventory, deliberateBuildDelaySeconds: 0 });
    }
    index.state = "prepared-awaiting-lead-inspection";
    index.completedAt = new Date().toISOString();
    await save();
    console.log(json({ indexPath, producer: index.producer, tools: index.tools,
      cases: index.captures.filter(item => !item.id.startsWith("version-")).map(item => ({ id: item.id,
        exitCode: item.exitCode, complete: item.complete, durationMs: item.durationMs,
        artifacts: item.artifacts, nativeFacts: item.nativeFacts })) }));
  } catch (error) {
    index.state = "blocked";
    index.failures.push({ name: error.name, message: error.message, stack: error.stack, at: new Date().toISOString() });
    await save();
    console.error(`NATIVE_PREP_BLOCKED: ${error.message}\nReceipt: ${indexPath}`);
    process.exitCode = 1;
  }
}

await main();
