import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { sha256 } from "./capture.mjs";

const identity = (row) => JSON.stringify([row.id, row.project, row.category, row.command, row.expectExit, row.oracle]);
export const nativePolicy = (spec) => ({ allowEmpty: spec.allowEmpty ?? false,
  ...(spec.marker === undefined ? {} : { marker: spec.marker }) });
export function checkCatalog(planned, measured, native) {
  for (const [name, rows] of [["planned", planned], ["measured", measured], ["native", native]]) {
    assert.ok(Array.isArray(rows) && rows.length, `EMPTY_CASE_CATALOG: ${name}`);
    assert.equal(new Set(rows.map((row) => row.id)).size, rows.length, `DUPLICATE_CASE: ${name}`);
  }
  const reference = planned.map(identity).sort();
  assert.deepEqual(measured.map(identity).sort(), reference, "MEASURED_CATALOG_IDENTITY_MISMATCH");
  assert.deepEqual(native.map(identity).sort(), reference, "NATIVE_CATALOG_IDENTITY_MISMATCH");
  for (const spec of native) {
    const policy = nativePolicy(spec);
    if (Object.hasOwn(spec, "allowEmpty")) assert.equal(typeof spec.allowEmpty, "boolean", `${spec.id}: INVALID_NATIVE_ALLOW_EMPTY`);
    if (Object.hasOwn(policy, "marker")) assert.ok(typeof policy.marker === "string" && policy.marker.length, `${spec.id}: INVALID_NATIVE_MARKER`);
    for (const [name, rows] of [["planned", planned], ["measured", measured]]) {
      const row = rows.find((entry) => entry.id === spec.id);
      for (const key of ["allowEmpty", "marker"]) {
        if (Object.hasOwn(row, key)) assert.equal(row[key], policy[key], `${spec.id}: ${name} NATIVE_POLICY_MISMATCH: ${key}`);
      }
    }
  }
}
export async function verifiedCapture(outputDir, row) {
  const directory = path.join(outputDir, "cases", row.id);
  const persisted = JSON.parse(await readFile(path.join(directory, "result.json"), "utf8"));
  assert.deepEqual(row, persisted, `${row.id}: PERSISTED_RESULT_MISMATCH`);
  const capture = JSON.parse(await readFile(path.join(directory, "capture.json"), "utf8"));
  const contents = {};
  for (const name of ["original", "filtered", "stdout", "stderr"]) {
    const artifact = row.artifacts[name];
    assert.ok(artifact && artifact.file === `${name}.txt.gz`, `${row.id}: INVALID_ARTIFACT_PATH`);
    const data = gunzipSync(await readFile(path.join(directory, artifact.file)));
    assert.equal(data.length, artifact.bytes, `${row.id}: ${name} BYTE_MISMATCH`);
    assert.equal(sha256(data), artifact.sha256, `${row.id}: ${name} DIGEST_MISMATCH`);
    if (["original", "filtered"].includes(name)) assert.deepEqual(Buffer.from(data.toString("utf8"), "utf8"), data, `${row.id}: ${name} UTF8_ROUNDTRIP_MISMATCH`);
    if (name !== "filtered") assert.deepEqual(artifact, capture.artifacts?.[name], `${row.id}: CAPTURE_ARTIFACT_MISMATCH: ${name}`);
    contents[name] = data;
  }
  assert.equal(contents.original.toString("utf8"), capture.output, `${row.id}: CAPTURE_OUTPUT_MISMATCH`);
  assert.equal(contents.original.length, contents.stdout.length + contents.stderr.length, `${row.id}: STREAM_BYTE_MISMATCH`);
  for (const [fact, key] of [["command", "command"], ["exitCode", "observedExit"], ["signal", "signal"],
    ["complete", "complete"], ["timedOut", "timedOut"], ["durationMs", "captureMs"]]) {
    assert.equal(capture[fact], row[key], `${row.id}: CAPTURE_FACT_MISMATCH: ${fact}`);
  }
  const inputBytes = contents.original.length, outputBytes = contents.filtered.length, savedBytes = inputBytes - outputBytes;
  const derived = { inputBytes, outputBytes, savedBytes, reductionPercent: inputBytes ? savedBytes / inputBytes * 100 : 0,
    material: savedBytes >= 1024 && savedBytes >= inputBytes * 0.1,
    linesBefore: capture.output.split("\n").length, linesAfter: contents.filtered.toString("utf8").split("\n").length };
  for (const [key, value] of Object.entries(derived)) assert.equal(row[key], value, `${row.id}: DERIVED_METRIC_MISMATCH: ${key}`);
  if (["passthrough", "failed_open"].includes(row.decision)) assert.deepEqual(contents.filtered, contents.original, `${row.id}: EXACT_FILTERED_BYTES_CHANGED`);
  return { capture: { ...capture, raw: contents.original }, filtered: contents.filtered };
}
