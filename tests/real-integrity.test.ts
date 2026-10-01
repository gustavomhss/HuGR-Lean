import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
const { checkCatalog, verifiedCapture } = await import(new URL("../scripts/real-world/integrity.mjs", import.meta.url).href);
const { archiveCapture, sha256 } = await import(new URL("../scripts/real-world/capture.mjs", import.meta.url).href);
const { runRealBenchmark } = await import(new URL("../scripts/real-world/run.mjs", import.meta.url).href);

test("catalog rejects empty, duplicate, missing, changed command/project identities", () => {
  const one = { id: "one", project: "project", category: "primary", command: "tool", expectExit: "zero", oracle: "exact" };
  const two = { ...one, id: "two" }, rows = [one, two];
  checkCatalog(rows, rows, rows);
  for (const changed of [[], [one, one], [one], [one, { ...two, command: "different" }], [one, { ...two, project: "other" }]]) {
    assert.throws(() => checkCatalog(rows, changed, rows)); assert.throws(() => checkCatalog(rows, rows, changed));
  }
});

test("verified capture binds all digests, exact output, native facts and duration", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-integrity-"));
  try {
    const directory = path.join(root, "cases", "one"), raw = Buffer.from("native café\n");
    const capture = { output: raw.toString(), raw, stdout: raw, stderr: Buffer.alloc(0), command: "tool", exitCode: 0, signal: null, complete: true, timedOut: false, durationMs: 17 };
    const artifacts = await archiveCapture(directory, capture, capture.output);
    await writeFile(path.join(directory, "capture.json"), JSON.stringify(capture));
    const row = { id: "one", artifacts, command: "tool", observedExit: 0, signal: null, complete: true, timedOut: false, captureMs: 17, decision: "passthrough" };
    assert.deepEqual((await verifiedCapture(root, row)).capture.raw, raw);
    for (const change of [{ observedExit: 7 }, { captureMs: 18 }, { command: "other" }, { complete: false }]) await assert.rejects(verifiedCapture(root, { ...row, ...change }));
    const changed = Buffer.from("corrupted\n"); await writeFile(path.join(directory, "filtered.txt.gz"), gzipSync(changed));
    await assert.rejects(verifiedCapture(root, row), /MISMATCH/);
    const forged = structuredClone(row); forged.artifacts.filtered.bytes = changed.length; forged.artifacts.filtered.sha256 = sha256(changed);
    await assert.rejects(verifiedCapture(root, forged), /EXACT_FILTERED_BYTES_CHANGED/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("interrupted directories cannot be resumed or have prior failure files overwritten", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "lean-no-resume-"));
  try {
    const file = path.join(directory, "report.json"), bytes = "original failed attempt\n";
    await writeFile(file, bytes);
    await assert.rejects(runRealBenchmark({ outputDir: directory }), /OUTPUT_NOT_EMPTY/);
    assert.equal(await readFile(file, "utf8"), bytes);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("matching artifact hashes cannot admit malformed original or filtered UTF-8", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-integrity-encoding-"));
  try {
    const directory = path.join(root, "cases", "one"), raw = Buffer.from("native café 🔥\n");
    const capture = { output: raw.toString(), raw, stdout: raw, stderr: Buffer.alloc(0), command: "tool", exitCode: 0, signal: null, complete: true, timedOut: false, durationMs: 17 };
    const artifacts = await archiveCapture(directory, capture, capture.output);
    await writeFile(path.join(directory, "capture.json"), JSON.stringify(capture));
    const row = { id: "one", artifacts, command: "tool", observedExit: 0, signal: null, complete: true, timedOut: false, captureMs: 17, decision: "reduced" };
    assert.deepEqual((await verifiedCapture(root, row)).filtered, raw);
    for (const name of ["original", "filtered"]) {
      const changed = Buffer.from([0xc3, 0x28]), forged = structuredClone(row);
      forged.artifacts[name].bytes = changed.length; forged.artifacts[name].sha256 = sha256(changed);
      await t.test(name, async () => {
        await writeFile(path.join(directory, `${name}.txt.gz`), gzipSync(changed));
        if (name === "original") await writeFile(path.join(directory, "capture.json"), JSON.stringify({ ...capture, output: changed.toString("utf8") }));
        await assert.rejects(verifiedCapture(root, forged), new RegExp(`${name} UTF8_ROUNDTRIP_MISMATCH`));
      });
      await writeFile(path.join(directory, `${name}.txt.gz`), gzipSync(raw));
      await writeFile(path.join(directory, "capture.json"), JSON.stringify(capture));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
