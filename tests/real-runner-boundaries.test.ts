import assert from "node:assert/strict";
import { test } from "node:test";
const { checkEvidence } = await import(new URL("../scripts/real-world/evidence.mjs", import.meta.url).href);
const marker = "BENCH_EXPECTED_FAILURE";
function binding(oracle: string, output: string, ok: boolean, controlledMarker = marker): void {
  const spec = Object.freeze({ id: `runner-boundary-${oracle}`, oracle, expectExit: "nonzero", marker: controlledMarker });
  const capture = Object.freeze({ output, exitCode: 1, signal: null, complete: true, timedOut: false });
  const bytes = Buffer.byteLength(output, "utf8");
  const result = Object.freeze({ status: "passthrough", reason: "frozen_control", inputBytes: bytes, outputBytes: bytes });
  const before = JSON.stringify([spec, capture, result]), found = checkEvidence(spec, capture, result);
  assert.equal(found.ok, ok, JSON.stringify(found));
  if (!ok) assert.ok(found.violations.some((line: string) => line.includes(": failure_binding:")), JSON.stringify(found));
  assert.equal(JSON.stringify([spec, capture, result]), before, "Pure oracle must preserve frozen inputs");
  assert.deepEqual(checkEvidence(spec, capture, result), found, "Pure oracle must be deterministic");
}

// HuGR-Lean@4cd5a0e77e2c97ec4d16e672c1dfc6483ad0fd4a, MIT:
// tests/real-evidence-binding.test.ts (Jest/Vitest controls), tests/real-timed-jest.test.ts (timing).
// Modifications: compact literal assembly, mixed counts/timing, boundary and suffix probes.
// Synthetic in-memory controls only; no native captures, corpus or production parser imports.
const jestStack = "      at Object.<anonymous> (src/bench-expected-failure.test.ts:3:53)\n";
const jestBody = `FAIL src/bench-expected-failure.test.ts (9.068 s)
  ● ${marker}

    expect(received).toBe(expected) // Object.is equality
    Expected: false
    Received: true
      2 | // Frozen source context.
    > 3 | test('${marker}', () => { expect(true).toBe(false); });
        |${" ".repeat(53)}^
      4 |
${jestStack}
`;
const vitestTrailer = "⎯⎯⎯[1/1]⎯\n";
const vitestRecord = ` FAIL  test/bench-expected-failure.test.ts > ${marker}
AssertionError: expected true to be false // Object.is equality
- Expected
+ Received
- false
+ true
 ❯ test/bench-expected-failure.test.ts:3:53
      2| // Frozen source context.
      3| test('${marker}', () => { expect(true).toBe(false); });
       |${" ".repeat(53)}^
      4|
${vitestTrailer}
`;
const vitestHeader = "⎯⎯⎯ Failed Tests 1 ⎯⎯⎯\n\n";
const fixtures = Object.freeze([
  Object.freeze({ oracle: "jest", body: jestBody,
    suite: "Test Suites: 1 failed, 4 passed, 5 total\n", tests: "Tests:       1 failed, 167 passed, 168 total\n",
    passedSuite: "Test Suites: 5 passed, 5 total\n", passedTests: "Tests:       168 passed, 168 total\n", timing: "Time:        9.1 s\n" }),
  Object.freeze({ oracle: "vitest", body: vitestHeader + vitestRecord,
    suite: " Test Files  1 failed | 13 passed (14)\n", tests: "      Tests  1 failed | 489 passed (490)\n",
    passedSuite: " Test Files  14 passed (14)\n", passedTests: "      Tests  490 passed (490)\n",
    timing: "   Start at  12:34:56\n   Duration  1.02s (tests 31ms)\n" }),
] as const);
const output = (entry: typeof fixtures[number]): string => entry.body + entry.suite + entry.tests + entry.timing;

test("C05 frozen timed runners, mixed counts, CRLF and bounded SGR calibrate acceptance", () => {
  for (const entry of fixtures) {
    const good = output(entry);
    binding(entry.oracle, good, true);
    binding(entry.oracle, good.replaceAll("\n", "\r\n"), true);
    binding(entry.oracle, good.split("\n").map((line) => line ? `\x1b[31m${line}\x1b[39m` : "").join("\n"), true);
    const matcher = entry.oracle === "jest" ? "    expect(received)" : "AssertionError:";
    binding(entry.oracle, good.replace(matcher, "Error: runtime setup failed\n" + matcher), false);
  }
});

test("C05 first native summary boundary cannot borrow later failed footer", () => {
  for (const entry of fixtures) {
    const good = output(entry);
    const competing = [entry.passedSuite + entry.passedTests, entry.suite, entry.tests,
      entry.suite.replace("1 failed", "many failed"), entry.tests.replace("1 failed", "many failed"),
      entry.suite.replace("1 failed", "2 failed"), entry.tests.replace("1 failed", "2 failed")];
    for (const prefix of competing) {
      binding(entry.oracle, entry.body + prefix + entry.suite + entry.tests, false);
      binding(entry.oracle, prefix + good, false);
      binding(entry.oracle, good + prefix, false);
    }
    for (const bad of [entry.body + entry.tests + entry.suite, entry.body + entry.suite + "\n" + entry.tests,
      good.replace(entry.suite, entry.passedSuite), good.replace(entry.tests, entry.passedTests),
      good.replace("1 failed", "2 failed"), good.replace(entry.tests, entry.tests.replace("1 failed", "2 failed")),
      good.replace(entry.suite, " " + entry.suite), good.replace(entry.tests, " " + entry.tests)]) binding(entry.oracle, bad, false);
  }
});

test("C05 Jest consumes whole controlled diagnostic through matching stack", () => {
  const good = output(fixtures[0]);
  for (const suffix of ["    RuntimeError: unrelated setup failure\n", "unrelated prose\n",
    "      at unrelated (src/other.test.ts:1:1)\n", "      5 | extra context after stack\n"]) {
    binding("jest", good.replace(jestStack, jestStack + suffix), false);
  }
});

test("C05 Vitest post-caret context ends at correct ordinal trailer", () => {
  const good = output(fixtures[1]), caret = "       |" + " ".repeat(53) + "^\n";
  for (const suffix of ["unrelated prose\n", "RuntimeError: unrelated setup failure\n", " ❯ test/other.test.ts:4:1\n"]) {
    binding("vitest", good.replace(caret, caret + suffix), false);
    binding("vitest", good.replace(vitestTrailer, suffix + vitestTrailer), false);
    binding("vitest", good.replace(vitestTrailer, vitestTrailer + suffix), false);
  }
  for (const bad of [good.replace("[1/1]", "[2/1]"), good.replace("[1/1]", "[1/2]"),
    good.replace(vitestTrailer, ""), good.replace(vitestTrailer, vitestTrailer + "      5| after trailer\n")]) binding("vitest", bad, false);
  const other = vitestRecord.replaceAll("bench-expected-failure.test.ts", "other.test.ts").replaceAll(marker, "OTHER_FAILURE");
  for (const records of [[vitestRecord, other], [other, vitestRecord]]) {
    const multi = vitestHeader.replace("Tests 1", "Tests 2") +
      records.map((record, index) => record.replace("[1/1]", `[${index + 1}/2]`)).join("") +
      " Test Files  2 failed (2)\n      Tests  2 failed (2)\n";
    binding("vitest", multi, true);
    binding("vitest", multi.replaceAll("\n", "\r\n"), true);
    binding("vitest", multi.replace("[1/2]", "[2/2]"), false);
  }
});

test("C05 complete runner bodies retain UTF-16 source-column bounds", () => {
  const unicodeMarker = marker + "🔥", recipe = `test('${unicodeMarker}', () => { expect(true).toBe(false); });`;
  assert.equal(recipe.length, 70); assert.equal(Buffer.byteLength(recipe, "utf8"), 72);
  for (const entry of fixtures) for (const column of [55, 70, 71]) {
    const good = output(entry).replaceAll(marker, unicodeMarker);
    const changed = good.replace(":3:53", `:3:${column}`).replace(" ".repeat(53) + "^", " ".repeat(column) + "^");
    binding(entry.oracle, changed, column <= recipe.length, unicodeMarker);
  }
});
