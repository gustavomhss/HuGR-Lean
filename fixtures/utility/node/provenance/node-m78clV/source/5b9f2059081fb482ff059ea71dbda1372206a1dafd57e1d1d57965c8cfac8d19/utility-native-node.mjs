#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Evidence preparation only: no parser, expected output, corpus manifest or historical replay.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isolatedEnvironment } from "./opencode-boundary.mjs";
import { captureCommand, sha256 } from "./real-world/capture.mjs";

const baseline = "882585e5f916821a482d14bc7bfe7d6a102b772a";
const branch = "utility/node-native";
const repository = fileURLToPath(new URL("../", import.meta.url));
const producer = "scripts/utility-native-node.mjs";
const pinnedProject = "/Users/gustavoschneiter/Documents/HuGR/_worktrees/hugr-lean-resume-proof";
const tsxBin = path.join(pinnedProject, "node_modules/.bin");
const git = (...args) => execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
assert.equal(git("branch", "--show-current"), branch, "WRONG_NATIVE_CAPTURE_BRANCH");
execFileSync("git", ["merge-base", "--is-ancestor", baseline, "HEAD"], { cwd: repository });
const sourceHead = git("rev-parse", "HEAD");
const producerBytes = await readFile(path.join(repository, producer));
const parent = path.join(repository, ".native-captures");
await mkdir(parent, { recursive: true });
const root = await mkdtemp(path.join(parent, "node-"));
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const json = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
const digest = (file, bytes) => ({ file, sha256: sha256(bytes), bytes: bytes.length });
const env = isolatedEnvironment(root, {
  PATH: `${path.dirname(process.execPath)}:${tsxBin}:/usr/bin:/bin`,
  npm_config_offline: "true", npm_config_update_notifier: "false",
  npm_config_audit: "false", npm_config_fund: "false",
});
delete env.NODE_OPTIONS;
delete env.NODE_PATH;
const policy = {
  constructor: "isolatedEnvironment(privateRoot)", inherited: [],
  PATH: env.PATH, NODE_OPTIONS: "absent", NODE_PATH: "absent",
  HOME: relative(env.HOME), XDG_CONFIG_HOME: relative(env.XDG_CONFIG_HOME),
  XDG_DATA_HOME: relative(env.XDG_DATA_HOME), XDG_CACHE_HOME: relative(env.XDG_CACHE_HOME),
  XDG_STATE_HOME: relative(env.XDG_STATE_HOME), TMPDIR: ".",
  npmUserConfig: "npmrc (fresh empty private file)",
  npmGlobalConfig: "global-npmrc (fresh empty private file)",
  npmOffline: true, reporterOverride: "none on default cases",
  io: "non-TTY stdout/stderr pipes; stdin ignored; captureCommand arrival order",
};
const index = {
  schema: "hugr-lean/private-native-prep/1", family: "node", stage: "native-evidence-prep-only",
  baselineSourceSHA: baseline, sourceHead, branch, privateRoot: root,
  producer: digest(producer, producerBytes), environmentPolicy: policy,
  tools: [], toolReceipts: [], sourceInventory: [], cases: [], failedCaptures: [],
  limitations: [
    "Private capture index, not final utility-corpus manifest or expected parser output.",
    "Native rows are raw observations; grammar, removable rows and required anchors await lead freeze.",
    "Progress exposure is not predicted filtering savings; no parser/evaluator is invoked.",
    "No dependency install, network, npm execution, CI, build or production test suite.",
    "Each command is captured once; explicit TAP fallback is separately named, never a replacement.",
    "Artifacts and live capture files are retained; no cleanup of fixture roots is attempted.",
  ],
};
const checkpoint = () => json(path.join(root, "capture-index.json"), index);
async function inventory(file, label) {
  const bytes = await readFile(file);
  const record = { ...digest(label, bytes), absolutePath: file };
  index.sourceInventory.push(record);
  return record;
}
async function capture(id, command, cwd, fixtureSources = []) {
  const directory = path.join(root, "captures", id);
  await mkdir(directory, { recursive: true });
  const startedAt = new Date().toISOString();
  let result;
  try { result = await captureCommand({ command, cwd }, env, { timeout: 120000, logDir: directory }); }
  catch (error) {
    const failure = { id, command, cwd, startedAt, error: String(error), retainedLiveDirectory: relative(directory) };
    await json(path.join(directory, "collector-error.json"), failure);
    index.failedCaptures.push(failure);
    await checkpoint();
    return undefined;
  }
  const streams = {};
  for (const [name, bytes] of [["original", result.raw], ["stdout", result.stdout], ["stderr", result.stderr]]) {
    const file = path.join(directory, `${name}.log`);
    await writeFile(file, bytes);
    streams[name] = digest(relative(file), bytes);
  }
  const { raw, stdout, stderr, output, ...facts } = result;
  const receipt = {
    ...facts, launchError: facts.launchError ?? null, encodingError: facts.encodingError ?? null,
    cleanupErrors: facts.killErrors ?? [], baselineSourceSHA: baseline, sourceHead,
    startedAt, recordedAt: new Date().toISOString(), timeoutMs: 120000,
    producer: index.producer, environmentPolicy: policy, tools: index.tools,
    fixtureSources, streams, artifactCleanup: "not attempted; private root retained",
  };
  const receiptFile = path.join(directory, "capture.json");
  await json(receiptFile, receipt);
  const record = { id, command, cwd, capture: digest(relative(receiptFile), await readFile(receiptFile)),
    ...streams, exitCode: result.exitCode, complete: result.complete, signal: result.signal,
    timedOut: result.timedOut, nativeSpawned: result.nativeSpawned, nativeExitObserved: result.nativeExitObserved,
    fixtureSources };
  if (!result.complete || result.encodingError || result.launchError || !result.raw.length) {
    index.failedCaptures.push({ ...record, reason: "INCOMPLETE_EMPTY_OR_UNDECODABLE_CAPTURE" });
  }
  return { record, output, result };
}

const license = `MIT License\n\nCopyright (c) 2026 HuGR-Lean contributors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.\n`;
const header = "// Original local fixture; copyright 2026 HuGR-Lean contributors; SPDX-License-Identifier: MIT\n" +
  "import test from 'node:test';\nimport assert from 'node:assert/strict';\n";
const names = Array.from({ length: 12 }, (_, i) =>
  `utility passing item ${String(i + 1).padStart(2, "0")} Ω 🚀 ${"original local serial native progress evidence ".repeat(3)}`);
assert(names.every((name) => name.length >= 120), "INSUFFICIENT_NATIVE_NAME_LENGTH");
const fixtures = {
  flat: names.map((name) => `test(${JSON.stringify(name)}, () => assert.equal(2 + 2, 4));`).join("\n"),
  nested: `test('UTILITY_SERIAL_PARENT Ω 🚀', async (t) => {\n` +
    names.map((name) => `  await t.test(${JSON.stringify(name)}, () => assert.equal(2 + 2, 4));`).join("\n") +
    `\n  await t.test('UTILITY_SKIP_CHILD', { skip: 'UTILITY_SKIP_REASON Ω 🚀' }, () => {});
  await t.test('UTILITY_TODO_CHILD', { todo: 'UTILITY_TODO_REASON Ω 🚀' }, () => {});
  await t.test('UTILITY_DIAGNOSTIC_CHILD', (child) => {
    child.diagnostic('UTILITY_CRITICAL_DIAGNOSTIC_SENTINEL Ω 🚀');
    assert.equal(2 + 2, 4);
  });
});
test('UTILITY_ROOT_SIBLING', () => assert.equal(2 + 2, 4));`,
  failure: `test('UTILITY_FAILURE_CONTEXT Ω 🚀', () => {
  assert.equal('observed', 'expected', 'UTILITY_ASSERT_FAILURE_SENTINEL Ω 🚀');
});`,
  opaque: `test('UTILITY_OPAQUE_CONTEXT', () => {
  console.log('UTILITY_OPAQUE_OUTPUT_SENTINEL user-owned output Ω 🚀');
  process.stderr.write('UTILITY_OPAQUE_STDERR_SENTINEL exact stderr Ω 🚀\\n');
  assert.equal(2 + 2, 4);
});`,
  diagnostic: `test('UTILITY_DIAGNOSTIC_ONLY_CONTEXT', (t) => {
  t.diagnostic('UTILITY_DIAGNOSTIC_ONLY_SENTINEL Ω 🚀');
  assert.equal(2 + 2, 4);
});`,
};
function nativeRows(output) {
  // Observation only: retain literal rows, without deciding grammar validity or generating expectations.
  return output.split("\n").filter((line) =>
    /^(?:TAP version |\s*1\.\.|# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b)/.test(line) ||
    /UTILITY_|# (?:SKIP|TODO)|^\s*(?:---|\.\.\.|error:|failureType:|code:|expected:|actual:|operator:|stack:)/.test(line));
}
async function takeCase(tool, kind, source, explicitTap = false) {
  const cwd = path.dirname(path.join(root, source.file));
  const file = path.basename(source.file);
  const command = `${tool} --test${explicitTap ? " --test-reporter=tap" : ""} ${file}`;
  const id = `${tool}-${kind}${explicitTap ? "-explicit-tap" : "-default"}`;
  const taken = await capture(id, command, cwd, [source]);
  if (!taken) return;
  const { record, output, result } = taken;
  const rows = output === undefined ? [] : nativeRows(output);
  const progressRows = output === undefined ? [] : output.split("\n")
    .filter((line) => names.some((name) => line.includes(name)));
  index.cases.push({ ...record, intent: kind === "flat" || kind === "nested" ? "noise-candidate" : "exact-control",
    reporter: explicitTap ? "explicit-tap" : "default-non-TTY", nativeRows: rows,
    progressNameRows: progressRows.length,
    progressNameRowBytes: Buffer.byteLength(progressRows.map((line) => `${line}\n`).join("")),
    hasTAPVersionRow: rows.some((line) => line.startsWith("TAP version ")),
    nativeFailureMarkerPresent: output?.includes("UTILITY_ASSERT_FAILURE_SENTINEL") ?? false,
  });
  if (result.exitCode !== (kind === "failure" ? 1 : 0)) {
    index.failedCaptures.push({ id, reason: "UNEXPECTED_NATIVE_EXIT", exitCode: result.exitCode });
  }
  await checkpoint();
  // A fallback is a new capture identity. Never overwrite or reinterpret the default command.
  if (!explicitTap && output !== undefined && !rows.some((line) => line.startsWith("TAP version "))) {
    await takeCase(tool, kind, source, true);
  }
}

try {
  for (const directory of [env.HOME, env.XDG_CONFIG_HOME, env.XDG_DATA_HOME, env.XDG_CACHE_HOME,
    env.XDG_STATE_HOME, env.npm_config_cache, path.join(root, "sources"), path.join(root, "captures")]) {
    await mkdir(directory, { recursive: true });
  }
  await writeFile(env.npm_config_userconfig, "");
  await writeFile(env.npm_config_globalconfig, "");
  await writeFile(path.join(root, "LICENSE"), license);
  await checkpoint();
  for (const file of [producer, "scripts/opencode-boundary.mjs", "scripts/real-world/capture.mjs",
    "scripts/real-world/owned-process.mjs", "scripts/real-world/process-guardian.mjs"]) {
    await inventory(path.join(repository, file), file);
  }
  const lockPath = path.join(pinnedProject, "package-lock.json");
  await inventory(lockPath, "pinned-tsx-project/package-lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const tsxPackagePath = path.join(pinnedProject, "node_modules/tsx/package.json");
  await inventory(tsxPackagePath, "pinned-tsx-project/node_modules/tsx/package.json");
  const tsxPackage = JSON.parse(await readFile(tsxPackagePath, "utf8"));
  assert.equal(tsxPackage.version, lock.packages["node_modules/tsx"].version, "TSX_LOCK_VERSION_MISMATCH");
  const tsxExecutable = await realpath(path.join(tsxBin, "tsx"));
  await inventory(tsxExecutable, "pinned-tsx-project/tsx-executable");
  const nodeExecutable = await realpath(process.execPath);
  await inventory(nodeExecutable, "native-node-executable");
  index.tools = [
    { name: "node", version: process.version, executable: nodeExecutable },
    { name: "tsx", version: tsxPackage.version, executable: tsxExecutable,
      lockedIntegrity: lock.packages["node_modules/tsx"].integrity, installation: "existing pinned project; never installed" },
  ];
  for (const tool of ["node", "tsx"]) {
    const taken = await capture(`${tool}-version`, `${tool} --version`, root);
    if (taken) index.toolReceipts.push(taken.record);
    await checkpoint();
    assert(taken?.result.complete && taken.result.exitCode === 0, `${tool.toUpperCase()}_VERSION_DISCOVERY_FAILED`);
    if (tool === "node") assert.equal(taken.output.trim(), "v22.17.1", "NODE_VERSION_MISMATCH");
    else assert(taken.output.includes(`tsx v${tsxPackage.version}`), "TSX_VERSION_MISMATCH");
  }
  for (const [kind, body] of Object.entries(fixtures)) {
    const directory = path.join(root, "sources", kind);
    await mkdir(directory, { recursive: true });
    for (const tool of ["node", "tsx"]) {
      const filename = tool === "node" ? "fixture.mjs" : "fixture.test.ts";
      const file = path.join(directory, filename);
      const typed = tool === "tsx" ? "const nativeEvidenceLanguage: string = 'TypeScript';\n" : "";
      const bytes = Buffer.from(`${header}${typed}${body}\n`);
      await writeFile(file, bytes);
      const source = digest(relative(file), bytes);
      index.sourceInventory.push({ ...source, license: "MIT", origin: "original; no donor material" });
      await checkpoint();
      await takeCase(tool, kind, source);
    }
  }
  await writeFile(path.join(root, "SOURCES.md"), `# Native Node evidence preparation\n\n` +
    `Original MIT fixtures; no donor material. Baseline: ${baseline}. Producer hash: ${index.producer.sha256}.\n\n` +
    `Raw bytes, literal commands, receipt facts, tools and source hashes: capture-index.json and captures/*/capture.json.\n` +
    `Source files actually executed: sources/*/fixture.mjs and sources/*/fixture.test.ts.\n` +
    `Node ${process.version}; tsx ${tsxPackage.version}; existing installation only.\n\n` +
    index.limitations.map((text) => `- ${text}\n`).join(""));
  await checkpoint();
  console.log(JSON.stringify({ privateRoot: root, index: "capture-index.json", producerSHA256: index.producer.sha256,
    cases: index.cases.length, failedCaptures: index.failedCaptures.length }));
  if (index.failedCaptures.length) process.exitCode = 1;
} catch (error) {
  index.failedCaptures.push({ reason: "PREPARATION_BLOCKED", error: String(error), stack: error.stack });
  await checkpoint();
  console.error(`NATIVE_PREPARATION_BLOCKED: ${error.message}; retained ${root}`);
  process.exitCode = 1;
}
