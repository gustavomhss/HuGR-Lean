import assert from "node:assert/strict";
import { test } from "node:test";

const { checkEvidence } = await import(new URL("../scripts/real-world/evidence.mjs", import.meta.url).href);
const { pytestSummary } = await import(new URL("../scripts/real-world/failure-binding.mjs", import.meta.url).href);
const marker = "BENCH_EXPECTED_FAILURE";
// Original MIT native-shaped in-memory controls; no copied capture or corpus execution.
const diagnostic = `======== FAILURES ========
________ test_bench_expected_failure ________

    def test_bench_expected_failure():
>       assert False, "${marker}"
E       AssertionError: ${marker}
E       assert False

tests/bench_expected_failure_test.py:7: AssertionError
`;
const short = "======== short test summary info ========\n";
const failed = `FAILED tests/bench_expected_failure_test.py::test_bench_expected_failure - AssertionError: ${marker}\n`;
const other = "FAILED tests/test_other.py::test_other - AssertionError: independent failure\n";
const footer = "======== 1 failed in 0.01s ========\n";
const fixture = (tail = failed + footer): string => diagnostic + short + tail;
function binding(output: string, ok: boolean, exitCode = 1): void {
  const spec = Object.freeze({ id: "pytest-footer", oracle: "pytest", expectExit: "nonzero", marker });
  const capture = Object.freeze({ output, exitCode, signal: null, complete: true, timedOut: false });
  const size = Buffer.byteLength(output, "utf8");
  const result = Object.freeze({ status: "passthrough", reason: "footer_control", inputBytes: size, outputBytes: size });
  const before = JSON.stringify([spec, capture, result]), found = checkEvidence(spec, capture, result);
  assert.equal(found.ok, ok, JSON.stringify(found));
  if (ok) assert.deepEqual(found.violations, []);
  else assert.ok(found.violations.some((line: string) => line.includes(": failure_binding:")), JSON.stringify(found));
  assert.equal(JSON.stringify([spec, capture, result]), before, "Inputs and UTF-8 metrics must stay exact");
  assert.deepEqual(checkEvidence(spec, capture, result), found, "Oracle must be deterministic");
}

test("Pytest footer calibration: intended fixture passes; changed assertion marker fails", () => {
  binding(fixture(), true);
  const changed = fixture().replace(`E       AssertionError: ${marker}`, "E       AssertionError: OTHER_FAILURE");
  assert.notEqual(changed, fixture());
  binding(changed, false);
});

test("Pytest footer supports mixed outcomes, distinct FAILED rows, CRLF and inspected SGR", () => {
  for (const summary of ["1 failed in 0s", "1 failed, 2 passed, 3 skipped, 1 warning in 0.12s",
    "1 failed, 5 warnings, 2 xfailed, 3 xpassed, 4 subtests passed, 0 errors in 1s"]) {
    for (const tail of [summary + "\n", `======== ${summary} ========\n`]) {
      const input = fixture(failed + tail);
      for (const output of [input, input + "\n\n", input.replaceAll("\n", "\r\n"),
        input.split("\n").map((line) => line ? `\x1b[31m${line}\x1b[39m` : "").join("\n")]) binding(output, true);
    }
  }
  for (const records of [failed + other, other + failed]) binding(fixture(records + footer.replace("1 failed", "2 failed")), true);
  binding(fixture(failed.replace(`AssertionError: ${marker}`, "As...") + footer), true);
});

const invalid = ["1 failed, 0 failed in 0.01s", "1 failed, 1 failed in 0.01s",
  "1 failed, 0 error, 0 errors in 0.01s", "1 failed, 1 warning, 2 warnings in 0.01s",
  "01 failed in 0.01s", "-1 failed in 0.01s", "+1 failed in 0.01s", "1.5 failed in 0.01s",
  "9007199254740992 failed in 0.01s", "1 failed, 9007199254740992 passed in 0.01s",
  "1 failed, 1 unknown in 0.01s", "1 failed in NaNs", "1 failed in Infinitys", "1 failed in -0.01s",
  "1 failed in 1e2s", "1 failed in .1s", "1 failed in 1.s", "1 failed in 0.01ms",
  `1 failed in ${"9".repeat(309)}s`, "many failed in 0.01s", "1 failed, 00 passed in 0.01s",
  ...["passed", "skipped", "xfailed", "xpassed", "subtests passed"].map((category) => `1 failed, 1 ${category}, 1 ${category} in 0.01s`)];
test("Pytest summary boolean API rejects duplicate aliases, unsafe counts and invalid durations/outcomes", () => {
  for (const body of ["0 failed in 0s", "9007199254740991 passed in 0.01s", "1 error in 0s", "2 errors in 0s",
    "1 warning in 0s", "2 warnings in 0s", "1 passed, 2 skipped, 3 xfailed, 4 xpassed, 5 subtests passed in 1.2s"]) {
    assert.equal(pytestSummary(body), true, body);
    assert.equal(pytestSummary(`======== ${body} ========`), true, body);
  }
  for (const body of invalid) for (const summary of [body, `======== ${body} ========`]) {
    assert.equal(pytestSummary(summary), false, summary);
    binding(fixture(failed + summary + "\n"), false);
    binding(summary + "\n" + fixture(), false);
    binding(fixture() + summary + "\n", false);
    binding(fixture(failed + summary + "\n" + footer), false);
  }
});

test("Pytest footer rejects competing/earlier/absent summaries and unrelated trailing rows", () => {
  const zero = footer.replace("1 failed", "0 failed"), conflict = footer.replace("1 failed", "2 failed");
  for (const output of [fixture() + zero, fixture() + conflict, fixture() + footer,
    fixture(failed + zero + footer), fixture(failed + conflict + footer), footer + fixture(),
    fixture(footer + failed), fixture(failed), fixture(failed + "\n" + footer),
    fixture() + "unrelated row café🔥\n", fixture() + " \n", fixture(failed + "unrelated row\n" + footer),
    diagnostic + footer + short + failed + footer]) binding(output, false);
});

test("Pytest footer failed count matches distinct bounded records; unsupported ERROR records fail", () => {
  for (const tail of [failed + footer.replace("1 failed", "2 failed"), failed + footer.replace("1 failed", "0 failed"),
    failed + failed + footer.replace("1 failed", "2 failed"), failed + other + other + footer.replace("1 failed", "3 failed"),
    failed + other + footer, failed + "ERROR tests/test_other.py::test_other - setup failed\n" + footer,
    failed + footer.replace("1 failed", "1 failed, 1 error"), failed + footer.replace("1 failed", "1 failed, 2 errors"),
    failed + "FAILED malformed record\n" + footer.replace("1 failed", "2 failed")]) binding(fixture(tail), false);
});

test("Pytest footer preserves exact controlled identity, source, diagnostic, location and exit binding", () => {
  for (const output of [fixture().replace('assert False, "BENCH_EXPECTED_FAILURE"', 'assert False, "OTHER_FAILURE"'),
    fixture().replace("tests/bench_expected_failure_test.py:7:", "other.py:7:"),
    fixture(failed.replace(" - AssertionError:", " - RuntimeError:") + footer),
    fixture(failed.replace("tests/bench_expected_failure_test.py::", "other.py::") + footer),
    fixture().replace("======== FAILURES ========\n", ""), fixture().replace(short, short + short)]) binding(output, false);
  binding(fixture(), false, 2);
});
