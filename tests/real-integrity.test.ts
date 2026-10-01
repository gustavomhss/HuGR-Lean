import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
const { checkCatalog, verifiedCapture } = await import(new URL("../scripts/real-world/integrity.mjs", import.meta.url).href);
const { archiveCapture, sha256 } = await import(new URL("../scripts/real-world/capture.mjs", import.meta.url).href);
const { runRealBenchmark } = await import(new URL("../scripts/real-world/run.mjs", import.meta.url).href);

const metrics = (original: Buffer, filtered = original) => {
  const savedBytes = original.length - filtered.length;
  return { inputBytes: original.length, outputBytes: filtered.length, savedBytes,
    reductionPercent: original.length ? savedBytes / original.length * 100 : 0,
    material: savedBytes >= 1024 && savedBytes >= original.length * 0.1,
    linesBefore: original.toString().split("\n").length, linesAfter: filtered.toString().split("\n").length };
};
const timing = { wallMs: { p50: 1, p95: 2, mean: 1.5 }, cpuMs: { p50: 0, p95: 0, mean: 0 }, warmups: 20, samples: 100 };
const result = <Artifacts>(raw: Buffer, artifacts: Artifacts) => ({ id: "one", project: "project", category: "primary", oracle: "exact", expectExit: "zero",
  artifacts, command: "tool", observedExit: 0, signal: null, complete: true, timedOut: false, captureMs: 17,
  decision: "passthrough", reason: "unknown_command", profile: null, evidence: { ok: true, violations: [], signals: [] },
  core: timing, adapterRawOff: timing, cache: null, modifications: [], ...metrics(raw) });

test("catalog rejects empty, duplicate, missing, changed command/project identities", () => {
  const one = { id: "one", project: "project", category: "primary", command: "tool", expectExit: "zero", oracle: "exact" };
  const two = { ...one, id: "two" }, rows = [one, two];
  checkCatalog(rows, rows, rows);
  for (const changed of [[], [one, one], [one], [one, { ...two, command: "different" }], [one, { ...two, project: "other" }]]) {
    assert.throws(() => checkCatalog(rows, changed, rows)); assert.throws(() => checkCatalog(rows, rows, changed));
  }
});

test("all-empty catalogs fail non-vacuously", () => {
  assert.throws(() => checkCatalog([], [], []), /EMPTY_CASE_CATALOG: planned/);
});

test("native catalog controls policy; legacy omissions inherit, explicit conflicts fail", () => {
  const legacy = { id: "one", project: "project", category: "primary", command: "tool", expectExit: "zero", oracle: "exact" };
  for (const allowEmpty of [false, true]) {
    const native = { ...legacy, allowEmpty, marker: "native marker" };
    checkCatalog([legacy], [legacy], [native]);
    checkCatalog([native], [native], [native]);
    for (const changed of [{ ...legacy, allowEmpty: !allowEmpty }, { ...legacy, marker: "forged marker" }]) {
      assert.throws(() => checkCatalog([changed], [legacy], [native]), /planned NATIVE_POLICY_MISMATCH/);
      assert.throws(() => checkCatalog([legacy], [changed], [native]), /measured NATIVE_POLICY_MISMATCH/);
    }
  }
});

test("verified capture binds all digests, exact output, native facts and duration", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-integrity-"));
  try {
    const directory = path.join(root, "cases", "one"), raw = Buffer.from("native café\n");
    const capture = { output: raw.toString(), raw, stdout: raw, stderr: Buffer.alloc(0), command: "tool", exitCode: 0, signal: null, complete: true, timedOut: false, durationMs: 17 };
    const artifacts = await archiveCapture(directory, capture, capture.output);
    await writeFile(path.join(directory, "capture.json"), JSON.stringify(capture));
    const row = result(raw, artifacts);
    const persist = (value: unknown) => writeFile(path.join(directory, "result.json"), JSON.stringify(value));
    await persist(row);
    assert.deepEqual((await verifiedCapture(root, row)).capture.raw, raw);
    for (const change of [{ observedExit: 7 }, { captureMs: 18 }, { command: "other" }, { complete: false }, { signal: "SIGTERM" }, { timedOut: true }]) {
      await t.test(Object.keys(change)[0]!, async () => {
        const forged = { ...row, ...change }; await persist(forged);
        await assert.rejects(verifiedCapture(root, forged), /CAPTURE_FACT_MISMATCH/);
      });
    }
    await persist(row);
    await t.test("decoded native output", async () => {
      await writeFile(path.join(directory, "capture.json"), JSON.stringify({ ...capture, output: "forged café\n" }));
      await assert.rejects(verifiedCapture(root, row), /CAPTURE_OUTPUT_MISMATCH/);
      await writeFile(path.join(directory, "capture.json"), JSON.stringify(capture));
    });
    const changed = Buffer.from("forged café\n");
    assert.equal(changed.length, raw.length);
    await writeFile(path.join(directory, "filtered.txt.gz"), gzipSync(changed));
    await assert.rejects(verifiedCapture(root, row), /filtered DIGEST_MISMATCH/);
    const forged = { ...structuredClone(row), ...metrics(raw, changed) };
    forged.artifacts.filtered.bytes = changed.length; forged.artifacts.filtered.sha256 = sha256(changed);
    await persist(forged);
    await assert.rejects(verifiedCapture(root, forged), /EXACT_FILTERED_BYTES_CHANGED/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("same-size valid UTF-8 stdout corruption fails its digest", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-integrity-stream-"));
  try {
    const raw = Buffer.from("native café\n"), directory = path.join(root, "cases", "one");
    const capture = { output: raw.toString(), raw, stdout: raw, stderr: Buffer.alloc(0), command: "tool", exitCode: 0, signal: null, complete: true, timedOut: false, durationMs: 17 };
    const row = result(raw, await archiveCapture(directory, capture, capture.output));
    await writeFile(path.join(directory, "capture.json"), JSON.stringify(capture));
    await writeFile(path.join(directory, "result.json"), JSON.stringify(row));
    assert.deepEqual((await verifiedCapture(root, row)).capture.raw, raw);
    const changed = Buffer.from("forged café\n"); assert.equal(changed.length, raw.length);
    await writeFile(path.join(directory, "stdout.txt.gz"), gzipSync(changed));
    await t.test("digest", async () => {
      await assert.rejects(verifiedCapture(root, row), /stdout DIGEST_MISMATCH/);
    });
    await t.test("native stream byte total", async () => {
      const artifacts = await archiveCapture(directory, { ...capture, stdout: Buffer.concat([raw, Buffer.from("x")]) }, capture.output);
      const forged = { ...row, artifacts };
      await writeFile(path.join(directory, "result.json"), JSON.stringify(forged));
      await assert.rejects(verifiedCapture(root, forged), /STREAM_BYTE_MISMATCH/);
    });
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
    const row = result(raw, artifacts);
    await writeFile(path.join(directory, "result.json"), JSON.stringify(row));
    assert.deepEqual((await verifiedCapture(root, row)).filtered, raw);
    for (const name of ["original", "filtered"]) {
      await t.test(name, async () => {
        const changed = Buffer.from([0xc3, 0x28]), original = name === "original" ? changed : raw;
        const filtered = name === "filtered" ? changed : Buffer.alloc(0);
        const malformedCapture = { ...capture, output: original.toString(), raw: original, stdout: original };
        const artifacts = await archiveCapture(directory, malformedCapture, filtered.toString());
        artifacts.filtered.bytes = filtered.length; artifacts.filtered.sha256 = sha256(filtered);
        const forged = { ...result(original, artifacts), decision: "reduced", profile: "synthetic", ...metrics(original, filtered) };
        await writeFile(path.join(directory, "filtered.txt.gz"), gzipSync(filtered));
        await writeFile(path.join(directory, "result.json"), JSON.stringify(forged));
        await writeFile(path.join(directory, "capture.json"), JSON.stringify(malformedCapture));
        await assert.rejects(verifiedCapture(root, forged), new RegExp(`${name} UTF8_ROUNDTRIP_MISMATCH`));
      });
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
