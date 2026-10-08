import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
// Script is intentionally outside runtime TypeScript modules.
// @ts-expect-error No declaration is shipped for developer-only scripts.
import { readUtilityCorpus } from "../scripts/utility-evaluation.mjs";

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
