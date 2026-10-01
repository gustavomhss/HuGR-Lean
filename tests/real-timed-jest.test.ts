import assert from "node:assert/strict";
import { test } from "node:test";
const { checkEvidence } = await import(new URL("../scripts/real-world/evidence.mjs", import.meta.url).href);

test("actual slow-suite Jest annotation still proves the intended assertion failure", () => {
  const output = "FAIL src/bench-expected-failure.test.ts (9.068 s)\n  ● BENCH_EXPECTED_FAILURE\n\n    expect(received).toBe(expected) // Object.is equality\n\n    Expected: false\n    Received: true\n\nTests:       1 failed, 167 passed, 168 total\n";
  const capture = { output, exitCode: 1, signal: null, complete: true, timedOut: false };
  const bytes = Buffer.byteLength(output);
  const result = { status: "passthrough", reason: "nonzero_exit", inputBytes: bytes, outputBytes: bytes };
  const spec = { id: "timed-jest", oracle: "jest", expectExit: "nonzero", marker: "BENCH_EXPECTED_FAILURE" };
  assert.equal(checkEvidence(spec, capture, result).ok, true);
  for (const changed of [output.replace("(9.068 s)", "invalid annotation"), output.replace("● BENCH_EXPECTED_FAILURE", "● unrelated"), output.replace("Expected: false", "Expected marker unavailable")]) {
    assert.equal(checkEvidence(spec, { ...capture, output: changed }, { ...result, inputBytes: Buffer.byteLength(changed), outputBytes: Buffer.byteLength(changed) }).ok, false);
  }
});
