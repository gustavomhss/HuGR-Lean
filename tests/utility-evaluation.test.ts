import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm, realpath, symlink, link } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
// Script is intentionally outside runtime TypeScript modules.
// @ts-expect-error No declaration is shipped for developer-only scripts.
import { readUtilityCorpus, evaluateUtilityCorpus } from "../scripts/utility-evaluation.mjs";
import { createAfterHook } from "../src/opencode/index.js";
import type { Observation, FilterResult } from "../src/types.js";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const profiles = { go: "go-test-verbose", pytest: "pytest", node: "node-test", cargo: "cargo-test" };
type Json = Record<string, any>;
// Synthetic schema corpus, NOT native CLI conformance. All evidence below is mock plumbing.
async function synthetic(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(await realpath(os.tmpdir()), "hugr-eval-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifests: Record<string, Json> = {}, receipts: Record<string, Json> = {};
  for (const [family, profile] of Object.entries(profiles)) {
    const directory = path.join(root, family);
    await mkdir(directory);
    const put = async (file: string, value: string) => {
      await writeFile(path.join(directory, file), value);
      return { file, bytes: Buffer.byteLength(value), sha256: hash(value) };
    };
    const tools = [{ name: family, version: "mock-1", executable: `/mock/${family}` }];
    const producer = { script: `scripts/mock-${family}.mjs`, sourceSHA256: hash("mock producer") };
    const source = await put("fixture.mjs", "// mock fixture\n");
    const cases = [];
    for (const role of ["noise", "exact"]) {
      const id = `${family}-${role}`, expected = "KEEP café 🧪\n", original = role === "noise" ? "noise\n".repeat(300) + expected : expected;
      const streams = { original: await put(`${role}.log`, original), stdout: await put(`${role}.stdout.log`, original), stderr: await put(`${role}.stderr.log`, "") };
      const facts = { command: `mock-${family}`, cwd: "/historical/never-read", exitCode: role === "noise" ? 0 : 1,
        signal: null, timedOut: false, complete: true, nativeSpawned: true, nativeExitObserved: true,
        durationMs: 1, durationBoundary: "pipe-close" };
      const receipt = { ...(family === "pytest" ? { facts } : facts), producer, tools, fixtureSources: [source],
        artifacts: streams, baseline: "1".repeat(40), environmentPolicy: "mock isolation" };
      receipts[id] = receipt;
      cases.push({ id, profile, ...facts, role, expectedStatus: role === "noise" ? "reduced" : "passthrough",
        capture: await put(`${role}.json`, JSON.stringify(receipt)), fixtureSources: [source], ...streams,
        expected: await put(`${role}.expected.log`, expected), required: [{ text: expected, occurrence: 0 }], material: role === "noise" });
      // Manifest contains only its frozen case fields; native provenance stays in receipt.
      for (const key of ["cwd", "nativeSpawned", "nativeExitObserved", "durationMs", "durationBoundary"]) delete cases.at(-1)![key as keyof typeof cases[number]];
    }
    manifests[family] = { schema: "hugr-lean/utility-corpus/1", family, tools, producer, cases };
    await put("manifest.json", JSON.stringify(manifests[family]));
    await put("SOURCES.md", "Synthetic mock plumbing only. No native conformance claim.\n");
  }
  const save = async (family: string) => writeFile(path.join(root, family, "manifest.json"), JSON.stringify(manifests[family]));
  const changeArtifact = async (family: string, ref: Json, value: string | Buffer) => {
    await writeFile(path.join(root, family, ref.file), value);
    ref.bytes = Buffer.byteLength(value); ref.sha256 = hash(value);
  };
  const saveReceipt = async (family: string, role: string) => {
    const item = manifests[family]!.cases.find((row: Json) => row.role === role);
    await changeArtifact(family, item.capture, JSON.stringify(receipts[item.id]));
    await save(family);
  };
  return { root, manifests, receipts, save, changeArtifact, saveReceipt };
}

test("synthetic mock schema: four families, independent noise and exact bytes", async (t) => {
  const fixture = await synthetic(t), corpus = await readUtilityCorpus(fixture.root);
  assert.equal(corpus.families.length, 4);
  assert.equal(corpus.cases.length, 8);
  assert.equal(corpus.cases.filter((row: Json) => row.material).length, 4);
});

test("reader rejects empty cases instead of checking zero", async (t) => {
  const fixture = await synthetic(t);
  fixture.manifests.go!.cases = [];
  await fixture.save("go");
  await assert.rejects(readUtilityCorpus(fixture.root), /EMPTY_OR_INVALID_LIST: go: cases/);
});

// Mock filter uses fixture-only text, not a production-derived golden. Real adapter plumbing is exercised.
const mockFilter = (observation: Observation): FilterResult => {
  const inputBytes = Buffer.byteLength(observation.output);
  if (observation.termination.kind === "exited" && observation.termination.code === 0) {
    const replacement = "KEEP café 🧪\n";
    return { status: "reduced", profile: profiles[observation.command.slice(5) as keyof typeof profiles],
      replacement, inputBytes, outputBytes: Buffer.byteLength(replacement), reason: "MOCK_PLUMBING" };
  }
  return { status: "passthrough", inputBytes, outputBytes: inputBytes, reason: "MOCK_EXACT" };
};
const mockHook = () => createAfterHook({ raw: false }, { filter: mockFilter });

test("evaluation counts exact and reduced mock cases; real adapter preserves facts", async (t) => {
  const fixture = await synthetic(t);
  const report = await evaluateUtilityCorpus({ root: fixture.root, filter: mockFilter, createAfterHook: mockHook });
  assert.equal(report.ok, true);
  assert.equal(report.checked, 8);
  assert.equal(report.passed, 8);
  assert.equal(report.records.filter((row: Json) => row.role === "exact").length, 4);
  assert.match(report.oracle, /declarations checked by parser tests/);
});

test("forged filter cannot set its own expected status, bytes, profile or output", async (t) => {
  const fixture = await synthetic(t);
  for (const [name, forge] of Object.entries({
    status: (result: Json) => ({ ...result, status: "normalized" }),
    bytes: (result: Json) => ({ ...result, outputBytes: 0 }),
    profile: (result: Json) => ({ ...result, profile: "forged" }),
    loss: (result: Json) => ({ ...result, replacement: "LOST", outputBytes: 4 }),
    sameBytes: (result: Json) => ({ ...result, replacement: "X".repeat(result.outputBytes) }),
  })) {
    const filter = (observation: Observation) => forge(mockFilter(observation));
    const report = await evaluateUtilityCorpus({ root: fixture.root, filter, createAfterHook: mockHook });
    assert.equal(report.ok, false, name);
    assert.equal(report.checked, 8);
    assert.equal(report.failures.length, 8, name);
  }
});

test("filter and hook errors retain named failed records", async (t) => {
  const fixture = await synthetic(t);
  for (const stage of ["filter", "hook"]) {
    const report = await evaluateUtilityCorpus({ root: fixture.root,
      filter: stage === "filter" ? () => { throw new Error("FILTER_SENTINEL"); } : mockFilter,
      createAfterHook: () => async () => { throw new Error("HOOK_SENTINEL"); } });
    assert.equal(report.ok, false);
    assert.equal(report.checked, 8);
    assert.equal(report.passed, 0);
    assert.equal(report.failures.length, 8);
    assert.equal(report.failures[0].id, "go-noise");
    assert.equal(report.failures[0].stage, stage);
    assert.match(report.failures[0].error, /_SENTINEL/);
  }
});

test("hook cannot alter native input, title, metadata or add output fields", async (t) => {
  const fixture = await synthetic(t);
  for (const field of ["command", "title", "metadata", "extra", "loss"]) {
    const createAfterHook = () => async (input: Json, output: Json) => {
      await mockHook()(input, output);
      if (field === "command") input.args.command = "forged";
      if (field === "title") output.title = "forged";
      if (field === "metadata") output.metadata.exit = 0;
      if (field === "extra") output.extra = true;
      if (field === "loss") output.output = "LOST";
    };
    const report = await evaluateUtilityCorpus({ root: fixture.root, filter: mockFilter, createAfterHook });
    assert.equal(report.ok, false, field);
    assert.ok(report.failures.every((row: Json) => row.stage === "hook"));
    assert.match(report.failures[0].error, /EXECUTION_FACTS_CHANGED|HOOK_GOLDEN_MISMATCH/);
  }
});

test("schema teeth: every missing list, identity, digest and inventory defect fails by name", async (t) => {
  const mutations: [string, (fixture: Awaited<ReturnType<typeof synthetic>>) => Promise<void>][] = [
    ["MISSING_FIELD", async (f) => { delete f.manifests.go!.cases[0].complete; await f.save("go"); }],
    ["UNKNOWN_FIELD", async (f) => { f.manifests.go!.cases[0].invented = true; await f.save("go"); }],
    ["INVALID_JSON", async (f) => { await writeFile(path.join(f.root, "go/manifest.json"), "{"); }],
    ["MISSING_MANIFEST", async (f) => { await rm(path.join(f.root, "go/manifest.json")); }],
    ["MISSING_SOURCES_NOTE", async (f) => { await rm(path.join(f.root, "go/SOURCES.md")); }],
    ["EMPTY_OR_INVALID_LIST", async (f) => { f.manifests.go!.tools = []; await f.save("go"); }],
    ["EMPTY_OR_INVALID_LIST", async (f) => { f.manifests.go!.cases[0].required = []; await f.save("go"); }],
    ["EMPTY_OR_INVALID_LIST", async (f) => { f.manifests.go!.cases[0].fixtureSources = []; await f.save("go"); }],
    ["INVALID_SCHEMA_OR_FAMILY", async (f) => { f.manifests.go!.schema = "future"; await f.save("go"); }],
    ["DUPLICATE_OR_INVALID_ID", async (f) => { f.manifests.go!.cases[1].id = "go-noise"; await f.save("go"); }],
    ["DUPLICATE_ARTIFACT_PATH", async (f) => { f.manifests.go!.cases[0].stdout = f.manifests.go!.cases[0].original; await f.save("go"); }],
    ["UNSAFE_PATH", async (f) => { f.manifests.go!.cases[0].original.file = "../outside.log"; await f.save("go"); }],
    ["UNSAFE_PATH", async (f) => { f.manifests.go!.cases[0].original.file = "/outside.log"; await f.save("go"); }],
    ["UNSAFE_PATH", async (f) => { f.manifests.go!.cases[0].original.file = "./noise.log"; await f.save("go"); }],
    ["INVALID_ARTIFACT_EXTENSION", async (f) => { f.manifests.go!.cases[0].capture.file = "noise.txt"; await f.save("go"); }],
    ["MISSING_ARTIFACT", async (f) => { await rm(path.join(f.root, "go/noise.log")); }],
    ["ARTIFACT_DIGEST_MISMATCH", async (f) => { f.manifests.go!.cases[0].original.sha256 = "0".repeat(64); await f.save("go"); }],
    ["ARTIFACT_DIGEST_MISMATCH", async (f) => { f.manifests.go!.cases[0].original.bytes++; await f.save("go"); }],
    ["NON_UTF8", async (f) => { await f.changeArtifact("go", f.manifests.go!.cases[0].original, Buffer.from([255])); await f.save("go"); }],
    ["MATERIAL_FLAG_MISMATCH", async (f) => { f.manifests.go!.cases[0].material = false; await f.save("go"); }],
    ["INVALID_EXPECTED_STATUS", async (f) => { f.manifests.go!.cases[0].expectedStatus = "passthrough"; await f.save("go"); }],
    ["MISSING_NOISE_OR_EXACT", async (f) => { f.manifests.go!.cases.pop(); await f.save("go"); }],
    ["ROLE_OUTPUT_MISMATCH", async (f) => { await f.changeArtifact("go", f.manifests.go!.cases[1].expected, "FORGED\n"); await f.save("go"); }],
    ["MISSING_SOURCE_ANCHOR", async (f) => { f.manifests.go!.cases[0].required[0].occurrence = 1; await f.save("go"); }],
    ["INVALID_ANCHOR", async (f) => { f.manifests.go!.cases[0].required[0].text = "\ud83e"; await f.save("go"); }],
    ["DUPLICATE_OR_UNORDERED_ANCHOR", async (f) => { const row = f.manifests.go!.cases[0]; row.required.push({ ...row.required[0] }); await f.save("go"); }],
    ["EMPTY_DIRECTORY", async (f) => { await mkdir(path.join(f.root, "go/empty")); }],
    ["UNMAPPED_ARTIFACT", async (f) => { await writeFile(path.join(f.root, "go/unmapped.json"), "{}"); }],
    ["UNMAPPED_ARTIFACT", async (f) => { await writeFile(path.join(f.root, "go/unmapped.py"), "# hidden source"); }],
    ["PRODUCER_SNAPSHOT_MISMATCH", async (f) => { await writeFile(path.join(f.root, "go/producer-source.mjs"), "forged"); }],
    ["SYMLINK", async (f) => { await symlink("noise.log", path.join(f.root, "go/alias.log")); }],
    ["FILE_ALIAS", async (f) => { await link(path.join(f.root, "go/noise.log"), path.join(f.root, "go/alias.log")); }],
  ];
  for (const [index, [code, mutate]] of mutations.entries()) await t.test(`${index}: ${code}`, async (t) => {
    const fixture = await synthetic(t);
    await mutate(fixture);
    await assert.rejects(readUtilityCorpus(fixture.root), new RegExp(code));
  });
});

test("receipt teeth: provenance, native facts, source versions and errors stay bound", async (t) => {
  const mutations: [string, (receipt: Json) => void][] = [
    ["RECEIPT_FACT_MISMATCH", (r) => { r.command = "forged"; }],
    ["INVALID_NATIVE_FACTS", (r) => { r.nativeSpawned = false; }],
    ["INCOHERENT_CAPTURE_FACTS", (r) => { r.nativeExitObserved = false; }],
    ["INVALID_SOURCE_PROVENANCE", (r) => { r.baseline = "not-a-sha"; }],
    ["INVALID_SOURCE_PROVENANCE", (r) => { r.sourceHead = false; }],
    ["CONFLICTING_SOURCE_PROVENANCE", (r) => { r.baselineSourceSHA = "2".repeat(40); }],
    ["INVALID_SOURCE_INVENTORY_DIGEST", (r) => { r.sourceInventorySHA256 = "forged"; }],
    ["MISSING_ENVIRONMENT_PROVENANCE", (r) => { delete r.environmentPolicy; }],
    ["INVALID_DURATION_PROVENANCE", (r) => { r.durationMs = -1; }],
    ["PRODUCER_MISMATCH", (r) => { r.producer = { ...r.producer, sourceSHA256: "0".repeat(64) }; }],
    ["TOOL_PROVENANCE_MISMATCH", (r) => { r.tools = [{ ...r.tools[0], version: "forged" }]; }],
    ["UNMAPPED_RECEIPT_TOOL", (r) => { r.tools = [...r.tools, { name: "hidden", version: "1", executable: "/mock/hidden" }]; }],
    ["SOURCE_MAPPING_MISMATCH", (r) => { r.fixtureSources = [{ ...r.fixtureSources[0], file: "different-version.mjs" }]; }],
    ["RECEIPT_ARTIFACT_MISMATCH", (r) => { r.fixtureSources = [{ ...r.fixtureSources[0], sha256: "0".repeat(64) }]; }],
    ["RECEIPT_ARTIFACT_MISMATCH", (r) => { r.fixtureSources = [{ ...r.fixtureSources[0], originalSource: {
      ...r.fixtureSources[0], file: "historical/fixture.mjs", sha256: "0".repeat(64),
    } }]; }],
    ["EMPTY_OR_INVALID_LIST", (r) => { r.fixtureSources = []; }],
    ["SOURCE_INVENTORY_MISMATCH", (r) => { r.fixtureSources = [...r.fixtureSources, { ...r.fixtureSources[0], file: "hidden-source.mjs" }]; }],
    ["RECEIPT_ARTIFACT_MISMATCH", (r) => { r.artifacts = { ...r.artifacts, original: { ...r.artifacts.original, bytes: 0 } }; }],
    ["CAPTURE_ERRORS", (r) => { r.launchError = "failed"; }],
    ["CAPTURE_ERRORS", (r) => { r.encodingError = "failed"; }],
    ["CAPTURE_ERRORS", (r) => { r.cleanupErrors = ["failed"]; }],
    ["CAPTURE_ERRORS", (r) => { r.errors = { preparation: "failed" }; }],
  ];
  for (const [index, [code, mutate]] of mutations.entries()) await t.test(`${index}: ${code}`, async (t) => {
    const fixture = await synthetic(t);
    mutate(fixture.receipts["go-noise"]!);
    await fixture.saveReceipt("go", "noise");
    await assert.rejects(readUtilityCorpus(fixture.root), new RegExp(code));
  });
});

test("all missing families/artifacts and empty root produce named failures, never zero-pass", async (t) => {
  for (const kind of ["families", "artifacts", "root"]) await t.test(kind, async (t) => {
    const fixture = await synthetic(t);
    if (kind === "families") await rm(path.join(fixture.root, "go"), { recursive: true });
    if (kind === "root") for (const family of Object.keys(profiles)) await rm(path.join(fixture.root, family), { recursive: true });
    if (kind === "artifacts") for (const family of Object.keys(profiles)) await rm(path.join(fixture.root, family, "noise.log"));
    const report = await evaluateUtilityCorpus({ root: fixture.root, filter: mockFilter, createAfterHook: mockHook });
    assert.equal(report.ok, false);
    assert.equal(report.checked, 0);
    assert.equal(report.expectedCases, null);
    assert.equal(report.failures[0].id, "corpus");
    assert.match(report.failures[0].error, /MISSING_FAMILY|MISSING_ARTIFACT|EMPTY_CORPUS/);
  });
});

test("sourceFile relocation binds original receipt name without historical path reads", async (t) => {
  const fixture = await synthetic(t);
  for (const item of fixture.manifests.go!.cases) {
    item.fixtureSources[0] = { ...item.fixtureSources[0], sourceFile: "original-source/fixture.mjs" };
    fixture.receipts[item.id]!.fixtureSources = [{ ...fixture.receipts[item.id]!.fixtureSources[0], file: "original-source/fixture.mjs" }];
    await fixture.saveReceipt("go", item.role);
  }
  assert.equal((await readUtilityCorpus(fixture.root)).cases.length, 8);
  fixture.manifests.go!.cases[0].fixtureSources[0].sourceFile = "wrong-source/fixture.mjs";
  await fixture.save("go");
  await assert.rejects(readUtilityCorpus(fixture.root), /SOURCE_MAPPING_MISMATCH/);
});

test("real CLI requires explicit clean build; import has no CLI side effects", () => {
  const script = new URL("../scripts/utility-evaluation.mjs", import.meta.url);
  const result = spawnSync(process.execPath, [script.pathname, "--root", "missing", "--invalid"], { encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).ok, false);
  assert.match(JSON.parse(result.stdout).failures[0].error, /CLEAN_BUILD_REQUIRED/);
  assert.equal(result.stderr, "");
});

test("repeated text needs separate ordered occurrences; UTF-16 source spans and UTF-8 bytes", async (t) => {
  const f = await synthetic(t), item = f.manifests.go!.cases[0], keep = "KEEP café 🧪\n";
  const original = "🧪 noise\n".repeat(300) + keep + keep;
  await f.changeArtifact("go", item.original, original);
  await f.changeArtifact("go", item.stdout, original);
  await f.changeArtifact("go", item.expected, keep + keep);
  item.required = [{ text: keep, occurrence: 0 }, { text: keep, occurrence: 1 }];
  await f.saveReceipt("go", "noise");
  const row = (await readUtilityCorpus(f.root)).cases[0];
  assert.deepEqual(row.required.map((anchor: Json) => anchor.sourceSpan), [
    [original.indexOf(keep), original.indexOf(keep) + keep.length], [original.lastIndexOf(keep), original.length],
  ]);
  assert.notEqual(row.original.bytes, original.length);
  await f.changeArtifact("go", item.expected, keep);
  await f.save("go");
  await assert.rejects(readUtilityCorpus(f.root), /EXPECTED_ANCHOR_LOSS/);
  item.required.reverse();
  await f.changeArtifact("go", item.expected, keep + keep);
  await f.save("go");
  await assert.rejects(readUtilityCorpus(f.root), /DUPLICATE_OR_UNORDERED_ANCHOR/);
});

test("timeout, signal and unknown exit facts map exactly; conflicting pytest facts reject", async (t) => {
  const f = await synthetic(t), item = f.manifests.pytest!.cases[1], receipt = f.receipts[item.id]!;
  Object.assign(item, { exitCode: null, timedOut: true, complete: false, signal: "SIGTERM" });
  Object.assign(receipt.facts, { exitCode: null, timedOut: true, complete: false, signal: "SIGTERM", nativeExitObserved: false });
  await f.saveReceipt("pytest", "exact");
  let row = (await readUtilityCorpus(f.root)).cases.find((row: Json) => row.id === item.id);
  assert.deepEqual(row.observation.termination, { kind: "timed_out" });
  assert.equal(row.observation.completeness, "unknown");
  item.timedOut = false; receipt.facts.timedOut = false;
  await f.saveReceipt("pytest", "exact");
  row = (await readUtilityCorpus(f.root)).cases.find((row: Json) => row.id === item.id);
  assert.deepEqual(row.observation.termination, { kind: "unknown" });
  receipt.exitCode = 0;
  await f.saveReceipt("pytest", "exact");
  await assert.rejects(readUtilityCorpus(f.root), /CONFLICTING_RECEIPT_FACTS/);
});

test("material needs BOTH 1024 saved bytes AND 10 percent; each family needs one", async (t) => {
  for (const [before, after, flag, error] of [[2000, 1000, true, "MATERIAL_FLAG_MISMATCH"],
    [20000, 18900, true, "MATERIAL_FLAG_MISMATCH"], [1000, 900, false, "MISSING_MATERIAL_CASE"]] as const) {
    const f = await synthetic(t), item = f.manifests.go!.cases[0], keep = "KEEP café 🧪\n";
    await f.changeArtifact("go", item.original, "n".repeat(before) + keep);
    await f.changeArtifact("go", item.stdout, "n".repeat(before) + keep);
    await f.changeArtifact("go", item.expected, "n".repeat(after) + keep);
    item.material = flag;
    await f.saveReceipt("go", "noise");
    await assert.rejects(readUtilityCorpus(f.root), new RegExp(error));
  }
});

test("hardlink aliases outside family fail too", async (t) => {
  const f = await synthetic(t);
  await link(path.join(f.root, "go/noise.log"), path.join(f.root, "node/outside-alias.log"));
  await assert.rejects(readUtilityCorpus(f.root), /FILE_ALIAS/);
});
