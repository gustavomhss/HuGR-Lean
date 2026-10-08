import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
// @ts-expect-error Developer-only normalization script.
import { normalizeUtilityCorpus } from "../scripts/utility-normalize.mjs";
// @ts-expect-error Developer-only reader script.
import { readUtilityCorpus } from "../scripts/utility-corpus.mjs";

type Json = Record<string, any>;
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
let fixture: Promise<Json> | undefined;
const candidate = (): Promise<Json> => fixture ??= normalizeUtilityCorpus();
// Actual existing capture bytes, never native producer execution. Only fresh private candidate is mutable.
async function editJson(file: string, mutate: (value: Json) => void, check: () => Promise<void>) {
  const before = await readFile(file), value = JSON.parse(before.toString("utf8"));
  try { mutate(value); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`); await check(); }
  finally { await writeFile(file, before); assert.equal(hash(await readFile(file)), hash(before), `EXACT_RESTORE: ${file}`); }
}
async function manifest(family: string) {
  const result = await candidate(), file = path.join(result.corpusRoot, family, "manifest.json");
  return { result, file, data: JSON.parse(await readFile(file, "utf8")) as Json };
}
async function forgeVersion(family: string, mutate: (value: Json) => void, expected: RegExp) {
  const { result, file, data } = await manifest(family), root = data.provenance.find((entry: Json) => entry.versionCaptures.length > 0);
  const version = root.versionCaptures[0], receiptFile = path.join(result.corpusRoot, family, version.capture.file);
  await editJson(receiptFile, mutate, async () => {
    const bytes = await readFile(receiptFile);
    await editJson(file, (meta) => {
      const target = meta.provenance.find((entry: Json) => entry.id === root.id).versionCaptures[0].capture;
      target.bytes = bytes.length; target.sha256 = hash(bytes);
    }, async () => { await assert.rejects(readUtilityCorpus(result.corpusRoot), expected); });
  });
}

test("actual native reader validates 25 cases and preserves unchanged raw/expected bytes", async () => {
  const result = await candidate(), corpus = await readUtilityCorpus(result.corpusRoot);
  assert.equal(corpus.cases.length, 25);
  assert.deepEqual(corpus.families.map((family: Json) => [family.family, family.cases.length]), [["go", 5], ["pytest", 6], ["node", 10], ["cargo", 4]]);
  const worktrees = path.resolve(result.directory, "../../..");
  for (const family of corpus.families) {
    const actor = path.join(worktrees, `hugr-lean-utility-${family.family}-parser/fixtures/utility/${family.family}`);
    const originalManifest = JSON.parse(await readFile(path.join(actor, "manifest.json"), "utf8"));
    for (const row of family.cases) for (const key of ["capture", "original", "stdout", "stderr", "expected"]) {
      const original = originalManifest.cases.find((item: Json) => item.id === row.id)[key];
      assert.ok((await readFile(path.join(result.corpusRoot, family.family, row[key].file))).equals(await readFile(path.join(actor, original.file))), `${family.family}/${row.id}/${key}`);
    }
  }
});

test("string receipt pointer binds original sourceFile for native case and version", async () => {
  const { result, file } = await manifest("pytest");
  await editJson(file, (meta) => { meta.cases[0].capture.sourceFile = "wrong/original/receipt.json"; }, async () => {
    await assert.rejects(readUtilityCorpus(result.corpusRoot), /INDEX_RECEIPT_PATH_MISMATCH: pytest\/default: capture/);
  });
  await editJson(file, (meta) => { meta.provenance[0].versionCaptures[0].capture.sourceFile = "wrong/version/receipt.json"; }, async () => {
    await assert.rejects(readUtilityCorpus(result.corpusRoot), /INDEX_RECEIPT_PATH_MISMATCH.*versions/);
  });
});

test("native nested version rejects forged top exit 101 beside nested exit 0", async () => {
  await forgeVersion("pytest", (receipt) => { receipt.exitCode = 101; }, /CONFLICTING_RECEIPT_FACTS: pytest\/.*\/version\/versions: exitCode/);
});

test("native version rejects top launchError even when nested launchError stays null", async () => {
  await forgeVersion("pytest", (receipt) => { receipt.launchError = "ORIGINAL_VERSION_LAUNCH_FAILURE"; }, /CONFLICTING_RECEIPT_FACTS: pytest\/.*\/version\/versions: launchError/);
});

test("native version rejects conflicting producer aliases and source inventory digest", async () => {
  await forgeVersion("pytest", (receipt) => { receipt.producer.file = "scripts/forged.mjs"; }, /CONFLICTING_PRODUCER_ALIAS/);
  await forgeVersion("pytest", (receipt) => { receipt.sourceInventorySHA256 = "0".repeat(64); }, /UNBOUND_SOURCE_INVENTORY/);
});

test("four Cargo native case receipts explicitly map original captures/id/receipt.json", async () => {
  const { result, file, data } = await manifest("cargo");
  for (const row of data.cases) assert.equal(row.capture.sourceFile, `captures/${row.id}/receipt.json`);
  await editJson(file, (meta) => { delete meta.cases[0].capture.sourceFile; }, async () => {
    await assert.rejects(readUtilityCorpus(result.corpusRoot), /INDEX_RECEIPT_PATH_MISMATCH: cargo\/full/);
  });
});
