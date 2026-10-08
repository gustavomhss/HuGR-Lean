import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
// @ts-expect-error Developer-only script, no published declarations.
import { readUtilityCorpus, readArtifactInventory } from "../scripts/utility-corpus.mjs";
// @ts-expect-error Developer-only script, no published declarations.
import { evaluateUtilityCorpus } from "../scripts/utility-evaluation.mjs";
import { createAfterHook } from "../src/opencode/index.js";
import type { Observation, FilterResult } from "../src/types.js";

type Json = Record<string, any>;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const profiles: Json = { go: "go-test-verbose", pytest: "pytest", node: "node-test", cargo: "cargo-test" };
const keep = "KEEP café 🧪\n", captureDefinition = "stdout/stderr arrival order; no text rewriting";
// MOCK metadata grammar/plumbing only; never native CLI conformance or merge-authenticity proof.
async function mockCorpus(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "hugr-corpus-fix-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifests: Json = {}, receipts: Json = {};
  async function put(family: string, file: string, value: string) {
    await writeFile(path.join(root, family, file), value);
    return { file, bytes: Buffer.byteLength(value), sha256: hash(value) };
  }
  for (const family of Object.keys(profiles)) {
    await mkdir(path.join(root, family));
    const tools = [{ name: family, version: "MOCK-1", executable: `/mock/${family}` }];
    const producer = { script: `scripts/mock-${family}.mjs`, sourceSHA256: hash("mock producer") };
    const source = await put(family, "fixture.mjs", "// mock source\n");
    await put(family, "producer-source.mjs", "mock producer");
    const cases = [];
    for (const role of ["noise", "exact"]) {
      const original = role === "noise" ? "noise\n".repeat(300) + keep : keep;
      const streams = { original: await put(family, `${role}.log`, original), stdout: await put(family, `${role}.stdout.log`, original), stderr: await put(family, `${role}.stderr.log`, "") };
      const facts = { command: `mock-${family}`, cwd: "/historical/not-dereferenced", exitCode: role === "noise" ? 0 : 1,
        complete: true, timedOut: false, signal: null, nativeSpawned: true, nativeExitObserved: true, durationMs: 1,
        durationBoundary: "pipe-close", captureDefinition };
      const receipt: Json = { ...(family === "pytest" ? { facts, command: facts.command, cwd: facts.cwd } : facts),
        producer, tools, fixtureSources: [source], artifacts: streams, baseline: "1".repeat(40), environmentPolicy: "mock isolation" };
      receipts[`${family}/${role}`] = receipt;
      cases.push({ id: role, profile: profiles[family], command: facts.command, role, expectedStatus: role === "noise" ? "reduced" : "passthrough",
        exitCode: facts.exitCode, complete: true, timedOut: false, signal: null, fixtureSources: [source], ...streams,
        capture: await put(family, `${role}.json`, JSON.stringify(receipt)), expected: await put(family, `${role}.expected.log`, keep),
        required: [{ text: keep, occurrence: 0 }], material: role === "noise" });
    }
    manifests[family] = { schema: "hugr-lean/utility-corpus/1", family, producer, tools, cases };
    await put(family, "manifest.json", JSON.stringify(manifests[family]));
    await put(family, "SOURCES.md", "MOCK schema/plumbing. No native proof.\n");
  }
  const save = async (family: string) => { await put(family, "manifest.json", JSON.stringify(manifests[family])); };
  const saveReceipt = async (family: string, role = "noise") => {
    const item = manifests[family].cases.find((row: Json) => row.id === role);
    item.capture = await put(family, item.capture.file, JSON.stringify(receipts[`${family}/${role}`]));
    await save(family);
  };
  return { root, manifests, receipts, put, save, saveReceipt };
}
const filter = (obs: Observation): FilterResult => obs.termination.kind === "exited" && obs.termination.code === 0
  ? { status: "reduced", profile: profiles[obs.command.slice(5)], replacement: keep, inputBytes: Buffer.byteLength(obs.output), outputBytes: Buffer.byteLength(keep), reason: "MOCK" }
  : { status: "passthrough", inputBytes: Buffer.byteLength(obs.output), outputBytes: Buffer.byteLength(obs.output), reason: "MOCK" };
const hook = () => createAfterHook({ raw: false }, { filter });

test("four families permit local IDs; report/failure/callID qualify family/id and aggregate totals", async (t) => {
  const f = await mockCorpus(t), calls: string[] = [];
  const report = await evaluateUtilityCorpus({ root: f.root, filter, createAfterHook: () => async (input: Json, output: Json) => {
    calls.push(input.callID); await hook()(input, output);
  } });
  assert.equal(report.ok, true);
  assert.equal(report.expectedCases, 8); assert.equal(report.checked, 8);
  assert.equal(new Set(calls).size, 8); assert.ok(calls.includes("go/noise") && calls.includes("cargo/noise"));
  assert.equal(report.families.reduce((sum: number, row: Json) => sum + row.cases, 0), report.checked);
  assert.equal(report.families.reduce((sum: number, row: Json) => sum + row.inputBytes, 0), report.records.reduce((sum: number, row: Json) => sum + row.inputBytes, 0));
  assert.deepEqual(report.records[0].captureReceipt, f.receipts["go/noise"]);
  const failed = await evaluateUtilityCorpus({ root: f.root, filter: () => { throw new Error("MOCK_FAIL"); }, createAfterHook: hook });
  assert.equal(failed.failures[0].id, "go/noise");
});

test("ambient ancestor aliases canonicalize; explicit root and descendant symlinks reject", async (t) => {
  const f = await mockCorpus(t), alias = `${f.root}-alias`;
  await symlink(path.dirname(f.root), alias);
  t.after(() => rm(alias));
  assert.equal((await readUtilityCorpus(path.join(alias, path.basename(f.root)))).cases.length, 8);
  await assert.rejects(readArtifactInventory(alias), /SYMLINK/);
  await symlink("noise.log", path.join(f.root, "go/descendant.log"));
  await assert.rejects(readUtilityCorpus(f.root), /SYMLINK/);
});

test("stored stream paths bind receipt sourceFile, not relocated file name", async (t) => {
  const f = await mockCorpus(t), row = f.manifests.pytest.cases[0], receipt = f.receipts["pytest/noise"];
  for (const key of ["original", "stdout", "stderr"]) {
    receipt.artifacts[key] = { ...receipt.artifacts[key], file: `native/captures/${key}.log` };
    row[key] = { ...row[key], sourceFile: receipt.artifacts[key].file };
  }
  await f.saveReceipt("pytest");
  assert.equal((await readUtilityCorpus(f.root)).cases.length, 8);
  row.original.sourceFile = "wrong-origin.log";
  await f.save("pytest");
  await assert.rejects(readUtilityCorpus(f.root), /RECEIPT_ARTIFACT_MISMATCH/);
});

test("case producer override binds actual aliases; contradictory raw aliases always fail", async (t) => {
  const f = await mockCorpus(t), receipt = f.receipts["cargo/noise"], row = f.manifests.cargo.cases[0];
  row.producer = { script: "scripts/mock-remaining.mjs", sourceSHA256: f.manifests.cargo.producer.sourceSHA256 };
  receipt.producer = { file: row.producer.script, sha256: row.producer.sourceSHA256 };
  await f.saveReceipt("cargo");
  assert.equal((await readUtilityCorpus(f.root)).cases.length, 8);
  receipt.producer.script = "scripts/wrong.mjs";
  await f.saveReceipt("cargo");
  await assert.rejects(readUtilityCorpus(f.root), /CONFLICTING_PRODUCER_ALIAS/);
  receipt.producer.script = receipt.producer.file; receipt.producer.sourceSHA256 = "0".repeat(64);
  await f.saveReceipt("cargo");
  await assert.rejects(readUtilityCorpus(f.root), /CONFLICTING_PRODUCER_ALIAS/);
});

test("Cargo source phase is explicit; wrong before/after version cannot match by name alone", async (t) => {
  const f = await mockCorpus(t), receipt = f.receipts["cargo/noise"], row = f.manifests.cargo.cases[0];
  receipt.fixtureSourcesBefore = receipt.fixtureSources;
  receipt.fixtureSourcesAfter = [{ ...receipt.fixtureSources[0], sha256: "0".repeat(64) }];
  delete receipt.fixtureSources;
  await f.saveReceipt("cargo");
  await assert.rejects(readUtilityCorpus(f.root), /SOURCE_PHASE_REQUIRED/);
  row.sourcePhase = "before"; await f.save("cargo");
  assert.equal((await readUtilityCorpus(f.root)).cases.length, 8);
  row.sourcePhase = "after"; await f.save("cargo");
  await assert.rejects(readUtilityCorpus(f.root), /RECEIPT_ARTIFACT_MISMATCH/);
});

test("all nested pytest top-level facts, including error and native fields, cannot contradict", async (t) => {
  for (const [key, value] of [["cwd", "/wrong"], ["nativeExitObserved", false], ["durationMs", 2], ["encodingError", "FAILED"]]) {
    const f = await mockCorpus(t), receipt = f.receipts["pytest/noise"];
    if (key === "encodingError") receipt.facts.encodingError = null;
    receipt[key as string] = value;
    await f.saveReceipt("pytest");
    await assert.rejects(readUtilityCorpus(f.root), /CONFLICTING_RECEIPT_FACTS/);
  }
});

test("observation mutation fails independently of matching core bytes and hook", async (t) => {
  const f = await mockCorpus(t);
  const report = await evaluateUtilityCorpus({ root: f.root, filter: (obs: Json) => {
    const result = filter(obs as Observation); obs.command = "FORGED"; return result;
  }, createAfterHook: hook });
  assert.equal(report.ok, false); assert.equal(report.checked, 8);
  assert.ok(report.failures.every((row: Json) => row.error.includes("OBSERVATION_CHANGED")));
});

test("known raw tool diagnostics are closed and agree when manifest declares them", async (t) => {
  const f = await mockCorpus(t);
  for (const row of f.manifests.node.cases) {
    f.receipts[`node/${row.id}`].tools = [{ ...f.receipts[`node/${row.id}`].tools[0], lockedIntegrity: "sha512-MOCK", installation: "mock local" }];
    await f.saveReceipt("node", row.id);
  }
  assert.equal((await readUtilityCorpus(f.root)).cases.length, 8);
  f.manifests.node.tools[0] = { ...f.manifests.node.tools[0], lockedIntegrity: "sha512-MOCK", installation: "mock local" };
  await f.save("node");
  assert.equal((await readUtilityCorpus(f.root)).cases.length, 8);
  f.receipts["node/noise"].tools[0].lockedIntegrity = "sha512-FORGED";
  await f.saveReceipt("node");
  await assert.rejects(readUtilityCorpus(f.root), /TOOL_DIAGNOSTIC_MISMATCH/);
});

test("unknown receipt, nested facts, raw tool and stream descriptor metadata fail by field name", async (t) => {
  for (const location of ["receipt", "facts", "tool", "artifact"]) {
    const f = await mockCorpus(t), receipt = f.receipts["pytest/noise"];
    const target = location === "receipt" ? receipt : location === "facts" ? receipt.facts : location === "tool" ? receipt.tools[0] : receipt.artifacts.original;
    target.injectedUnknownMetadata = true;
    await f.saveReceipt("pytest");
    await assert.rejects(readUtilityCorpus(f.root), /UNKNOWN_FIELD: .*injectedUnknownMetadata/);
  }
});

test("top-level pytest error is retained even if nested facts omit error key", async (t) => {
  const f = await mockCorpus(t);
  f.receipts["pytest/noise"].launchError = "ORIGINAL_FAILURE";
  await f.saveReceipt("pytest");
  const report = await evaluateUtilityCorpus({ root: f.root, filter, createAfterHook: hook });
  assert.equal(report.ok, false); assert.equal(report.expectedCases, null);
  assert.match(report.failures[0].error, /CAPTURE_ERRORS/);
});

test("valid-shaped source inventory hash cannot masquerade as bound source index", async (t) => {
  const f = await mockCorpus(t);
  f.receipts["pytest/noise"].sourceInventorySHA256 = hash("WRONG full source inventory");
  await f.saveReceipt("pytest");
  await assert.rejects(readUtilityCorpus(f.root), /UNBOUND_SOURCE_INVENTORY/);
});

test("all pytest provenance roots are typed; shaped index hashes remain blocked pending mapped proof", async (t) => {
  const f = await mockCorpus(t), declaration = (root: string) => ({ root, sourceHead: "1".repeat(40),
    indexSHA256: hash(`${root} index`), sourceInventorySHA256: hash(`${root} inventory`), producer: f.manifests.pytest.producer });
  f.manifests.pytest.provenance = [declaration("prep"), declaration("extra")];
  await f.save("pytest");
  await assert.rejects(readUtilityCorpus(f.root), /UNBOUND_PROVENANCE_INDEX/);
  f.manifests.pytest.provenance[1].sourceHead = "malformed";
  await f.save("pytest");
  await assert.rejects(readUtilityCorpus(f.root), /INVALID_PROVENANCE_ROOT: pytest: extra/);
  f.manifests.pytest.provenance[1] = declaration("prep");
  await f.save("pytest");
  await assert.rejects(readUtilityCorpus(f.root), /DUPLICATE_PROVENANCE_ROOT/);
  f.manifests.pytest.provenance = [declaration("prep")];
  f.manifests.pytest.provenance[0].indexSHA256 = hash("WRONG actual artifact bytes");
  await f.put("pytest", "unmapped-index.json", JSON.stringify({ sourceInventory: [] }));
  await f.save("pytest");
  await assert.rejects(readUtilityCorpus(f.root), /UNBOUND_PROVENANCE_INDEX/);
});

test("producer source bytes are mandatory and hash/length bound; helpers need explicit mapping", async (t) => {
  const f = await mockCorpus(t);
  await rm(path.join(f.root, "node/producer-source.mjs"));
  await assert.rejects(readUtilityCorpus(f.root), /MISSING_PRODUCER_SNAPSHOT/);
  await f.put("node", "producer-source.mjs", "mock producer");
  f.receipts["node/noise"].producer = { ...f.receipts["node/noise"].producer, bytes: 1000 };
  await f.saveReceipt("node");
  await assert.rejects(readUtilityCorpus(f.root), /PRODUCER_BYTES_MISMATCH/);
  delete f.receipts["node/noise"].producer.bytes;
  await f.saveReceipt("node");
  f.receipts["go/noise"].producer = { ...f.receipts["go/noise"].producer, dependencies: [{ file: "scripts/helper.mjs", sha256: hash("mock helper") }] };
  await f.saveReceipt("go");
  await assert.rejects(readUtilityCorpus(f.root), /UNBOUND_PRODUCER_HELPERS/);
});

test("missing root is named read failure; declared capture definition is not merge-authenticity proof", async (t) => {
  const f = await mockCorpus(t);
  const missing = await evaluateUtilityCorpus({ root: path.join(f.root, "missing-root"), filter, createAfterHook: hook });
  assert.equal(missing.ok, false); assert.equal(missing.checked, 0);
  assert.match(missing.failures[0].error, /ENOENT.*missing-root/);
  assert.match(missing.streamOracle, /chunk ordering not independently authenticated/);
  f.receipts["go/noise"].captureDefinition = "rewritten stream";
  await f.saveReceipt("go");
  await assert.rejects(readUtilityCorpus(f.root), /INVALID_CAPTURE_DEFINITION/);
});
