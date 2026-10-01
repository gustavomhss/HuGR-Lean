import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { sha256 } from "./capture.mjs";

const identity = (row) => JSON.stringify([row.id, row.project, row.category, row.command, row.expectExit, row.oracle]);
export function checkCatalog(planned, measured, native) {
  for (const [name, rows] of [["planned", planned], ["measured", measured], ["native", native]]) {
    assert.ok(Array.isArray(rows) && rows.length, `EMPTY_CASE_CATALOG: ${name}`);
    assert.equal(new Set(rows.map((row) => row.id)).size, rows.length, `DUPLICATE_CASE: ${name}`);
  }
  const reference = planned.map(identity).sort();
  assert.deepEqual(measured.map(identity).sort(), reference, "MEASURED_CATALOG_IDENTITY_MISMATCH");
  assert.deepEqual(native.map(identity).sort(), reference, "NATIVE_CATALOG_IDENTITY_MISMATCH");
}
export async function verifiedCapture(outputDir, row) {
  const directory = path.join(outputDir, "cases", row.id);
  const capture = JSON.parse(await readFile(path.join(directory, "capture.json"), "utf8"));
  const contents = {};
  for (const name of ["original", "filtered", "stdout", "stderr"]) {
    const artifact = row.artifacts[name];
    assert.ok(artifact && artifact.file === `${name}.txt.gz`, `${row.id}: INVALID_ARTIFACT_PATH`);
    const data = gunzipSync(await readFile(path.join(directory, artifact.file)));
    assert.equal(data.length, artifact.bytes, `${row.id}: ${name} BYTE_MISMATCH`);
    assert.equal(sha256(data), artifact.sha256, `${row.id}: ${name} DIGEST_MISMATCH`);
    if (["original", "filtered"].includes(name)) assert.deepEqual(Buffer.from(data.toString("utf8"), "utf8"), data, `${row.id}: ${name} UTF8_ROUNDTRIP_MISMATCH`);
    contents[name] = data;
  }
  assert.equal(contents.original.toString("utf8"), capture.output, `${row.id}: CAPTURE_OUTPUT_MISMATCH`);
  assert.equal(capture.command, row.command, `${row.id}: CAPTURE_COMMAND_MISMATCH`);
  assert.equal(capture.exitCode, row.observedExit); assert.equal(capture.signal, row.signal);
  assert.equal(capture.complete, row.complete); assert.equal(capture.timedOut, row.timedOut);
  assert.equal(capture.durationMs, row.captureMs);
  if (["passthrough", "failed_open"].includes(row.decision)) assert.deepEqual(contents.filtered, contents.original, `${row.id}: EXACT_FILTERED_BYTES_CHANGED`);
  return { capture: { ...capture, raw: contents.original }, filtered: contents.filtered };
}
