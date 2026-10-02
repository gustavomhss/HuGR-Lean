import assert from "node:assert/strict";
import { test } from "node:test";
const { checkEvidence } = await import(new URL("../scripts/real-world/evidence.mjs", import.meta.url).href);

// Original HuGR-Lean MIT synthetic fixture; no copied native capture or execution.
// Modification: expand abridged fixture with source pointer, matching stack and suite footer.
const output = "FAIL src/bench-expected-failure.test.ts (9.068 s)\n  ● BENCH_EXPECTED_FAILURE\n\n" +
  "    expect(received).toBe(expected) // Object.is equality\n\n    Expected: false\n    Received: true\n\n" +
  "    > 3 | test('BENCH_EXPECTED_FAILURE', () => { expect(true).toBe(false); });\n" +
  "        |                                                     ^\n\n" +
  "      at Object.<anonymous> (src/bench-expected-failure.test.ts:3:53)\n\n" +
  "Test Suites: 1 failed, 4 passed, 5 total\nTests:       1 failed, 167 passed, 168 total\n";
function checked(text: string) {
  const capture = { output: text, exitCode: 1, signal: null, complete: true, timedOut: false };
  const bytes = Buffer.byteLength(text, "utf8");
  const result = { status: "passthrough", reason: "nonzero_exit", inputBytes: bytes, outputBytes: bytes };
  const spec = { id: "timed-jest", oracle: "jest", expectExit: "nonzero", marker: "BENCH_EXPECTED_FAILURE" };
  return checkEvidence(spec, capture, result);
}
function rejected(changed: string): void {
  assert.notEqual(changed, output, "Destructive control must change fixture");
  const found = checked(changed);
  assert.equal(found.ok, false, JSON.stringify(found));
  assert.ok(found.violations.some((line: string) => line.includes(": failure_binding:")), JSON.stringify(found));
}

test("native-shaped slow-suite Jest annotation still proves the intended assertion failure", () => {
  const found = checked(output);
  assert.equal(found.ok, true, JSON.stringify(found));
  for (const changed of [output.replace("(9.068 s)", "invalid annotation"), output.replace("● BENCH_EXPECTED_FAILURE", "● unrelated"), output.replace("Expected: false", "Expected marker unavailable")]) {
    rejected(changed);
  }
});

test("native-shaped timed Jest rejects wrong source pointer and pointed assertion", () => {
  rejected(output.replace("    > 3 |", "    > 4 |"));
  rejected(output.replace("    > 3 |", "      3 |"));
  rejected(output.replace("expect(true).toBe(false)", "expect(false).toBe(false)"));
});

test("native-shaped timed Jest rejects wrong stack file or source line", () => {
  rejected(output.replace("at Object.<anonymous> (src/bench-expected-failure.test.ts", "at Object.<anonymous> (src/other.test.ts"));
  rejected(output.replace("test.ts:3:53)", "test.ts:4:53)"));
  rejected(output.replace("test.ts:3:53)", "test.ts:3:999)"));
});

test("native-shaped timed Jest rejects caret column mismatched with stack column", () => {
  rejected(output.replace("        |                                                     ^", "        | ^"));
});

test("native-shaped timed Jest rejects missing suite footer", () => {
  rejected(output.replace("Test Suites: 1 failed, 4 passed, 5 total\n", ""));
});
