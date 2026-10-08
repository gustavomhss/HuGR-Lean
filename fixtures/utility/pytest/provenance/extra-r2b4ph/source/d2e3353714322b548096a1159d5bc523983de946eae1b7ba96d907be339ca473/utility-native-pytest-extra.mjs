#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Original supplemental argv witnesses only; no parser, expected files or historical reruns.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureCommand, sha256 } from "./real-world/capture.mjs";
import { isolatedEnvironment } from "./opencode-boundary.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const priorRoot = path.join(repository, ".native-captures/pytest/prep-fHWQpI");
const priorDigest = "fd62178eaa08e6d711c16bd8ac768b9ad6b220fb4c38e1099857315da0250f49";
const timeoutMs = 120000;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const prefix = Buffer.from('"""Original MIT native doctest witness.\n\n>>> 2 + 2\n4\n"""\n');

async function main() {
  assert.equal(process.argv.length, 2, "SUPPLEMENTAL_CAPTURE_ACCEPTS_NO_ARGUMENTS");
  assert.equal(sha256(Buffer.from("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const changed = Buffer.from(prefix);
  changed[0] ^= 1;
  assert.notEqual(sha256(prefix), sha256(changed), "DIGEST_CORRUPTION_CONTROL_NOT_SEEN");
  const priorBytes = await readFile(path.join(priorRoot, "capture-index.json"));
  assert.equal(sha256(priorBytes), priorDigest, "PRIOR_INDEX_CHANGED");
  const prior = JSON.parse(priorBytes);
  const preserved = new Map([["capture-index.json", priorBytes]]);
  async function retainPrior(file, expected) {
    const absolute = path.resolve(priorRoot, file);
    assert.ok(absolute.startsWith(`${priorRoot}${path.sep}`), "INVALID_PRIOR_ARTIFACT_PATH");
    const bytes = await readFile(absolute);
    if (expected) {
      assert.equal(bytes.length, expected.bytes, `PRIOR_BYTES_CHANGED: ${file}`);
      assert.equal(sha256(bytes), expected.sha256, `PRIOR_DIGEST_CHANGED: ${file}`);
    }
    preserved.set(file, bytes);
    return bytes;
  }
  for (const source of prior.sourceInventory) await retainPrior(source.file, source);
  for (const item of prior.captures) {
    const receipt = JSON.parse(await retainPrior(item.receipt));
    assert.deepEqual(receipt.facts, item.facts, `PRIOR_RECEIPT_MISMATCH: ${item.id}`);
    for (const [name, artifact] of Object.entries(item.artifacts)) {
      const bytes = await retainPrior(artifact.file, artifact);
      assert.deepEqual(await retainPrior(`${item.retainedLiveDirectory}/${name}.live`), bytes);
    }
    await retainPrior(`${item.retainedLiveDirectory}/running.json`);
  }
  const root = await mkdtemp(path.join(repository, ".native-captures/pytest/extra-"));
  const relative = (file) => path.relative(root, file).split(path.sep).join("/");
  const producerBytes = await readFile(fileURLToPath(import.meta.url));
  const indexPath = path.join(root, "capture-index.json");
  const index = {
    schema: "hugr-lean/utility-native-prep-extra/1", family: "pytest",
    stage: "supplemental-native-inspection-pending", privateRoot: root,
    createdAt: new Date().toISOString(), timeoutMs,
    baseline: prior.baseline,
    sourceHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim(),
    producer: { script: "scripts/utility-native-pytest-extra.mjs", sourceSHA256: sha256(producerBytes) },
    prior: { index: path.join(priorRoot, "capture-index.json"), sha256: priorDigest,
      sourceHead: prior.sourceHead, inventorySHA256: prior.sourceInventorySHA256 },
    policy: { ...prior.policy, supplementalOnly: true, commands: [
      "pytest test_native.py --color=no", "pytest --doctest-modules test_native.py --color=no",
    ] },
    versions: prior.versions, versionProof: { kind: "linked-prior-native-captures",
      captures: prior.captures.filter(({ id }) => ["versions", "pytest-version"].includes(id))
        .map(({ id, artifacts, receipt }) => ({ id, artifacts, receipt })) },
    tools: prior.tools, sourceInventory: [], captures: [], failedCaptures: [], errors: [],
    transformation: { source: "projects/noise/test_native.py",
      sourceSHA256: prior.sourceInventory.find(({ file }) => file === "projects/noise/test_native.py").sha256,
      modification: "Prepend original MIT module docstring with one passing doctest; suffix bytes unchanged",
      prefixBytes: prefix.length, prefixSHA256: sha256(prefix), lineOffset: 5,
      anchors: { warning: { before: 26, after: 31 }, ordinarySkip: { before: 20, after: 25 },
        subtestSkip: { before: 17, after: 22 } } },
  };
  const save = () => writeFile(indexPath, json(index));
  await save();
  console.log(`PRIVATE_SUPPLEMENTAL_INDEX=${indexPath}`);
  async function put(file, bytes) {
    const absolute = path.join(root, file);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, bytes, { flag: "wx" });
    assert.deepEqual(await readFile(absolute), bytes, `SOURCE_ARCHIVE_CHANGED: ${file}`);
    const entry = { file, bytes: bytes.length, sha256: sha256(bytes) };
    index.sourceInventory.push(entry);
    return entry;
  }
  const env = isolatedEnvironment(root, {
    PYTEST_DISABLE_PLUGIN_AUTOLOAD: "1", PYTHONDONTWRITEBYTECODE: "1",
    PYTHONNOUSERSITE: "1", COLUMNS: "80",
  });
  try {
    for (const key of ["HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME", "TMPDIR"])
      await mkdir(env[key], { recursive: true });
    const pytest = index.tools.find(({ name }) => name === "pytest");
    assert.equal(sha256(await readFile(pytest.executable)), pytest.launcherSHA256, "PYTEST_LAUNCHER_CHANGED");
    for (const tool of index.tools.filter(({ name }) => ["pytestModule", "pluggyModule"].includes(name))) {
      const bytes = await readFile(tool.executable);
      assert.equal(bytes.length, tool.bytes, `TOOL_BYTES_CHANGED: ${tool.name}`);
      assert.equal(sha256(bytes), tool.sha256, `TOOL_DIGEST_CHANGED: ${tool.name}`);
    }
    assert.equal(index.versions.pytest, "9.0.3");
    assert.equal(index.versions.pluggy, "1.6.0");
    env.PATH = `${path.dirname(pytest.executable)}${path.delimiter}${env.PATH}`;
    await put("source/utility-native-pytest-extra.mjs", producerBytes);
    for (const name of ["scripts/real-world/capture.mjs", "scripts/real-world/owned-process.mjs",
      "scripts/real-world/process-guardian.mjs", "scripts/real-world/windows-process.mjs",
      "scripts/opencode-boundary.mjs"]) {
      const bytes = await readFile(path.join(repository, name));
      assert.deepEqual(bytes, preserved.get(`source/${path.basename(name)}`), `CAPTURE_HELPER_CHANGED: ${name}`);
      await put(`source/${path.basename(name)}`, bytes);
    }
    const original = preserved.get("projects/noise/test_native.py");
    const extended = Buffer.concat([prefix, original]);
    assert.deepEqual(extended.subarray(prefix.length), original);
    await put("projects/noise/test_native.py", extended);
    for (const name of ["LICENSE", "pytest.ini"])
      await put(`projects/noise/${name}`, preserved.get(`projects/noise/${name}`));
    index.sourceInventorySHA256 = sha256(Buffer.from(json(index.sourceInventory)));
    await save();
    for (const [id, command] of [["literal-path", index.policy.commands[0]], ["doctest-path", index.policy.commands[1]]]) {
      const cwd = path.join(root, "projects/noise");
      const directory = path.join(root, "captures", id);
      await mkdir(directory, { recursive: true });
      const entry = { id, command, cwd, state: "capturing",
        fixtureSources: index.sourceInventory.filter(({ file }) => file.startsWith("projects/noise/")),
        retainedLiveDirectory: relative(path.join(directory, "live")),
        receipt: relative(path.join(directory, "receipt.json")) };
      index.captures.push(entry);
      await save();
      try {
        const result = await captureCommand({ command, cwd }, env, { timeout: timeoutMs, logDir: path.join(directory, "live") });
        const { raw, stdout, stderr, output, ...facts } = result;
        entry.facts = { ...facts, launchError: result.launchError ?? null,
          encodingError: result.encodingError ?? null, killErrors: result.killErrors ?? [] };
        entry.artifacts = {};
        for (const [name, bytes] of [["original", raw], ["stdout", stdout], ["stderr", stderr]]) {
          const file = path.join(directory, `${name}.log`);
          await writeFile(file, bytes, { flag: "wx" });
          assert.deepEqual(await readFile(file), bytes, `CAPTURE_ARCHIVE_CHANGED: ${id}/${name}`);
          entry.artifacts[name] = { file: relative(file), bytes: bytes.length, sha256: sha256(bytes) };
        }
        if (output !== undefined) entry.observedRows = output.split("\n").map((text, offset) => ({ line: offset + 1, text }));
        entry.state = result.complete && !result.encodingError && result.exitCode === 0 ? "captured" : "native-attempt-failed";
        if (entry.state !== "captured") index.failedCaptures.push(id);
        entry.role = "supplemental-native-argv-witness";
      } catch (error) {
        entry.state = "capture-error";
        entry.error = { message: error.message, stack: error.stack };
        index.failedCaptures.push(id);
      }
      await writeFile(path.join(root, entry.receipt), json({ ...entry, baseline: index.baseline,
        sourceHead: index.sourceHead, producer: index.producer, prior: index.prior,
        environment: index.policy, timeoutMs, tools: index.tools, versions: index.versions,
        versionProof: index.versionProof, sourceInventorySHA256: index.sourceInventorySHA256,
        transformation: index.transformation }));
      await save();
      console.log(json({ id, state: entry.state, facts: entry.facts, artifacts: entry.artifacts, error: entry.error }));
    }
    if (index.failedCaptures.length) throw new Error("SUPPLEMENTAL_NATIVE_ATTEMPTS_FAILED; retained, never retried");
    index.completedAt = new Date().toISOString();
  } catch (error) {
    index.errors.push({ message: error.message, stack: error.stack });
    process.exitCode = 1;
  } finally {
    try {
      for (const [file, bytes] of preserved)
        assert.deepEqual(await readFile(path.join(priorRoot, file)), bytes, `PRIOR_ARTIFACT_CHANGED: ${file}`);
      index.prior.unchangedVerification = { verifiedAt: new Date().toISOString(),
        files: [...preserved].map(([file, bytes]) => ({ file, bytes: bytes.length, sha256: sha256(bytes) })) };
    } catch (error) {
      index.errors.push({ message: error.message, stack: error.stack });
      process.exitCode = 1;
    }
    await save();
    console.log(json({ index: indexPath, sha256: sha256(await readFile(indexPath)),
      failedCaptures: index.failedCaptures, errors: index.errors }));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
