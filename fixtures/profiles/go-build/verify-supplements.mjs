// Narrow developer check: these two families only; no native commands or full suite.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readNativeCorpus } from "../../../scripts/native-corpus.mjs";
import { filter } from "../../../src/core/index.ts";

const profiles = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp("/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/go-fmt-reader-");
const families = ["go-build", "cargo-fmt"];
for (const family of families) await cp(join(profiles, family), join(temp, family), { recursive: true });
await writeFile(join(temp, "index.json"), JSON.stringify({ schema: "hugr-lean/native-index/1", families, exactFamilies: families }));
const sha = b => createHash("sha256").update(b).digest("hex");
const facts = b => ({ bytes: b.length, sha256: sha(b), readThroughEOF: true, finalLF: b.at(-1) === 10, lastBytesHex: b.subarray(-32).toString("hex") });
function artifactCheck(record, bytes) {
  assert.equal(record.bytes, bytes.length); assert.equal(record.sha256, sha(bytes));
  assert.equal(record.headerHex, bytes.subarray(0,64).toString("hex"));
  assert.equal(bytes.subarray(0,4).toString("hex"), "7f454c46");
  assert.equal(bytes[4], 2); assert.equal(bytes[5], 1); assert.equal(bytes.readUInt16LE(18), 62);
  assert.equal(record.machine, 62); assert.equal(record.executed, false);
}
async function integrity(root) {
  for (const family of families) {
    const directory = join(root, family);
    const receipt = JSON.parse(await readFile(join(directory, "supplement-receipt.json"), "utf8"));
    assert.equal(receipt.schema, "hugr-lean/native-supplement/1");
    assert.equal(receipt.cases.length, 1);
    assert.equal(receipt.recipe.sha256, sha(await readFile(join(directory, receipt.recipe.file))));
    assert.deepEqual(receipt.sourceBefore, receipt.sourceAfter);
    assert.equal(receipt.sourceBefore.length, family === "go-build" ? 2 : 5);
    for (const source of receipt.sourceBefore) {
      const { file, ...bound } = source;
      assert.deepEqual(bound, facts(await readFile(join(directory, file))));
    }
    const fact = receipt.cases[0];
    for (const stream of Object.values(fact.streams)) {
      const { file, ...bound } = stream;
      assert.deepEqual(bound, facts(await readFile(join(directory, file))));
      assert.equal(bound.bytes, 0);
    }
    assert.deepEqual(fact.boundary, facts(Buffer.alloc(0)));
    assert.deepEqual(fact.termination, { kind: "exited", code: 0 });
    if (family === "go-build") {
      assert.deepEqual(fact.command, ["go", "build", "-o", fact.artifact.path, "./..."]);
      for (const [key, value] of Object.entries({ GOOS: "linux", GOARCH: "amd64", CGO_ENABLED: "0" })) assert.equal(fact.environmentOverrides[key], value);
      artifactCheck(fact.artifact, await readFile(fact.artifact.path));
    } else {
      assert.deepEqual(fact.command, ["cargo", "fmt", "--all", "--check"]);
      assert.equal(fact.environmentOverrides.RUSTUP_TOOLCHAIN, "stable");
    }
  }
  const fmt = join(root, "cargo-fmt");
  for (const row of (await readFile(join(fmt, "sha256.txt"), "utf8")).trimEnd().split("\n")) {
    const [digest, file] = row.split("  ");
    assert.equal(sha(await readFile(join(fmt, file))), digest, file);
  }
}
await integrity(temp);
const cases = await readNativeCorpus(temp);
assert.equal(cases.length, 27);
for (const entry of cases) {
  const result = filter(entry.observation);
  assert.equal(result.status, "passthrough", entry.name);
  assert.equal(result.replacement ?? entry.observation.output, entry.expected, entry.name);
}
const receiptPath = join(temp, "go-build/supplement-receipt.json");
const original = await readFile(receiptPath);
async function receiptProbe(label, mutate, check) {
  const candidate = JSON.parse(original);
  mutate(candidate);
  try {
    await writeFile(receiptPath, JSON.stringify(candidate));
    await assert.rejects(check, undefined, label);
    console.log(`Rejected: ${label}`);
  } finally { await writeFile(receiptPath, original); }
}
await receiptProbe("EOF false", r => { r.cases[0].boundary.readThroughEOF = false; }, () => readNativeCorpus(temp));
await receiptProbe("receipt command mismatch", r => { r.cases[0].command[1] = "test"; }, () => readNativeCorpus(temp));
await receiptProbe("LF forged", r => { r.cases[0].boundary.finalLF = true; }, () => readNativeCorpus(temp));
await receiptProbe("tail forged", r => { r.cases[0].boundary.lastBytesHex = "0a"; }, () => readNativeCorpus(temp));
await receiptProbe("source hash forged", r => { r.sourceBefore[0].sha256 = "0".repeat(64); }, () => integrity(temp));
const sourcePath = join(temp, "cargo-fmt/supplement-project/beta/src/lib.rs");
const source = await readFile(sourcePath);
try {
  await writeFile(sourcePath, Buffer.concat([source, Buffer.from(" ")]));
  await assert.rejects(() => integrity(temp));
  console.log("Rejected: source bytes changed");
} finally { await writeFile(sourcePath, source); }
const outputPath = join(temp, "go-build/captures/cross-linux-amd64-success.output");
try {
  await writeFile(outputPath, "\n");
  await assert.rejects(() => readNativeCorpus(temp));
  console.log("Rejected: empty EOF artifact changed");
} finally { await writeFile(outputPath, ""); }
const artifact = JSON.parse(original).cases[0].artifact;
const binary = await readFile(artifact.path), corrupted = Buffer.from(binary);
corrupted[0] ^= 1;
assert.throws(() => artifactCheck(artifact, corrupted));
console.log("Rejected: ELF artifact bytes corrupted (memory only)");
await integrity(temp);
assert.equal((await readNativeCorpus(temp)).length, 27);
console.log("27 narrow reader/public-filter exact cases; eight controls rejected; originals restored. Private ELF read, never executed.");
