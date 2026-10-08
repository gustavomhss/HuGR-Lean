import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdtemp, cp, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";
// @ts-expect-error Developer-only reader script.
import { readUtilityCorpus, readArtifactInventory } from "../scripts/utility-corpus.mjs";

type Json = Record<string, any>;
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
let fixture: Promise<Json> | undefined;
let temporaryDirectory: string | undefined;
const candidate = (): Promise<Json> => fixture ??= (async () => {
  // CI always uses committed fixtures. Explicit override supports local review before lead imports them.
  const referenceRoot = path.resolve(process.env.HUGR_UTILITY_CORPUS_ROOT ?? fileURLToPath(new URL("../fixtures/utility/", import.meta.url)));
  try { assert.ok((await stat(referenceRoot)).isDirectory(), "NOT_CORPUS_DIRECTORY"); }
  catch (cause) { throw new Error(`MISSING_COMMITTED_UTILITY_CORPUS: ${referenceRoot}`, { cause }); }
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "hugr-native-corpus-test-"));
  const corpusRoot = path.join(temporaryDirectory, "corpus");
  await cp(referenceRoot, corpusRoot, { recursive: true, force: false, errorOnExist: true });
  return { directory: temporaryDirectory, corpusRoot, referenceRoot };
})();
test.after(async () => { if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true }); });
// Committed native capture bytes, no private collector paths or normalizer execution in default tests.
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
  for (const family of corpus.families) {
    const actor = path.join(result.referenceRoot, family.family);
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
  const actor = path.join(result.referenceRoot, "cargo");
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

test("runtime fingerprint is collector metadata; corpus below 10MB contains no Node executable", async () => {
  const { result, data } = await manifest("node"), root = data.provenance[0], corpus = await readUtilityCorpus(result.corpusRoot);
  assert.equal(root.index.sha256, "e0a80d439c84c66448807d499d598e81615e3c3245c49b69cfe6aae16de8c9ea");
  assert.equal(root.externalRuntimes.length, 1);
  assert.deepEqual(root.externalRuntimes[0], { file: "native-node-executable", sha256: "7ede1e8c98a2b2bb5965aff3c070ede061fc9e2a6a0b16774646487f94fe4541",
    bytes: 224341744, kind: "tool-executable", tool: "node", version: "v22.17.1", executable: "/usr/local/bin/node" });
  assert.match(corpus.families.find((family: Json) => family.family === "node").provenance[0].externalRuntimeScope, /no local binary or supply-chain integrity revalidation/);
  const files = await readArtifactInventory(result.corpusRoot), total = [...files.values()].reduce((sum: number, bytes: Buffer) => sum + bytes.length, 0);
  assert.ok(total < 10 * 1024 * 1024);
  assert.ok([...files.keys()].every((file: string) => !file.endsWith("/native-node-executable")));
});

test("external runtime cannot exempt fixture, producer, helper or captured artifact bytes", async () => {
  const { result, file, data } = await manifest("node"), root = data.provenance[0], item = data.cases[0];
  const originals = [item.fixtureSources[0], root.producerSources[0], root.producerSources.find((ref: Json) => ref.sourceFile === "scripts/opencode-boundary.mjs"), item.original];
  for (const ref of originals) await editJson(file, (meta) => {
    meta.provenance[0].externalRuntimes.push({ file: ref.sourceFile ?? ref.file, sha256: ref.sha256, bytes: ref.bytes,
      kind: "tool-executable", tool: "node", version: "v22.17.1", executable: "/usr/local/bin/node" });
  }, async () => { await assert.rejects(readUtilityCorpus(result.corpusRoot), /EXTERNAL_RUNTIME_NOT_ALLOWED/); });
});

test("wrong valid runtime hash, size, path, kind, tool, version and executable reject", async () => {
  const { result, file } = await manifest("node");
  for (const [key, value] of Object.entries({ sha256: "0".repeat(64), bytes: 1, file: "../native-node-executable", kind: "helper",
    tool: "tsx", version: "v23.0.0", executable: "/missing/not-publisher-node" })) {
    await editJson(file, (meta) => { meta.provenance[0].externalRuntimes[0][key] = value; }, async () => {
      await assert.rejects(readUtilityCorpus(result.corpusRoot), /EXTERNAL_RUNTIME_NOT_ALLOWED|EXTERNAL_RUNTIME_FINGERPRINT_MISMATCH/);
    });
  }
});

test("omitted runtime declaration cannot leave source inventory record unchecked", async () => {
  const { result, file } = await manifest("node");
  await editJson(file, (meta) => { delete meta.provenance[0].externalRuntimes; }, async () => {
    await assert.rejects(readUtilityCorpus(result.corpusRoot), /UNBOUND_SOURCE_RECORD: .*native-node-executable/);
  });
});
