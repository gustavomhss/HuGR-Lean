import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
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
  const root = await mkdtemp(path.join(await import("node:fs/promises").then((fs) => fs.realpath(os.tmpdir())), "hugr-eval-"));
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
  return { root, manifests, receipts, save };
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
