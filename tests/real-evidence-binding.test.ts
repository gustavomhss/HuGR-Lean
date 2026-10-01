import assert from "node:assert/strict";
import { test } from "node:test";

const { checkEvidence } = await import(new URL("../scripts/real-world/evidence.mjs", import.meta.url).href);
const marker = "BENCH_EXPECTED_FAILURE";
const bytes = (text: string): number => Buffer.byteLength(text, "utf8");
function binding(oracle: string, output: string, ok: boolean, exitCode = oracle.startsWith("cargo-") ? 101 : 1): void {
  const spec = Object.freeze({ id: `binding-${oracle}`, oracle, expectExit: "nonzero", marker });
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
