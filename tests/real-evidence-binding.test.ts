import assert from "node:assert/strict";
import { test } from "node:test";

const { checkEvidence } = await import(new URL("../scripts/real-world/evidence.mjs", import.meta.url).href);
const marker = "BENCH_EXPECTED_FAILURE";
const bytes = (text: string): number => Buffer.byteLength(text, "utf8");
function binding(oracle: string, output: string, ok: boolean, exitCode = oracle.startsWith("cargo-") ? 101 : 1, controlledMarker = marker): void {
  const spec = Object.freeze({ id: `binding-${oracle}`, oracle, expectExit: "nonzero", marker: controlledMarker });
  const capture = Object.freeze({ output, exitCode, signal: null, complete: true, timedOut: false });
  const result = Object.freeze({ status: "passthrough", reason: "micro_fixture", inputBytes: bytes(output), outputBytes: bytes(output) });
  const before = JSON.stringify([spec, capture, result]);
  const found = checkEvidence(spec, capture, result);
  assert.equal(found.ok, ok, JSON.stringify(found));
  if (!ok) assert.ok(found.violations.some((line: string) => line.includes(": failure_binding:")), JSON.stringify(found));
  assert.equal(JSON.stringify([spec, capture, result]), before, "Pure oracle must preserve its inputs");
  assert.deepEqual(checkEvidence(spec, capture, result), found, "Pure oracle must be deterministic");
}

// Independent in-memory native-shaped controls; never corpus runs or timing samples.
const cargoDiagnostic = `error: ${marker}\n   --> src/lib.rs:4:1\n    |\n4 | compile_error!("${marker}");\n    | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n\n`;
const cargoFooter = "error: could not compile `micro` (lib) due to 1 previous error\n";
test("Cargo marker and controlled arrow stay inside one bounded compiler diagnostic", () => {
  for (const oracle of ["cargo-build", "cargo-test"]) {
    const good = cargoDiagnostic + cargoFooter;
    binding(oracle, good, true);
    binding(oracle, good.replaceAll("\n", "\r\n"), true);
    const other = cargoDiagnostic.replace("src/lib.rs:4:1", "src/other.rs:4:1");
    const borrowed = other + "error[E0425]: unrelated failure\n   --> src/lib.rs:8:1\n\n" + cargoFooter;
    for (const bad of [borrowed, other + cargoFooter, cargoDiagnostic, cargoFooter + cargoDiagnostic,
      cargoDiagnostic + cargoDiagnostic + cargoFooter]) binding(oracle, bad, false);
    binding(oracle, good, false, 1);
  }
});

const goStart = "=== RUN   TestBenchExpectedFailure\n";
const goMessage = `    bench_expected_failure_test.go:4: ${marker}\n`;
const goEnd = "--- FAIL: TestBenchExpectedFailure (0.00s)\nFAIL\nFAIL\texample.org/micro\t0.001s\n";
test("Go requires exact controlled message, not quoted t.Fatal source or unrelated failure", () => {
  const good = goStart + goMessage + goEnd;
  binding("go", good, true);
  for (const message of [`example source: t.Fatal("${marker}")`, `"${marker}"`, `${marker}: unrelated failure`]) {
    binding("go", goStart + `    bench_expected_failure_test.go:4: ${message}\n` +
      "    bench_expected_failure_test.go:5: unrelated setup failure\n" + goEnd, false);
  }
  for (const bad of [good.replace("--- FAIL: TestBenchExpectedFailure", "--- FAIL: TestOther"),
    good.replace("bench_expected_failure_test.go:4:", "other_test.go:4:"), goStart + goEnd + goMessage,
    goStart + "=== RUN   TestOther\n" + goMessage + goEnd, goStart + goMessage,
    good + good, good.replace("FAIL\texample.org/micro\t0.001s\n", "")]) binding("go", bad, false);
});

const pytestStart = "======== FAILURES ========\n";
const pytestHeading = "________ test_bench_expected_failure ________\n";
const pytestBody = `\n    def test_bench_expected_failure():\n>       assert False, "${marker}"\nE       AssertionError: ${marker}\nE       assert False\n\n`;
const pytestLocation = "tests/bench_expected_failure_test.py:3: AssertionError\n";
const pytestShort = "======== short test summary info ========\n";
const pytestFailed = `FAILED tests/bench_expected_failure_test.py::test_bench_expected_failure - AssertionError: ${marker}\n`;
const pytestSummary = "======== 1 failed in 0.01s ========\n";
const pytest = pytestStart + pytestHeading + pytestBody + pytestLocation + pytestShort + pytestFailed + pytestSummary;
test("Pytest assertion location and full FAILED nodeid belong to one native failure section", () => {
  binding("pytest", pytest, true);
  binding("pytest", pytest.replaceAll("\n", "\r\n"), true);
  for (const bad of [pytest.replace(pytestLocation, "other.py:3: AssertionError\n"),
    pytest.replace(pytestFailed, "FAILED other.py::test_bench_expected_failure - AssertionError\n"),
    pytest.replace(pytestLocation, ""), pytest.replace(pytestShort, ""),
    pytest.replace(pytestHeading, "________ test_other ________\n"),
    pytest.replace(`E       AssertionError: ${marker}`, `E       AssertionError: quoted "${marker}"`),
    pytest.replace(pytestBody, `\nE       AssertionError: ${marker}\n\n`),
    pytest.replace(pytestShort + pytestFailed, pytestFailed + pytestShort),
    pytest.replace(pytestFailed, "FAILED tests/bench_expected_failure_test.py::test_bench_expected_failure - RuntimeError: setup\n"),
    pytest.replace(pytestFailed, pytestFailed + pytestFailed)]) binding("pytest", bad, false);
});

test("Pytest rejects same bare name in other file borrowing controlled FAILED row", () => {
  const other = pytestHeading + pytestBody + "other.py:3: AssertionError\n";
  const controlled = pytestHeading + "\nE       RuntimeError: unrelated failure\n\n" +
    "tests/bench_expected_failure_test.py:3: RuntimeError\n";
  const rows = `FAILED other.py::test_bench_expected_failure - AssertionError: ${marker}\n` +
    "FAILED tests/bench_expected_failure_test.py::test_bench_expected_failure - RuntimeError\n";
  binding("pytest", pytestStart + other + controlled + pytestShort + rows + "======== 2 failed in 0.01s ========\n", false);
  binding("pytest", pytest.replace(pytestShort, pytestHeading + pytestBody + pytestLocation + pytestShort), false);
  binding("pytest", pytest.replace(pytestFailed, pytestFailed + `FAILED other.py::test_bench_expected_failure - ${marker}\n`), false);
});

const jestStart = `FAIL src/bench-expected-failure.test.ts\n  ● ${marker}\n`;
const jestMatcher = `
    expect(received).toBe(expected) // Object.is equality

    Expected: false
    Received: true

`;
const jestFrame = `      1 | // Independent in-memory control.
      2 | import { test, expect } from '@jest/globals';
    > 3 | test('${marker}', () => { expect(true).toBe(false); });
        |                                                     ^
      4 |

      at Object.<anonymous> (src/bench-expected-failure.test.ts:3:53)

`;
const jestTotals = "Test Suites: 1 failed, 1 total\nTests:       1 failed, 1 total\n";
const jest = jestStart + jestMatcher + jestFrame + jestTotals;
test("Jest native matcher occupies first diagnostic position; runtime-error assertion prose fails", () => {
  binding("jest", jest, true);
  binding("jest", jest.replaceAll("\n", "\r\n"), true);
  const prose = "\n    Error: failed to load document containing assertion examples:\n\n";
  binding("jest", jestStart + prose + jestMatcher + jestFrame + jestTotals, false);
  binding("jest", jest.replace("    expect(received)", "    Error: expect(received)"), false);
});

test("Jest matcher values stay coherent with controlled true-to-false assertion", () => {
  for (const bad of [jest.replace("Expected: false", "Expected: true"),
    jest.replace("Received: true", "Received: false"),
    jest.replace("Received: true", "Received: 1"),
    jest.replace("toBe(expected)", "toEqual(expected)"),
    jest.replace("    Expected: false\n    Received: true", "    Received: true\n    Expected: false")]) binding("jest", bad, false);
});

test("Jest source frame and native stack location must bind controlled suite and line", () => {
  for (const bad of [jest.replace("at Object.<anonymous> (src/bench-expected-failure.test.ts", "at Object.<anonymous> (src/other.test.ts"),
    jest.replace("test.ts:3:53)", "test.ts:4:53)"),
    jest.replace(jestFrame, ""), jest.replace("        |                                                     ^\n", ""),
    jest.replace("expect(true).toBe(false)", "expect(false).toBe(false)")]) binding("jest", bad, false);
});

test("Jest cannot borrow matcher from another bullet or suite, duplicate identities or earlier summary", () => {
  for (const bad of [jest.replace(jestMatcher, "\n    Error: setup failed\n\n  ● Other test\n" + jestMatcher),
    jest.replace(jestMatcher, "\nPASS src/other.test.ts\n" + jestMatcher),
    jestStart + jestMatcher + jestFrame + jestStart + jestMatcher + jestFrame + jestTotals,
    jest.replace(jestTotals, ""), jestTotals + jest.replace(jestTotals, ""),
    jest.replace("Test Suites: 1 failed, 1 total", "Test Suites: 1 failed, 2 total"),
    jest.replace("Tests:       1 failed, 1 total", "Tests:       1 failed, 2 total")]) binding("jest", bad, false);
});

const vitestHeader = "⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯\n\n";
const vitestStart = ` FAIL  test/bench-expected-failure.test.ts > ${marker}\n`;
const vitestMatcher = `AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

`;
const vitestFrame = ` ❯ test/bench-expected-failure.test.ts:3:53
      1| // Independent in-memory control.
      2| import { test, expect } from 'vitest';
      3| test('${marker}', () => { expect(true).toBe(false); });
       |                                                     ^
      4|

⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

`;
const vitestTotals = " Test Files  1 failed (1)\n      Tests  1 failed (1)\n";
const vitest = vitestHeader + vitestStart + vitestMatcher + vitestFrame + vitestTotals;
test("Vitest AssertionError occupies first diagnostic position, not runtime-error prose", () => {
  binding("vitest", vitest, true);
  binding("vitest", vitest.replaceAll("\n", "\r\n"), true);
  binding("vitest", vitest.replace(vitestMatcher, "Error: document contains this example:\n" + vitestMatcher), false);
  binding("vitest", vitest.replace(vitestHeader, ""), false);
});

test("Vitest native Expected/Received diff and pointed assertion must agree", () => {
  for (const bad of [vitest.replace("- false", "- true"), vitest.replace("+ true", "+ false"),
    vitest.replace("- Expected\n+ Received", "+ Received\n- Expected"),
    vitest.replace("expected true to be false", "expected false to be true"),
    vitest.replace("expect(true).toBe(false)", "expect(false).toBe(false)")]) binding("vitest", bad, false);
});

test("Vitest location stays in controlled block with bounded failed result", () => {
  for (const bad of [vitest.replace(" ❯ test/bench-expected-failure.test.ts", " ❯ test/other.test.ts"),
    vitest.replace("test.ts:3:53", "test.ts:4:53"), vitest.replace(vitestFrame, ""),
    vitest.replace(vitestMatcher, "Error: setup failed\n FAIL  test/other.test.ts > other\n" + vitestMatcher),
    vitest.replace(vitestTotals, ""), vitestTotals + vitest.replace(vitestTotals, ""),
    vitest.replace("Test Files  1 failed (1)", "Test Files  1 failed (2)"),
    vitest.replace("Tests  1 failed (1)", "Tests  1 failed (2)"),
    vitestHeader + vitestStart + vitestMatcher + vitestFrame + vitestStart + vitestMatcher + vitestFrame + vitestTotals]) binding("vitest", bad, false);
});

test("Native matcher bindings retain mixed passed/failed counts and bounded SGR inspection", () => {
  const mixedJest = "PASS src/other.test.ts (0.1 s)\n" + jest.replace(jestTotals,
    "Test Suites: 1 failed, 4 passed, 5 total\nTests:       1 failed, 167 passed, 168 total\n");
  const mixedVitest = vitest.replace(vitestTotals,
    " Test Files  1 failed | 13 passed (14)\n      Tests  1 failed | 489 passed (490)\n");
  for (const [oracle, output] of [["jest", mixedJest], ["vitest", mixedVitest]] as const) {
    binding(oracle, output, true);
    const colored = output.split("\n").map((line) => line ? `\x1b[31m${line}\x1b[39m` : "").join("\n");
    binding(oracle, colored, true);
    binding(oracle, output, false, 2);
  }
});

test("Jest native diagnostic indentation and full controlled test name cannot be prose", () => {
  const mutations = [
    jest.replace(`  ● ${marker}`, `    ● ${marker}`),
    jest.replace(`  ● ${marker}`, `  ● ${marker} example`),
    jest.replace("    expect(received)", "expect(received)"),
    jest.replace("    Expected: false", "  Expected: false"),
    jest.replace("    > 3 |", "      3 |"),
    jest.replace("      at Object.<anonymous>", "    at Object.<anonymous>"),
  ];
  for (const bad of mutations) binding("jest", bad, false);
});

test("Vitest full controlled test name and native error/location position cannot be prose", () => {
  const mutations = [
    vitest.replace(` > ${marker}\n`, ` > example > ${marker}\n`),
    vitest.replace("AssertionError:", "    AssertionError:"),
    vitest.replace(" ❯ test/", "   ❯ test/"),
    vitest.replace("- false\n+ true", "+ true\n- false"),
    vitest.replace("       |                                                     ^\n", ""),
    vitest.replace(vitestTotals, "      Tests  1 failed (1)\n Test Files  1 failed (1)\n"),
    vitest.replace("Failed Tests 1", "Failed Tests 2"),
  ];
  for (const bad of mutations) binding("vitest", bad, false);
});

// Original MIT in-memory frame/section controls; no compiler execution or copied captures.
const positionFixtures = [
  { oracle: "jest", output: jest, gutter: "        |" },
  { oracle: "vitest", output: vitest, gutter: "       |" },
];
function positioned(input: string, gutter: string, location: number, caret = location): string {
  const original = gutter + " ".repeat(53) + "^";
  assert.ok(input.includes(original), "Fixture must contain original native caret");
  return input.replace(":3:53", `:3:${location}`).replace(original, gutter + " ".repeat(caret) + "^");
}

test("Jest/Vitest native caret column and location agree within ASCII source bounds", () => {
  const recipe = `test('${marker}', () => { expect(true).toBe(false); });`;
  assert.equal(recipe.length, 68);
  for (const entry of positionFixtures) {
    binding(entry.oracle, entry.output, true);
    binding(entry.oracle, positioned(entry.output, entry.gutter, 68), true);
    binding(entry.oracle, positioned(entry.output, entry.gutter, 999, 53), false);
    binding(entry.oracle, positioned(entry.output, entry.gutter, 53, 1), false);
    binding(entry.oracle, positioned(entry.output, entry.gutter, 53, 54), false);
  }
});

test("Jest/Vitest matching columns still reject beyond-source and shifted-gutter pointers", () => {
  for (const entry of positionFixtures) {
    binding(entry.oracle, positioned(entry.output, entry.gutter, 69), false);
    binding(entry.oracle, positioned(entry.output, entry.gutter, 999), false);
    const original = entry.gutter + " ".repeat(53) + "^";
    const shifted = entry.gutter.slice(1) + " ".repeat(54) + "^";
    binding(entry.oracle, entry.output.replace(original, shifted), false);
  }
});

test("Jest/Vitest columns use source UTF-16 bounds with Unicode marker/context", () => {
  const unicodeMarker = marker + "🔥", recipe = `test('${unicodeMarker}', () => { expect(true).toBe(false); });`;
  assert.equal(recipe.length, 70); assert.equal(bytes(recipe), 72);
  for (const entry of positionFixtures) {
    const input = entry.output.replaceAll(marker, unicodeMarker).replace("Independent in-memory control.", "Unicode context café🔥.");
    binding(entry.oracle, positioned(input, entry.gutter, 55), true, 1, unicodeMarker);
    binding(entry.oracle, positioned(input, entry.gutter, 70), true, 1, unicodeMarker);
    binding(entry.oracle, positioned(input, entry.gutter, 71), false, 1, unicodeMarker);
  }
});

const controlledRecord = vitestStart + vitestMatcher + vitestFrame;
const otherRecord = controlledRecord.replaceAll("bench-expected-failure.test.ts", "other.test.ts").replaceAll(marker, "OTHER_EXPECTED_FAILURE");
function twoVitestFailures(controlSecond = false): string {
  const records = controlSecond ? [otherRecord, controlledRecord] : [controlledRecord, otherRecord];
  return vitestHeader.replace("Failed Tests 1", "Failed Tests 2") +
    records.map((record, index) => record.replace("[1/1]", `[${index + 1}/2]`)).join("") +
    " Test Files  2 failed (2)\n      Tests  2 failed (2)\n";
}

test("Vitest controlled record binds containing Failed Tests section in either record order", () => {
  for (const controlSecond of [false, true]) {
    const input = twoVitestFailures(controlSecond);
    binding("vitest", input, true);
    binding("vitest", input.replaceAll("\n", "\r\n"), true);
  }
});

test("Vitest containing section rejects borrowed context, ambiguous records and inconsistent delimiters", () => {
  const first = twoVitestFailures(), second = twoVitestFailures(true);
  const repeatedOther = vitestHeader.replace("Failed Tests 1", "Failed Tests 3") +
    [controlledRecord, otherRecord, otherRecord].map((record, index) => record.replace("[1/1]", `[${index + 1}/3]`)).join("") +
    " Test Files  2 failed (2)\n      Tests  3 failed (3)\n";
  for (const bad of [
    first.replace("Failed Tests 2", "Failed Suites 2"),
    second.replace(vitestStart, "⎯⎯⎯ Unhandled Errors 1 ⎯⎯⎯\n\n" + vitestStart),
    first.replace(vitestMatcher, "Error: controlled setup failed\n"),
    first.replace("[1/2]", "[2/2]"), first.replace("[2/2]", "[2/3]"),
    first.replace("[1/2]", ""), first.replace("Failed Tests 2", "Failed Tests 3"),
    first.replaceAll("other.test.ts", "bench-expected-failure.test.ts").replaceAll("OTHER_EXPECTED_FAILURE", marker),
    second.replace("[1/2]", "[1/2]\nnot a native failure record"),
    repeatedOther,
  ]) binding("vitest", bad, false);
});
