#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Original local fixtures only. Private prep evidence; grammar/expected output await lead inspection.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureCommand, sha256 } from "./real-world/capture.mjs";
import { isolatedEnvironment } from "./opencode-boundary.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = "882585e5f916821a482d14bc7bfe7d6a102b772a";
const timeout = 120000;
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sources = {
  "noise/test_native.py": `# SPDX-License-Identifier: MIT
import warnings
import pytest


@pytest.mark.parametrize("item", range(1200))
def test_passing_parameter(item):
    assert item >= 0


def test_builtin_subtests(subtests):
    with subtests.test(case="alpha"):
        assert 2 + 2 == 4
    with subtests.test(case="beta"):
        assert "café".endswith("é")
    with subtests.test(case="skip"):
        pytest.skip("HUGR_PYTEST_SUBSKIP_SENTINEL café 雪 🧪")


@pytest.mark.skip(reason="HUGR_PYTEST_SKIP_SENTINEL café 雪 🧪")
def test_ordinary_skip():
    assert False


def test_warning_context():
    warnings.warn("HUGR_PYTEST_WARNING_CRITICAL_SENTINEL café 雪 🧪", UserWarning)
`,
  "failure/test_failure.py": `# SPDX-License-Identifier: MIT
def test_assertion_failure():
    actual = "HUGR_PYTEST_ASSERTION_ACTUAL café 雪 🧪"
    expected = "HUGR_PYTEST_ASSERTION_EXPECTED café 雪 🧪"
    assert actual == expected
`,
  "opaque/test_opaque.py": `# SPDX-License-Identifier: MIT
def test_opaque_control():
    assert 6 * 7 == 42
`,
  "opaque/conftest.py": `# SPDX-License-Identifier: MIT
def pytest_terminal_summary(terminalreporter, exitstatus, config):
    terminalreporter.write_line("HUGR_PYTEST_OPAQUE_TERMINAL_SUMMARY café 雪 🧪")
`,
};
const versionProgram = `import json, platform, sys, pytest, pluggy
print(json.dumps({"python": platform.python_version(), "pythonFull": sys.version,
 "pythonExecutable": sys.executable, "pytest": pytest.__version__, "pluggy": pluggy.__version__,
 "pytestModule": pytest.__file__, "pluggyModule": pluggy.__file__}, ensure_ascii=False))`;

async function discover(name) {
  for (const directory of (process.env.PATH ?? "/usr/bin:/bin").split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue;
    const candidate = path.join(directory, name);
    try { await access(candidate, constants.X_OK); return candidate; }
    catch (error) { if (!["ENOENT", "EACCES", "ENOTDIR"].includes(error.code)) throw error; }
  }
  throw new Error(`NATIVE_EXECUTABLE_DISCOVERY_FAILED: ${name}`);
}

async function main() {
  assert.equal(process.argv.length, 2, "NATIVE_PREP_ACCEPTS_NO_ARGUMENTS");
  const parent = path.join(repository, ".native-captures", "pytest");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, "prep-"));
  const relative = (file) => path.relative(root, file).split(path.sep).join("/");
  const indexPath = path.join(root, "capture-index.json");
  const producerBytes = await readFile(fileURLToPath(import.meta.url));
  const index = {
    schema: "hugr-lean/utility-native-prep/1", family: "pytest", stage: "native-inspection-pending",
    baseline, producer: { script: "scripts/utility-native-pytest.mjs", sourceSHA256: sha256(producerBytes) },
    privateRoot: root, createdAt: new Date().toISOString(), timeoutMs: timeout,
    policy: { originalMIT: true, historicalCorpus: false, expectedProofFrozen: false,
      capture: "captureCommand; raw stdout/stderr arrival order; no rewriting",
      environment: "isolatedEnvironment allowlist; private HOME/XDG/cache/TMPDIR; no caller pytest/Python options",
      disabledPluginAutoload: true, inheritedPYTEST_ADDOPTS: false, inheritedPYTHONPATH: false,
      fixtureAddopts: "-rs (show native skipped/subskipped reasons)", columns: 80 },
    sourceInventory: [], tools: [], captures: [], failedCaptures: [], errors: [],
  };
  const save = () => writeFile(indexPath, json(index));
  await save();
  console.log(`PRIVATE_CAPTURE_INDEX=${indexPath}`);

  async function inventory(file, bytes) {
    const entry = { file: relative(file), bytes: bytes.length, sha256: sha256(bytes) };
    index.sourceInventory.push(entry);
    return entry;
  }
  async function putSource(name, text) {
    const file = path.join(root, "projects", name);
    await mkdir(path.dirname(file), { recursive: true });
    const bytes = Buffer.from(text);
    await writeFile(file, bytes, { flag: "wx" });
    return inventory(file, bytes);
  }
  async function capture(id, command, cwd, fixtureSources = []) {
    const directory = path.join(root, "captures", id);
    await mkdir(directory, { recursive: true });
    const entry = { id, command, cwd, fixtureSources, state: "capturing",
      retainedLiveDirectory: relative(path.join(directory, "live")) };
    index.captures.push(entry);
    await save();
    let result;
    try {
      result = await captureCommand({ command, cwd }, env, { timeout, logDir: path.join(directory, "live") });
    } catch (error) {
      entry.state = "capture-error";
      entry.error = { message: error.message, stack: error.stack };
      entry.retainedLiveDirectory = relative(path.join(directory, "live"));
      index.failedCaptures.push(id);
      await writeFile(path.join(directory, "receipt.json"), json(entry));
      await save();
      throw error;
    }
    const { raw, stdout, stderr, output, ...facts } = result;
    entry.facts = { ...facts, launchError: result.launchError ?? null,
      encodingError: result.encodingError ?? null, killErrors: result.killErrors ?? [] };
    entry.artifacts = {};
    for (const [name, bytes] of [["original", raw], ["stdout", stdout], ["stderr", stderr]]) {
      const file = path.join(directory, `${name}.log`);
      await writeFile(file, bytes, { flag: "wx" });
      assert.deepEqual(await readFile(file), bytes, `CAPTURE_ARCHIVE_BYTES_CHANGED: ${id}/${name}`);
      entry.artifacts[name] = { file: relative(file), bytes: bytes.length, sha256: sha256(bytes) };
    }
    entry.state = result.complete && !result.encodingError ? "captured" : "incomplete-or-invalid";
    if (entry.state !== "captured") index.failedCaptures.push(id);
    entry.receipt = relative(path.join(directory, "receipt.json"));
    if (output !== undefined) entry.observedRows = output.split("\n").map((text, offset) => ({ line: offset + 1, text }));
    await writeFile(path.join(root, entry.receipt), json({ ...entry, baseline, producer: index.producer,
      sourceHead: index.sourceHead, environment: index.policy, timeoutMs: timeout,
      tools: index.tools, versions: index.versions ?? null,
      sourceInventorySHA256: sha256(Buffer.from(json(index.sourceInventory))) }));
    await save();
    return result;
  }
  const env = isolatedEnvironment(root, {
    PYTEST_DISABLE_PLUGIN_AUTOLOAD: "1", PYTHONDONTWRITEBYTECODE: "1",
    PYTHONNOUSERSITE: "1", COLUMNS: "80",
  });
  try {
    index.sourceHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
    for (const key of ["HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME", "TMPDIR"])
      await mkdir(env[key], { recursive: true });
    const producerFile = path.join(root, "source", "utility-native-pytest.mjs");
    await mkdir(path.dirname(producerFile), { recursive: true });
    await writeFile(producerFile, producerBytes, { flag: "wx" });
    await inventory(producerFile, producerBytes);
    for (const name of ["scripts/real-world/capture.mjs", "scripts/real-world/owned-process.mjs",
      "scripts/real-world/process-guardian.mjs", "scripts/real-world/windows-process.mjs",
      "scripts/opencode-boundary.mjs"]) {
      const bytes = await readFile(path.join(repository, name));
      const file = path.join(root, "source", path.basename(name));
      await writeFile(file, bytes, { flag: "wx" });
      await inventory(file, bytes);
    }
    for (const [name, text] of Object.entries(sources)) await putSource(name, text);
    const license = await readFile(path.join(repository, "LICENSE"), "utf8");
    for (const project of ["noise", "failure", "opaque"]) {
      await putSource(`${project}/LICENSE`, license);
      await putSource(`${project}/pytest.ini`, "[pytest]\naddopts = -rs\n");
    }
    const versionSource = await putSource("version-proof.py", versionProgram);
    const installedPytest = await discover("pytest");
    const launcher = await readFile(installedPytest);
    const python = /^#!(\/[^\s]+)\s*$/m.exec(launcher.toString("utf8"))?.[1];
    assert.ok(python, "PYTEST_LAUNCHER_REQUIRES_ABSOLUTE_PYTHON_SHEBANG");
    await access(python, constants.X_OK);
    env.PATH = `${path.dirname(installedPytest)}${path.delimiter}${env.PATH}`;
    index.tools = [{ name: "pytest", executable: installedPytest, realpath: await realpath(installedPytest),
      launcherSHA256: sha256(launcher) }, { name: "python", executable: python, realpath: await realpath(python) }];
    await save();
    const proof = await capture("versions", `${quote(python)} ${quote(path.join(root, versionSource.file))}`,
      path.join(root, "projects"), [versionSource]);
    assert.ok(proof.complete && proof.exitCode === 0 && !proof.encodingError, "PYTHON_VERSION_CAPTURE_FAILED");
    index.versions = JSON.parse(proof.output);
    assert.equal(index.versions.python, "3.14.5", "NATIVE_PYTHON_VERSION_MISMATCH");
    assert.equal(index.versions.pytest, "9.0.3", "NATIVE_PYTEST_VERSION_MISMATCH");
    assert.equal(index.versions.pluggy, "1.6.0", "NATIVE_PLUGGY_VERSION_MISMATCH");
    for (const key of ["pytestModule", "pluggyModule"]) {
      const bytes = await readFile(index.versions[key]);
      index.tools.push({ name: key, executable: index.versions[key], bytes: bytes.length, sha256: sha256(bytes) });
    }
    const cliProof = await capture("pytest-version", "pytest --version", path.join(root, "projects"));
    assert.ok(cliProof.complete && cliProof.exitCode === 0 && cliProof.output.trim() === "pytest 9.0.3",
      "PYTEST_EXECUTABLE_VERSION_CAPTURE_FAILED");
    const cases = [
      ["default", "pytest", "noise", 0], ["quiet", "pytest -q", "noise", 0],
      ["assertion-failure", "pytest", "failure", 1], ["opaque-summary", "pytest", "opaque", 0],
    ];
    for (const [id, command, project, expectedExit] of cases) {
      const fixtureSources = index.sourceInventory.filter(({ file }) => file.startsWith(`projects/${project}/`));
      const result = await capture(id, command, path.join(root, "projects", project), fixtureSources);
      assert.ok(result.complete && !result.encodingError, `NATIVE_CASE_INCOMPLETE: ${id}`);
      assert.equal(result.exitCode, expectedExit, `NATIVE_CASE_EXIT_MISMATCH: ${id}`);
      const entry = index.captures.find((item) => item.id === id);
      entry.role = expectedExit ? "native-nonzero-control" : id === "opaque-summary" ? "native-opaque-control" : "native-noise-candidate";
      await save();
    }
    // Byte/digest instrument calibration only; does not establish parser conformance or frozen goldens.
    const control = Buffer.from("HUGR_BYTE_CONTROL café 雪 🧪\n");
    const changed = Buffer.from(control);
    changed[0] ^= 1;
    assert.notEqual(sha256(control), sha256(changed), "DIGEST_CORRUPTION_CONTROL_NOT_SEEN");
    index.calibration = { controlSHA256: sha256(control), changedSHA256: sha256(changed), corruptionDetected: true,
      archiveRoundTrip: "every original/stdout/stderr file read back and compared byte-for-byte" };
    index.sourceInventorySHA256 = sha256(Buffer.from(json(index.sourceInventory)));
    index.completedAt = new Date().toISOString();
    await save();
    console.log(json({ producer: index.producer, versions: index.versions, captures: index.captures.map(({ id, facts, artifacts }) =>
      ({ id, exitCode: facts.exitCode, complete: facts.complete, timedOut: facts.timedOut, original: artifacts.original })) }));
  } catch (error) {
    index.errors.push({ message: error.message, stack: error.stack });
    await save();
    throw error;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
