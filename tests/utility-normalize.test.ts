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

async function forgeLineage(mutate: (value: Json) => void, expected: RegExp) {
  const { result, file, data } = await manifest("cargo"), lineageFile = path.join(result.corpusRoot, "cargo", data.cargoEvidence.lineage.file);
  await editJson(lineageFile, mutate, async () => {
    const bytes = await readFile(lineageFile);
    await editJson(file, (meta) => { meta.cargoEvidence.lineage.bytes = bytes.length; meta.cargoEvidence.lineage.sha256 = hash(bytes); }, async () => {
      await assert.rejects(readUtilityCorpus(result.corpusRoot), expected);
    });
  });
}

test("Cargo ancillary files and both after snapshots retained with independent hashes and labels", async () => {
  const { result, data } = await manifest("cargo"), corpus = await readUtilityCorpus(result.corpusRoot);
  const evidence = corpus.families.find((family: Json) => family.family === "cargo").cargoEvidence;
  assert.equal(evidence.lineage.file, "provenance/lineage.json");
  assert.equal(evidence.inspection.file, "full/inspection-receipt.json");
  assert.equal(evidence.collectorError, "NATIVE_MINUTE_DURATION_MISSING");
  const before = evidence.sourceRecords.find((record: Json) => record.case === "full");
  assert.equal(before.origin, "reconstructed-producer-literal"); assert.equal(before.recordedBeforeSatisfied, false);
  assert.deepEqual(evidence.afterSources.map((record: Json) => record.artifact.file), ["sources/failure-after/Cargo.lock", "sources/warning-after/Cargo.lock"]);
  const actor = path.resolve(result.directory, "../../../hugr-lean-utility-cargo-parser/fixtures/utility/cargo");
  for (const ref of [data.cargoEvidence.lineage, data.cargoEvidence.inspection, ...data.cargoEvidence.afterSources.map((record: Json) => record.artifact)]) {
    assert.ok((await readFile(path.join(result.corpusRoot, "cargo", ref.file))).equals(await readFile(path.join(actor, ref.file))), ref.file);
  }
});

test("Cargo omissions cannot pass by deleting declarations or after-snapshot entries", async () => {
  const { result, file } = await manifest("cargo");
  for (const missing of ["all", "inspection", "lineage", "afterSources", "afterEntry"]) {
    await editJson(file, (meta) => {
      if (missing === "all") delete meta.cargoEvidence;
      else if (missing === "afterEntry") meta.cargoEvidence.afterSources.pop();
      else delete meta.cargoEvidence[missing];
    }, async () => { await assert.rejects(readUtilityCorpus(result.corpusRoot), /MISSING_CARGO_EVIDENCE|MISSING_FIELD|MISSING_CARGO_AFTER_SNAPSHOT/); });
  }
});

test("recovered full lock cannot be relabeled recorded-before or satisfied", async () => {
  await forgeLineage((lineage) => { lineage.sourceRecords[0].recordedBeforeSatisfied = true; }, /CARGO_SOURCE_LABEL_MISMATCH/);
  await forgeLineage((lineage) => { lineage.sourceRecords[0].origin = "recorded-before"; }, /CARGO_SOURCE_LABEL_MISMATCH/);
});

test("after snapshot phase and digest remain bound to actual receipt after inventory", async () => {
  const { result, file } = await manifest("cargo");
  await editJson(file, (meta) => { meta.cargoEvidence.afterSources[0].phase = "before"; }, async () => {
    await assert.rejects(readUtilityCorpus(result.corpusRoot), /CARGO_AFTER_SNAPSHOT_LABEL_MISMATCH/);
  });
  await editJson(file, (meta) => { meta.cargoEvidence.afterSources[0].artifact.sha256 = "0".repeat(64); }, async () => {
    await assert.rejects(readUtilityCorpus(result.corpusRoot), /ARTIFACT_DIGEST_MISMATCH.*cargo: evidence/);
  });
});

test("self-consistent inspection rewrite still rejects independent immutable prior-index pin", async () => {
  const { result, file, data } = await manifest("cargo"), evidence = data.cargoEvidence;
  const inspectionFile = path.join(result.corpusRoot, "cargo", evidence.inspection.file), lineageFile = path.join(result.corpusRoot, "cargo", evidence.lineage.file);
  await editJson(inspectionFile, (inspection) => { inspection.nativeExitCode = 101; }, async () => {
    const bytes = await readFile(inspectionFile);
    await editJson(lineageFile, (lineage) => { lineage.inspection.bytes = bytes.length; lineage.inspection.sha256 = hash(bytes); }, async () => {
      const lineageBytes = await readFile(lineageFile);
      await editJson(file, (meta) => {
        meta.cargoEvidence.inspection.bytes = bytes.length; meta.cargoEvidence.inspection.sha256 = hash(bytes);
        meta.cargoEvidence.lineage.bytes = lineageBytes.length; meta.cargoEvidence.lineage.sha256 = hash(lineageBytes);
      }, async () => { await assert.rejects(readUtilityCorpus(result.corpusRoot), /RECEIPT_ARTIFACT_MISMATCH: cargo: evidence/); });
    });
  });
});
