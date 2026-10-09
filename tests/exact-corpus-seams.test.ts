import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assertCorpusCoverage, readNativeCorpus } from "../scripts/native-corpus.mjs";
import type { NativeCorpusCase } from "../scripts/native-corpus.mjs";
import { profiles } from "../src/profiles/index.js";

const benchmark = await import(new URL("../scripts/benchmark.mjs", import.meta.url).href);
const smoke = await import(new URL("../scripts/package-smoke.mjs", import.meta.url).href);
const root = benchmark.ROOT as string;
const runtime = { id: "runtime", match: () => true, reduce: () => undefined };
const row = (family: string, scope?: "exact-corpus"): NativeCorpusCase => ({ name: family, family, status: "passthrough",
  expected: "raw café\n", provenance: "synthetic", observation: benchmark.observation("raw café\n", family),
  ...(scope ? { scope } : {}) });

// Execute exactly the function embedded in the isolated inspector after a JSON boundary.
const embedded = smoke.INSPECT.slice(smoke.INSPECT.indexOf("const assertCoverage = ") + "const assertCoverage = ".length,
  smoke.INSPECT.indexOf(";\nconst profileIds ="));
const installedCoverage = new Function("assert", `return (${embedded});`)(assert) as typeof assertCorpusCoverage;

test("exact seams accept declared real corpus and expose old guard counterexample", async () => {
  const cases = await readNativeCorpus(path.join(root, "fixtures/profiles"));
  assert.deepEqual(cases.exactFamilies, ["cargo-doc", "mypy", "shellcheck"]);
  // Legacy witnesses supply runtime families not promoted into native delta directories yet.
  const all = Object.assign([...cases, ...profiles.filter(profile => !cases.some(entry => entry.family === profile.id)).map(profile => row(profile.id))],
    { exactFamilies: cases.exactFamilies });
  assert.deepEqual(benchmark.assertCoverage(profiles, all), profiles.map(profile => profile.id));
  const evidence = JSON.parse(JSON.stringify({ cases: all, exactFamilies: all.exactFamilies }));
  assert.deepEqual(installedCoverage(profiles, evidence.cases, evidence.exactFamilies, "Installed"), profiles.map(profile => profile.id));
  assert.notDeepEqual([...new Set(all.map(entry => entry.family))].sort(), profiles.map(profile => profile.id).sort(), "Old equality guard must reject legitimate exact families");
  for (const family of cases.exactFamilies) assert.ok(cases.some(entry => entry.family === family && entry.scope === "exact-corpus"));
});

test("exact seams shared benchmark and serialized installed guards reject each defect", () => {
  for (const guard of [assertCorpusCoverage, installedCoverage]) {
    const clean = [row("runtime"), row("exact", "exact-corpus")];
    assert.deepEqual(guard([runtime], clean, ["exact"]), ["runtime"]);
    const defects: [typeof clean, string[], RegExp][] = [
      [clean, [], /undeclared exact family/],
      [[...clean, row("extra")], ["exact"], /profile\/corpus coverage differs/],
      [[row("exact", "exact-corpus")], ["exact"], /profile\/corpus coverage differs/],
      [[row("runtime"), { ...row("exact", "exact-corpus"), status: "reduced" }], ["exact"], /exact case must passthrough/],
      [[row("runtime"), { ...row("exact", "exact-corpus"), expected: "changed" }], ["exact"], /exact golden changed original/],
      [clean, ["exact", "stale"], /stale exact family exception/],
      [clean, ["exact", "exact"], /Duplicate exact family exception/],
      [[row("runtime", "exact-corpus")], ["runtime"], /masks registered profile/],
      [[row("runtime"), row("exact")], ["exact"], /missing exact scope/],
      [[...clean, clean[0]!], ["exact"], /Duplicate fixture case names/],
      [[], [], /Workload corpus is empty/],
    ];
    for (const [cases, ledger, error] of defects) assert.throws(() => guard([runtime], JSON.parse(JSON.stringify(cases)), ledger), error);
    assert.throws(() => guard([], clean, ["exact"]), /registry is missing or empty/);
    assert.throws(() => guard([runtime, runtime], clean, ["exact"]), /Duplicate default profile IDs/);
  }
});

async function tiny(action: (directory: string, index: any, manifest: any) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "hugr-exact-seam-"));
  try {
    await mkdir(path.join(directory, "exact"));
    const output = "raw café\n";
    const index = { schema: "hugr-lean/native-index/1", families: ["exact"], exactFamilies: ["exact"] };
    const manifest = { schema: "hugr-lean/native-cases/1", cases: [{ name: "exact-case", family: "exact", version: "1", platform: "test",
      provenance: { kind: "synthetic-test", sha256: createHash("sha256").update(output).digest("hex") },
      status: "passthrough", output, command: "exact", termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" }] };
    await writeFile(path.join(directory, "index.json"), JSON.stringify(index));
    await writeFile(path.join(directory, "exact/cases.json"), JSON.stringify(manifest));
    await action(directory, index, manifest);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test("exact seams tiny reader validates ledger subset uniqueness identity and disposition", async () => {
  await tiny(async (directory, index, manifest) => {
    const clean = await readNativeCorpus(directory);
    assert.equal(clean[0]?.scope, "exact-corpus");
    for (const [edit, error] of [
      [() => { index.exactFamilies = ["stale"]; }, /Invalid\/stale exact family ledger/],
      [() => { index.exactFamilies = ["exact", "exact"]; }, /Duplicate exact family exception/],
      [() => { index.families = []; }, /Empty\/invalid native family index/],
      [() => { index.families = ["exact", "exact"]; }, /Duplicate native family declaration/],
    ] as const) {
      edit(); await writeFile(path.join(directory, "index.json"), JSON.stringify(index));
      await assert.rejects(readNativeCorpus(directory), error);
      index.families = ["exact"]; index.exactFamilies = ["exact"];
    }
    await writeFile(path.join(directory, "index.json"), JSON.stringify(index));
    const original = structuredClone(manifest.cases);
    for (const [edit, error] of [
      [() => { manifest.cases[0].family = "runtime"; }, /exact family identity differs/],
      [() => { manifest.cases[0].status = "reduced"; }, /exact case must passthrough/],
      [() => { manifest.cases[0].expected = "changed"; }, /passthrough golden changed original/],
      [() => { manifest.cases = []; }, /empty case list/],
      [() => { manifest.cases.push(manifest.cases[0]); }, /duplicate\/missing case name/],
    ] as const) {
      edit(); await writeFile(path.join(directory, "exact/cases.json"), JSON.stringify(manifest));
      await assert.rejects(readNativeCorpus(directory), error); manifest.cases = structuredClone(original);
    }
  });
});
test("native receipt EOF LF and byte-tail facts reject false declarations", async () => {
  await tiny(async (directory, _index, manifest) => {
    const entry = manifest.cases[0], raw = Buffer.from(entry.output, "utf8");
    entry.provenance = { receipt: "receipt.json", case: "bound", sha256: entry.provenance.sha256 };
    const boundary = { bytes: raw.length, sha256: entry.provenance.sha256, readThroughEOF: true,
      finalLF: true, lastBytesHex: raw.toString("hex") };
    const receipt = { cases: [{ name: "bound", command: entry.command, termination: entry.termination,
      completeness: entry.completeness, presentation: entry.presentation, version: entry.version, boundary }] };
    const commitReceipt = async () => writeFile(path.join(directory, "exact/receipt.json"), JSON.stringify(receipt));
    await writeFile(path.join(directory, "exact/cases.json"), JSON.stringify(manifest));
    await commitReceipt();
    assert.equal((await readNativeCorpus(directory)).length, 1);
    for (const [key, bad, error] of [
      ["readThroughEOF", false, /receipt EOF not complete/],
      ["finalLF", false, /receipt final LF mismatch/],
      ["finalLF", "true", /invalid receipt final LF/],
      ["lastBytesHex", "00", /receipt tail mismatch/],
      ["lastBytesHex", "", /invalid receipt tail/],
      ["lastBytesHex", "a", /invalid receipt tail/],
    ] as const) {
      const prior = (boundary as Record<string, unknown>)[key];
      (boundary as Record<string, unknown>)[key] = bad;
      await commitReceipt();
      await assert.rejects(readNativeCorpus(directory), error);
      (boundary as Record<string, unknown>)[key] = prior;
    }
    await commitReceipt();
    assert.equal((await readNativeCorpus(directory)).length, 1);
  });
});

test("exact seams deleting real ledger cannot silently ignore native extra families", async () => {
  const cases = await readNativeCorpus(path.join(root, "fixtures/profiles"));
  const omitted = Object.assign([...cases], { exactFamilies: cases.exactFamilies.filter(family => family !== "mypy") });
  assert.throws(() => benchmark.assertCoverage(profiles, omitted), /mypy: undeclared exact family/);
  await tiny(async (directory, index) => {
    delete index.exactFamilies;
    await writeFile(path.join(directory, "index.json"), JSON.stringify(index));
    const unmarked = await readNativeCorpus(directory);
    assert.equal(unmarked[0]?.scope, undefined);
    assert.throws(() => benchmark.assertCoverage([runtime], unmarked), /profile\/corpus coverage differs/);
  });
});

test("exact Vitest installed goldens retain correspondence and reject changed passthrough bytes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "hugr-vitest-golden-"));
  try {
    await cp(path.join(root, "fixtures"), path.join(directory, "fixtures"), { recursive: true });
    const file = path.join(directory, "fixtures/installed-goldens.json");
    const goldens = JSON.parse(await readFile(file, "utf8"));
    // PR117 owns actual golden changes; simulate its exact bytes only in this temporary tree.
    for (const name of ["formats/vitest_all_passed.txt", "formats/vitest_native.txt"]) {
      goldens.outputs[name] = await readFile(path.join(directory, "fixtures", name), "utf8");
    }
    await writeFile(file, JSON.stringify(goldens));
    const cases = await benchmark.readCorpus(directory);
    for (const entry of cases.filter((entry: any) => entry.family === "vitest")) {
      assert.equal(entry.status, "passthrough"); assert.equal(entry.expected, entry.observation.output);
      assert.equal(benchmark.checkResult(entry, { status: "passthrough", inputBytes: Buffer.byteLength(entry.expected), outputBytes: Buffer.byteLength(entry.expected) }), entry.expected);
    }
    const original = structuredClone(goldens.outputs);
    for (const defect of ["missing", "stale", "changed"]) {
      goldens.outputs = structuredClone(original);
      if (defect === "missing") delete goldens.outputs["formats/vitest_native.txt"];
      else if (defect === "stale") goldens.outputs["stale.txt"] = "stale";
      else goldens.outputs["formats/vitest_native.txt"] = "changed";
      await writeFile(file, JSON.stringify(goldens));
      await assert.rejects(benchmark.readCorpus(directory), defect === "changed" ? /passthrough installed golden changed original/ : /Installed golden\/fixture coverage differs/);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
