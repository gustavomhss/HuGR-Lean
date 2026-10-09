/** Fixture-local checks against current lead-owned reader/filter, no shared changes. */
import assert from "node:assert/strict";
import { mkdtemp, cp, writeFile, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import { readNativeCorpus } from "../../../scripts/native-corpus.mjs";
import { filter } from "../../../src/core/index.ts";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = await mkdtemp("/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/p03-controls-");
try {
  const local = path.join(root, "yarn-install");
  await cp(directory, local, { recursive: true });
  await writeFile(path.join(root, "index.json"), JSON.stringify({ schema: "hugr-lean/native-index/1", families: ["yarn-install"], exactFamilies: ["yarn-install"] }));
  const rows = await readNativeCorpus(root);
  const supplement = rows.filter(row => row.name.startsWith("native/P03/supplement-"));
  assert.equal(supplement.length, 4);
  for (const row of supplement) {
    const result = filter(row.observation);
    assert.equal(result.status, "passthrough");
    assert.equal(result.replacement ?? row.observation.output, row.observation.output);
    assert.equal(result.inputBytes, Buffer.byteLength(row.observation.output));
    assert.equal(result.outputBytes, result.inputBytes);
  }
  const manifest = path.join(local, "cases.json");
  const saved = await readFile(manifest, "utf8");
  const data = JSON.parse(saved);
  const probe = data.cases.find(row => row.name === "P03/supplement-classic-dependency-deprecation");
  assert.ok(probe);
  const rawPath = path.join(local, probe.file);
  const raw = await readFile(rawPath);
  await writeFile(rawPath, Buffer.concat([raw, Buffer.from("corrupt") ]));
  await assert.rejects(readNativeCorpus(root), /receipt bytes mismatch|receipt hash mismatch|capture hash mismatch/);
  await writeFile(rawPath, raw);
  const receiptPath = path.join(local, "supplement-receipts.json");
  const savedReceipt = await readFile(receiptPath, "utf8");
  const receipt = JSON.parse(savedReceipt);
  const hash = raw => createHash("sha256").update(raw).digest("hex");
  for (const artifact of [...receipt.artifacts, ...receipt.metadata, ...receipt.executions]) {
    assert.equal(hash(await readFile(path.join(local, artifact.file))), artifact.sha256);
  }
  assert.equal(hash(await readFile(path.join(local, "supplement.py"))), receipt.producerSha256);
  const warning = receipt.metadata.find(item => item.name === "inflight").deprecated;
  assert.ok(warning.length > 0);
  assert.ok(supplement.find(row => row.name.endsWith("classic-dependency-deprecation")).observation.output.includes(warning));
  assert.equal(supplement.find(row => row.name.endsWith("berry-dependency-deprecation")).observation.output.includes(warning), false);
  receipt.cases[0].boundary.readThroughEOF = false;
  await writeFile(receiptPath, JSON.stringify(receipt));
  await assert.rejects(readNativeCorpus(root), /receipt EOF not complete/);
  await writeFile(receiptPath, savedReceipt);
  data.cases.push(structuredClone(probe));
  await writeFile(manifest, JSON.stringify(data));
  await assert.rejects(readNativeCorpus(root), /duplicate\/missing case name/);
  await writeFile(manifest, saved);
  await writeFile(path.join(local, "undeclared.txt"), "probe\n");
  await assert.rejects(readNativeCorpus(root), /undeclared native input/);
  await rm(path.join(local, "undeclared.txt"));
  assert.equal((await readNativeCorpus(root)).length, rows.length);
  console.log("P03 supplement: exact filter retention; raw corruption, EOF, duplicate ID, undeclared .txt controls rejected; restored reader passed.");
} finally {
  await rm(root, { recursive: true, force: true });
}
