import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { filter } from "../src/core/engine.js";
import type { FilterResult, Observation } from "../src/types.js";

const { checkEvidence } = await import(new URL("../scripts/real-world/evidence.mjs", import.meta.url).href);
type Capture = { output: string; exitCode: number | null; signal: string | null; complete: boolean; timedOut: boolean };
type Spec = { id: string; oracle: string; expectExit: "zero" | "nonzero"; marker?: string; allowEmpty?: boolean };
type Verdict = { ok: boolean; violations: string[]; signals: string[] };
const spec = (oracle: string, patch: Partial<Spec> = {}): Spec => ({ id: `unit-${oracle}`, oracle, expectExit: "zero", ...patch });
const capture = (output: string, patch: Partial<Capture> = {}): Capture => ({ output, exitCode: 0, signal: null, complete: true, timedOut: false, ...patch });
const bytes = (text: string): number => Buffer.byteLength(text, "utf8");
const passthrough = (output: string, status: "passthrough" | "failed_open" = "passthrough"): FilterResult =>
  ({ status, reason: "unit_exact", inputBytes: bytes(output), outputBytes: bytes(output) });
const replacement = (input: string, output: string, status: "reduced" | "normalized" = "reduced"): FilterResult =>
  ({ status, reason: "unit_mutation", replacement: output, inputBytes: bytes(input), outputBytes: bytes(output) });
function verdict(oracle: string, input: string, result: unknown, specPatch: Partial<Spec> = {}, capturePatch: Partial<Capture> = {}): Verdict {
  return checkEvidence(spec(oracle, specPatch), capture(input, capturePatch), result);
}
function green(found: Verdict): void { assert.equal(found.ok, true, found.violations.join("\n")); assert.deepEqual(found.violations, []); }
function red(found: Verdict, named: RegExp): void {
  assert.equal(found.ok, false, "Injected defect escaped evidence oracle");
  assert.ok(found.violations.some((line) => named.test(line)), found.violations.join("\n"));
}
function actual(command: string, output: string, patch: Partial<Observation> = {}): FilterResult {
  return filter({ source: "shell", command, output, termination: { kind: "exited", code: 0 },
    completeness: "complete", presentation: "unknown", ...patch });
}

// Original, small synthetic oracle controls. These are unit fixtures, never
// benchmark inputs, executions or evidence of real-project usefulness.
const controls = [
  { oracle: "cargo-build", command: "cargo build", summary: "    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.42s",
    output: "   Compiling ledger v1.2.3 (/tmp/unit-café🔥)\n    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.42s\n" },
  { oracle: "cargo-test", command: "cargo test", summary: "test result: ok. 2 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.02s",
    output: "   Compiling ledger v1.2.3 (/tmp/unit-café🔥)\n    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.31s\n" +
      "     Running unittests src/lib.rs (target/debug/deps/ledger-unit)\n\nrunning 3 tests\ntest ledger::café ... ok\ntest ledger::roundtrip ... ok\n" +
      "test ledger::offline ... ignored, needs service 🔥\n\ntest result: ok. 2 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.02s\n\n" },
  { oracle: "pytest", command: "python3 -m pytest --color=no", summary: "================= 2 passed, 1 skipped in 0.04s =================",
    output: "================= test session starts =================\nplatform linux -- Python 3.14.5, pytest-9.0.3, pluggy-1.6.0\n" +
      "rootdir: /tmp/unit-café🔥\nconfigfile: pyproject.toml\ncollected 3 items\n\ntests/test_one.py . [ 33%]\ntests/test_two.py .s [100%]\n\n" +
      "================= 2 passed, 1 skipped in 0.04s =================\n" },
  { oracle: "go", command: "go test -v", summary: "ok  \texample.org/ledger\t0.025s",
    output: "=== RUN   TestCafé\n--- PASS: TestCafé (0.00s)\n=== RUN   TestRoundtrip\n--- PASS: TestRoundtrip (0.01s)\n" +
      "=== RUN   TestOffline\n--- SKIP: TestOffline (0.00s)\nPASS\nok  \texample.org/ledger\t0.025s\n" },
  { oracle: "jest", command: "jest --verbose", summary: "Tests:       3 passed, 3 total",
    output: "PASS tests/ledger.test.cjs\n  ledger café🔥\n    ✓ name (5 ms) (1 ms)\n    nested\n      ✓ path: evidence (2 ms)\n\n" +
      "PASS tests/reader.test.cjs\n  ✓ roundtrip (3 ms)\n\nTest Suites: 2 passed, 2 total\nTests:       3 passed, 3 total\n" +
      "Snapshots:   0 total\nSeed:        -17\nTime:        0.7 s\nRan all test suites.\n" },
  { oracle: "vitest", command: "vitest run", summary: "      Tests  3 passed (3)",
    output: "\n RUN  v3.2.4 /tmp/unit-café🔥\n\n ✓ tests/ledger.test.ts (2 tests) 24ms\n ✓ tests/reader.test.ts (1 test) 7ms\n\n" +
      " Test Files  2 passed (2)\n      Tests  3 passed (3)\n   Start at  12:34:56\n   Duration  1.02s (transform 8ms, setup 0ms, collect 9ms, tests 31ms, environment 0ms, prepare 5ms)\n\n" },
  { oracle: "git", command: "git status", summary: "On branch evidence/café🔥",
    output: "On branch evidence/café🔥\nYour branch is ahead of 'origin/main' by 2 commits.\n  (use \"git push\" to publish your local commits)\n\n" +
      "Changes to be committed:\n  (use \"git restore --staged <file>...\" to unstage)\n\tmodified:   src/ledger.ts\n\trenamed:    old café.ts -> new 🔥.ts\n\n" +
      "Changes not staged for commit:\n  (use \"git restore <file>...\" to discard changes in working directory)\n\tmodified:   deps/service (new commits, modified content, untracked content)\n\tdeleted:    src/old.ts\n\n" +
      "Untracked files:\n  (use \"git add <file>...\" to include in what will be committed)\n\tnotes café🔥.md\n\n" },
  { oracle: "rg", command: "rg -n --with-filename -e ledger src", summary: "src/café🔥.ts:7:https://example.org:x 🔥",
    output: "src/café🔥.ts:7:https://example.org:x 🔥\r\nsrc/café🔥.ts:7:https://example.org:x 🔥\r\nother.ts:2:other\r\n" +
      "src/café🔥.ts:9:last\r\nsrc/café🔥.ts:10:\r\n" },
] as const;

// Original controlled-failure oracle fixtures, shaped by the feasibility receipts
// in agent-feasibility.json; not executions or benchmark input data.
const failureMarker = "BENCH_EXPECTED_FAILURE";
const failures = [
  { oracle: "cargo-build", command: "cargo build", code: 101, evidence: "error: BENCH_EXPECTED_FAILURE\n",
    output: '   Compiling unit v1.0.0 (/tmp/unit)\nerror: BENCH_EXPECTED_FAILURE\n   --> src/lib.rs:19:1\n19 | compile_error!("BENCH_EXPECTED_FAILURE");\n\nerror: could not compile `unit` (lib) due to 1 previous error\n' },
  { oracle: "go", command: "go test -v", code: 1, evidence: "--- FAIL: TestBenchExpectedFailure (0.00s)\n",
    output: "=== RUN   TestBenchExpectedFailure\n    bench_expected_failure_test.go:4: BENCH_EXPECTED_FAILURE\n--- FAIL: TestBenchExpectedFailure (0.00s)\nFAIL\nFAIL\texample.org/unit\t0.02s\nFAIL\n" },
  { oracle: "pytest", command: "pytest", code: 1, evidence: "E       AssertionError: BENCH_EXPECTED_FAILURE\n",
    output: '================ FAILURES ================\n________ test_bench_expected_failure ________\n\n    def test_bench_expected_failure():\n>       assert False, "BENCH_EXPECTED_FAILURE"\nE       AssertionError: BENCH_EXPECTED_FAILURE\n\ntests/bench_expected_failure_test.py:3: AssertionError\n======== short test summary info ========\nFAILED tests/bench_expected_failure_test.py::test_bench_expected_failure - As...\n============== 1 failed, 2 passed in 0.01s ==============\n' },
  { oracle: "jest", command: "jest --env node", code: 1, evidence: "  ● BENCH_EXPECTED_FAILURE\n",
    output: "FAIL src/bench-expected-failure.test.ts\n  ● BENCH_EXPECTED_FAILURE\n\n    expect(received).toBe(expected) // Object.is equality\n\n    Expected: false\n    Received: true\n\n    > 3 | test('BENCH_EXPECTED_FAILURE', () => { expect(true).toBe(false); });\n        |                                                     ^\n\n      at Object.<anonymous> (src/bench-expected-failure.test.ts:3:53)\nTest Suites: 1 failed, 1 total\nTests:       1 failed, 1 total\n" },
  { oracle: "vitest", command: "vitest run", code: 1, evidence: " FAIL  test/bench-expected-failure.test.ts > BENCH_EXPECTED_FAILURE\n",
    output: "⎯⎯⎯ Failed Tests 1 ⎯⎯⎯\n\n FAIL  test/bench-expected-failure.test.ts > BENCH_EXPECTED_FAILURE\nAssertionError: expected true to be false // Object.is equality\n\n- Expected\n+ Received\n\n- false\n+ true\n\n ❯ test/bench-expected-failure.test.ts:3:53\n      3| test('BENCH_EXPECTED_FAILURE', () => { expect(true).toBe(false); });\n       |                                                     ^\n\n⎯⎯⎯[1/1]⎯\n\n Test Files  1 failed (1)\n      Tests  1 failed (1)\n" },
] as const;

for (const entry of failures) {
  test(`${entry.oracle}: native controlled failure binds diagnostics, including harmless launch-error prose`, () => {
    for (const input of [entry.output, "unit log: command not found; expected log content\n" + entry.output]) {
      const result = actual(entry.command, input, { termination: { kind: "exited", code: entry.code } });
      green(verdict(entry.oracle, input, result, { expectExit: "nonzero", marker: failureMarker }, { exitCode: entry.code }));
    }
  });
  test(`${entry.oracle}: marker quoted in source/log does not replace native failed identity/diagnostic`, () => {
    const input = entry.output.replace(entry.evidence, "");
    assert.notEqual(input, entry.output);
    red(verdict(entry.oracle, input, passthrough(input), { expectExit: "nonzero", marker: failureMarker }, { exitCode: entry.code }), /failure_binding/);
  });
}

test("Jest environment-marker and pytest usage-flag-marker are failed executions, not intended assertion failures", () => {
  for (const [oracle, code, input] of [
    ["jest", 1, "● Validation Error:\nTest environment BENCH_EXPECTED_FAILURE cannot be found.\n"],
    ["pytest", 4, "ERROR: usage: pytest [options] [file_or_dir]\npytest: error: unrecognized arguments: --BENCH_EXPECTED_FAILURE\n"],
  ] as const) red(verdict(oracle, input, passthrough(input), { expectExit: "nonzero", marker: failureMarker }, { exitCode: code }), /failure_binding/);
  const pytest = failures[2];
  red(verdict(pytest.oracle, pytest.output, passthrough(pytest.output), { expectExit: "nonzero", marker: failureMarker }, { exitCode: 4 }), /failure_binding/);
});

test("failure diagnostics cannot borrow another test identity, assertion or failed summary", () => {
  for (const [entry, part] of [[failures[1], "FAIL\n"], [failures[2], "FAILED tests/bench_expected_failure_test.py::test_bench_expected_failure"],
    [failures[2], "1 failed"], [failures[3], "expect(received).toBe(expected)"], [failures[3], "Tests:       1 failed, 1 total"],
    [failures[4], "AssertionError:"], [failures[4], "Tests  1 failed (1)"]] as const) {
    const input = entry.output.replaceAll(part, "other outcome");
    red(verdict(entry.oracle, input, passthrough(input), { expectExit: "nonzero", marker: failureMarker }, { exitCode: entry.code }), /failure_binding/);
  }
});

for (const entry of controls) {
  test(`${entry.oracle}: actual default filter preserves independent evidence`, () => {
    const result = actual(entry.command, entry.output);
    assert.equal(result.status, entry.oracle === "vitest" ? "passthrough" : "reduced", "Positive control must exercise actual filter disposition");
    if (entry.oracle === "vitest") {
      assert.equal(result.reason, "not_smaller");
      assert.equal("replacement" in result, false);
      assert.equal(result.outputBytes, bytes(entry.output));
    }
    const found = verdict(entry.oracle, entry.output, result);
    green(found); assert.ok(found.signals.includes(entry.summary + (entry.oracle === "rg" ? "\r\n" : "\n")));
    green(verdict(entry.oracle, entry.output, passthrough(entry.output)));
    green(verdict(entry.oracle, entry.output, passthrough(entry.output, "failed_open")));
  });
  test(`${entry.oracle}: critical evidence deletion fails with truthful byte metrics`, () => {
    const result = actual(entry.command, entry.output);
    if (entry.oracle !== "vitest") assert.ok("replacement" in result);
    const visible = "replacement" in result ? result.replacement : entry.output;
    const stripped = entry.oracle === "rg" ? visible.replace("7:https://example.org:x 🔥\r\n", "") :
      visible.replace(entry.summary + "\n", "");
    assert.notEqual(stripped, visible, "Probe must really remove evidence");
    const mutant = replacement(entry.output, stripped);
    assert.equal(mutant.outputBytes, bytes(stripped));
    red(verdict(entry.oracle, entry.output, mutant), entry.oracle === "rg" ? /rg_records/ : /native_signal/);
  });
  test(`${entry.oracle}: actual failure metadata and incomplete observations prohibit replacement`, () => {
    const actualResult = actual(entry.command, entry.output);
    // Vitest now stays exact; forge a damaged replacement so metadata controls
    // still exercise the prohibition rather than vacuously accepting no output.
    const result = entry.oracle === "vitest" ? replacement(entry.output, entry.output.replace(" 24ms", "")) : actualResult;
    for (const patch of [{ exitCode: 2 }, { exitCode: null }, { exitCode: null, signal: "SIGTERM" }, { complete: false }, { timedOut: true }] as const) {
      red(verdict(entry.oracle, entry.output, result, {}, patch), /no_replacement/);
    }
    red(verdict(entry.oracle, entry.output, passthrough(entry.output), {}, { complete: false }), /native_completeness/);
  });
}

test("primary passthrough and zero savings remain valid safety evidence", () => {
  for (const oracle of ["exact", "node", ...controls.map((entry) => entry.oracle)]) {
    const input = "unknown reporter invoice café🔥\n";
    green(checkEvidence({ ...spec(oracle), category: "primary" }, capture(input), passthrough(input)));
  }
});

test("expected failures need real nonzero native exit and intended literal marker", () => {
  const entry = failures[1], input = entry.output, config = { expectExit: "nonzero", marker: failureMarker } as const;
  green(verdict(entry.oracle, input, actual(entry.command, input, { termination: { kind: "exited", code: 1 } }), config, { exitCode: 1 }));
  red(verdict(entry.oracle, input, passthrough(input), config), /native_exit/);
  red(verdict(entry.oracle, input, passthrough(input), config, { exitCode: null, signal: "SIGKILL" }), /native_exit/);
  red(verdict(entry.oracle, input, passthrough(input), { expectExit: "nonzero" }, { exitCode: 1 }), /failure_marker/);
  red(verdict(entry.oracle, input, passthrough(input), { ...config, marker: "OTHER_ASSERT" }, { exitCode: 1 }), /marker_missing/);
  for (const oracle of failures.map((item) => item.oracle)) {
    const launch = `zsh: command not found: ${failureMarker}\n`;
    red(verdict(oracle, launch, passthrough(launch), config, { exitCode: 127 }), /failure_binding/);
  }
  red(verdict(entry.oracle, input, replacement(input, failureMarker + "\n"), config, { exitCode: 1 }), /no_replacement/);
});

for (const [label, patch, termination] of [
  ["unexpected success", { exitCode: 0 }, { kind: "exited", code: 0 }],
  ["unknown exit", { exitCode: null }, { kind: "unknown" }],
  ["signal termination", { exitCode: null, signal: "SIGKILL" }, { kind: "unknown" }],
  ["timeout", { exitCode: null, signal: "SIGTERM", timedOut: true, complete: false }, { kind: "timed_out" }],
] as const) test(`native termination: ${label} never proves intended nonzero exit`, () => {
  const input = failures[1].output;
  const result = actual(failures[1].command, input, { termination });
  assert.equal("replacement" in result, false);
  red(verdict("go", input, result, { expectExit: "nonzero", marker: failureMarker }, patch), /native_exit/);
});

test("failure and unknown/exact/Node TAP surfaces prohibit even byte-identical replacement", () => {
  const input = "TAP version 13\n# Subtest: café🔥\nok 1 - café🔥\n1..1\n# tests 1\n# pass 1\n# fail 0\n";
  for (const oracle of ["node", "exact"]) {
    green(verdict(oracle, input, actual("node --test", input)));
    red(verdict(oracle, input, replacement(input, input)), /no_replacement/);
    red(verdict(oracle, input, replacement(input, "# tests 1\n# pass 1\n# fail 0\n")), /no_replacement/);
  }
  const failing = input.replace("# fail 0", "# fail 1");
  red(verdict("node", failing, replacement(failing, failing), { expectExit: "nonzero", marker: "# fail 1" }, { exitCode: 1 }), /no_replacement/);
});

test("empty capture needs explicit boolean flag; flag does not excuse exits or missing failure marker", () => {
  red(verdict("exact", "", passthrough("")), /empty_capture/);
  red(checkEvidence({ ...spec("exact"), allowEmpty: "true" }, capture(""), passthrough("")), /allow_empty/);
  green(verdict("exact", "", passthrough(""), { allowEmpty: true }));
  red(verdict("exact", "", passthrough(""), { allowEmpty: true }, { exitCode: 1 }), /native_exit/);
  red(verdict("exact", "", passthrough(""), { allowEmpty: true, expectExit: "nonzero" }, { exitCode: 1 }), /failure_marker/);
});

test("all result statuses use actual UTF-8 metrics and nonexpansion, never UTF-16 length", () => {
  const input = "café🔥\r\n", valid = passthrough(input);
  green(verdict("exact", input, valid));
  red(verdict("exact", input, { ...valid, inputBytes: input.length }), /input_bytes/);
  red(verdict("exact", input, { ...valid, outputBytes: input.length }), /output_bytes/);
  red(verdict("exact", input, replacement(input, input + "more🔥")), /expansion/);
  red(verdict("exact", input, replacement(input, input, "normalized")), /not_smaller/);
  for (const status of ["passthrough", "failed_open", "reduced", "normalized", "success", undefined]) {
    red(verdict("exact", input, { ...valid, status, outputBytes: 0 }), /output_bytes/);
  }
});

test("invalid statuses, result shapes, capture metadata and specs fail by name", () => {
  const input = "native output\n", valid = passthrough(input);
  red(verdict("exact", input, { ...valid, status: "success" }), /status/);
  red(verdict("exact", input, { ...valid, replacement: undefined }), /replacement_shape/);
  red(verdict("exact", input, Object.assign(Object.create({ replacement: "stub" }), valid)), /replacement_shape/);
  red(verdict("exact", input, { ...valid, status: "reduced" }), /replacement_shape/);
  red(verdict("exact", input, { ...valid, reason: "" }), /reason/);
  red(verdict("exact", input, null), /filter_result/);
  for (const patch of [{ exitCode: -1 }, { exitCode: NaN }, { exitCode: 1.5 }, { exitCode: 0, signal: "SIGTERM" }, { signal: "" }, { complete: undefined }, { timedOut: undefined }]) {
    red(checkEvidence(spec("exact"), { ...capture(input), ...patch }, valid), /capture_metadata/);
  }
  red(checkEvidence(null, capture(input), valid), /expect_exit/);
  red(checkEvidence({ ...spec("exact"), expectExit: "any" }, capture(input), valid), /expect_exit/);
  red(verdict("wrong-oracle", input, valid), /oracle/);
  red(checkEvidence(spec("exact"), null, valid), /capture/);
});

test("unsupported native shapes retain discovered summaries and whole output", () => {
  for (const entry of controls.filter((item) => item.oracle !== "rg")) {
    const input = entry.output + "user diagnostic café🔥\n", result = actual(entry.command, input);
    assert.equal(result.status, "passthrough");
    const found = verdict(entry.oracle, input, result);
    green(found); assert.ok(found.signals.includes(entry.summary + "\n"), "Summary discovery must not depend on grammar acceptance");
    red(verdict(entry.oracle, input, replacement(input, input.replace(entry.summary + "\n", ""))), /native_signal/);
    red(verdict(entry.oracle, input, replacement(input, input.replace("user diagnostic café🔥\n", ""))), /no_replacement/);
  }
});

test("known-looking malformed native ordering/count/version/indentation needs exact fallback", () => {
  for (const oracle of ["cargo-build", "cargo-test", "pytest", "go", "jest", "vitest"]) {
    const entry = controls.find((item) => item.oracle === oracle)!, base = actual(entry.command, entry.output);
    if (oracle !== "vitest") assert.ok("replacement" in base);
    const baseOutput = "replacement" in base ? base.replacement : entry.output;
    const input = oracle === "cargo-build" ? entry.output + "   Compiling late v1.2.3\n" :
      oracle === "cargo-test" ? entry.output.replace("running 3 tests", "running 4 tests") :
      oracle === "pytest" ? entry.output.replace("pytest-9.0.3", "pytest-99.0.0") :
      oracle === "go" ? entry.output.replaceAll("TestRoundtrip", "TestCafé") :
      oracle === "jest" ? entry.output.replace("    ✓ name", "   ✓ name") : entry.output.replace("12:34:56", "24:34:56");
    const forged = oracle === "pytest" ? baseOutput.replace("pytest-9.0.3", "pytest-99.0.0") :
      oracle === "jest" ? baseOutput.replace("    - name", "   - name") : oracle === "vitest" ? baseOutput.replace("12:34:56", "24:34:56").replace(" 24ms", "") :
      oracle === "cargo-build" ? baseOutput + "   Compiling late v1.2.3\n" : baseOutput;
    assert.equal(actual(entry.command, input).status, "passthrough");
    green(verdict(oracle, input, passthrough(input)));
    red(verdict(oracle, input, replacement(input, forged)), /no_replacement/);
  }
});

test("native copy checks reject summary substrings, changed endings, forged totals and reordered signals", () => {
  const entry = controls.find((item) => item.oracle === "jest")!;
  const result = actual(entry.command, entry.output); assert.ok("replacement" in result);
  for (const output of [result.replacement.replace(entry.summary, "// " + entry.summary),
    result.replacement.replace(entry.summary + "\n", entry.summary + "\r\n"),
    result.replacement.replace("3 passed, 3 total", "2 passed, 2 total"),
    result.replacement.replace("Test Suites: 2 passed, 2 total\n" + entry.summary + "\n", entry.summary + "\nTest Suites: 2 passed, 2 total\n")]) {
    red(verdict("jest", entry.output, replacement(entry.output, output)), /native_signal/);
  }
});

test("runner ignored/skip context, Cargo target and pytest environment are required", () => {
  const removals: Record<string, string[]> = {
    "cargo-test": ["     Running unittests src/lib.rs (target/debug/deps/ledger-unit)\n", "test ledger::offline ... ignored, needs service 🔥\n"],
    pytest: ["rootdir: /tmp/unit-café🔥\n", "configfile: pyproject.toml\n", "tests/test_two.py .s [100%]\n", "platform linux -- Python 3.14.5, pytest-9.0.3, pluggy-1.6.0\n"],
    go: ["=== RUN   TestOffline\n", "--- SKIP: TestOffline (0.00s)\n"],
  };
  for (const entry of controls) for (const omitted of removals[entry.oracle] ?? []) {
    const result = actual(entry.command, entry.output); assert.ok("replacement" in result);
    const output = result.replacement.replace(omitted, ""); assert.notEqual(output, result.replacement);
    red(verdict(entry.oracle, entry.output, replacement(entry.output, output)), /native_evidence/);
  }
});

test("Jest full names, nested headings, file identities and native trailers defeat rendering stubs", () => {
  const entry = controls.find((item) => item.oracle === "jest")!, result = actual(entry.command, entry.output);
  assert.ok("replacement" in result);
  for (const change of ["  ledger café🔥\n", "    nested\n", "    - name (5 ms) (1 ms)\n", "+ tests/reader.test.cjs\n", "Snapshots:   0 total\n", "Seed:        -17\n", "Time:        0.7 s\n", "Ran all test suites.\n"]) {
    red(verdict("jest", entry.output, replacement(entry.output, result.replacement.replace(change, ""))), /native_(?:evidence|signal)/);
  }
  red(verdict("jest", entry.output, replacement(entry.output, result.replacement.replace("name (5 ms) (1 ms)", "name"))), /native_evidence/);
  red(verdict("jest", entry.output, replacement(entry.output, "Test Suites: 2 passed, 2 total\n" + entry.summary + "\n")), /native_(?:evidence|signal)/);
});

test("nonverbose Jest preserves exact file and count identity without inventing test bodies", () => {
  const input = "PASS tests/ledger.test.cjs\nTest Suites: 1 passed, 1 total\nTests: 4 passed, 4 total\n";
  green(verdict("jest", input, actual("jest", input)));
});

test("Vitest whole rows including timing stay exact; damaged replacements fail evidence controls", () => {
  const entry = controls.find((item) => item.oracle === "vitest")!, result = actual(entry.command, entry.output);
  assert.equal(result.status, "passthrough"); assert.equal(result.reason, "not_smaller");
  assert.equal("replacement" in result, false); assert.equal(result.outputBytes, bytes(entry.output));
  for (const output of [entry.output.replace("tests/ledger.test.ts", "tests/other.test.ts").replace(" 24ms", ""),
    entry.output.replace("(2 tests)", "(1 test)"), entry.output.replace(" ✓ tests/reader.test.ts (1 test) 7ms\n", ""),
    entry.output.replace(/   Duration [^\n]*\n/, ""), " Test Files  2 passed (2)\n" + entry.summary + "\n"]) {
    red(verdict("vitest", entry.output, replacement(entry.output, output)), /native_(?:evidence|signal)/);
  }
  const verbose = entry.output.replace(" ✓ tests/ledger", "   ✓ full test body (1ms)\n ✓ tests/ledger");
  green(verdict("vitest", verbose, actual(entry.command, verbose)));
  red(verdict("vitest", verbose, replacement(verbose, entry.output)), /no_replacement/);
});

test("Git every fact row survives, including branch/tracking/status/rename/submodule/path facts", () => {
  const entry = controls.find((item) => item.oracle === "git")!, result = actual(entry.command, entry.output);
  assert.ok("replacement" in result);
  for (const line of result.replacement.split("\n").filter(Boolean)) {
    red(verdict("git", entry.output, replacement(entry.output, result.replacement.replace(line + "\n", ""))), /native_signal/);
  }
  for (const [from, to] of [["modified:   src/ledger.ts", "deleted:    src/ledger.ts"], ["old café.ts -> new 🔥.ts", "old café.ts -> other.ts"],
    ["notes café🔥.md", "notes.md"], ["new commits, modified content, untracked content", "modified content"]]) {
    red(verdict("git", entry.output, replacement(entry.output, result.replacement.replace(from!, to!))), /native_signal/);
  }
});

test("Git unsupported/malformed shapes require exact fallback even if every fact row is retained", () => {
  const hint = '  (use "git restore --staged <file>..." to unstage)\n';
  const valid = `On branch unit\n\nChanges to be committed:\n${hint}\tmodified:   src/ledger.ts\n`;
  const malformed = [valid.replace("On branch unit", "custom status unit"), valid.replace("src/ledger.ts", '"src/ledger.ts"'),
    valid.replace("modified:   src/ledger.ts", "renamed:    old.ts -> "), valid.replace("modified:   src/ledger.ts", "modified:   deps/lib (unknown annotation)"),
    valid + "Untracked files:\n", valid + "nothing to commit, working tree clean\n", valid + "  (use unknown advice)\n",
    valid.replace("Changes to be committed:", "Changes not staged for commit:")];
  for (const input of malformed) {
    green(verdict("git", input, actual("git status", input)));
    red(verdict("git", input, replacement(input, input.replace(hint, ""))), /no_replacement/);
  }
});

test("rg independent flattening checks path/line/content/order/multiplicity/line endings", () => {
  const entry = controls.find((item) => item.oracle === "rg")!, result = actual(entry.command, entry.output);
  assert.ok("replacement" in result);
  const output = result.replacement;
  for (const mutant of [output.replace("src/café🔥.ts:", "src/other.ts:"), output.replace("7:https", "8:https"),
    output.replace("example.org:x 🔥", "example.org:y 🔥"), output.replace("7:https://example.org:x 🔥\r\n", ""),
    output.replace("9:last\r\n10:\r\n", "10:\r\n9:last\r\n"), output.replace("9:last\r\n", "9:last\n")]) {
    red(verdict("rg", entry.output, replacement(entry.output, mutant)), /rg_records/);
  }
  const missingDuplicate = output.replace("7:https://example.org:x 🔥\r\n", "");
  red(verdict("rg", entry.output, replacement(entry.output, missingDuplicate)), /rg_records/);
});

test("ambiguous rg numeric delimiters, paths, columns and headings require whole original", () => {
  for (const input of ["a.ts:1:text:23:suffix\na.ts:2:y\n", "a.ts:1:text:02:suffix\na.ts:2:y\n", "a.ts:1:2:column\na.ts:2:3:y\n",
    "src:odd.ts:1:x\nsrc:odd.ts:2:y\n", "1:10:x\n1:11:y\n", "C:\\a.ts:1:x\nC:\\a.ts:2:y\n", "a.ts\n1:x\n2:y\n", "a.ts:0:x\na.ts:2:y\n"]) {
    green(verdict("rg", input, actual("rg -n -e x .", input)));
    red(verdict("rg", input, replacement(input, input.slice(2))), /no_replacement/);
  }
});

test("ordinary CRLF and unterminated native summaries use source-exact copied evidence", () => {
  for (const entry of controls.filter((item) => item.oracle !== "rg")) {
    for (const input of [entry.output.replaceAll("\n", "\r\n"), entry.output.trimEnd()]) {
      green(verdict(entry.oracle, input, actual(entry.command, input)));
    }
  }
});

test("unknown controls and cursor/presentation bytes are never treated as removable noise", () => {
  const entry = controls[0];
  for (const prefix of ["\0", "\x1b[32m", "\rprogress\r", "invoice café🔥\n"]) {
    const input = prefix + entry.output;
    green(verdict(entry.oracle, input, actual(entry.command, input)));
    red(verdict(entry.oracle, input, replacement(input, entry.output)), /no_replacement/);
  }
});

for (const oracle of ["jest", "vitest", "git"]) test(`${oracle}: every native blank row survives actual core ${oracle === "vitest" ? "passthrough" : "reduction"}`, () => {
  const entry = controls.find((item) => item.oracle === oracle)!;
  for (const input of [entry.output, entry.output.replaceAll("\n", "\r\n")]) {
    const result = actual(entry.command, input);
    if (oracle === "vitest") { assert.equal(result.status, "passthrough"); assert.equal("replacement" in result, false); }
    else assert.ok("replacement" in result);
    const visible = "replacement" in result ? result.replacement : input;
    const blanks = [...visible.matchAll(/^\r?\n/gm)]; assert.ok(blanks.length > 0);
    for (const blank of blanks) {
      const output = visible.slice(0, blank.index) + visible.slice(blank.index + blank[0].length);
      red(verdict(oracle, input, replacement(input, output)), /native_evidence/);
    }
  }
});

// Verbatim native feasibility captures, not benchmark inputs. Producer:
// gmhelmold/HuGR-Lean@6bb714e5abf38a6e93f70860c3910de0b2104fd1, MIT,
// scripts/real-world/workloads.mjs. Manifest: lean-workloads-prepared-20260930-final/agent-feasibility.json.
// Source root: /var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-workloads-prepared-20260930/setup-logs/
// Source basenames: 635652ed-a321-493e-9561-fddb84785b5f-{19-probe-vitest-direct,13-probe-pytest-quiet}.output.
// Projects: unjs/ufo@f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6 (MIT, LICENSE, test/*.test.ts);
// mahmoud/boltons@4e5faa3d7e4008d89e0d8bf1ea87b6d9a061a16d (BSD-3-Clause, LICENSE, tests/*.py).
// Modification record: JavaScript literal escaping/interpolation only; source UTF-8 bytes unchanged, pinned below.
const probeProjects = "/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-workloads-prepared-20260930/projects";
const vitest4Signals = [
  "\x1b[2m Test Files \x1b[22m \x1b[1m\x1b[32m13 passed\x1b[39m\x1b[22m\x1b[90m (13)\x1b[39m\n",
  "\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[32m489 passed\x1b[39m\x1b[22m\x1b[90m (489)\x1b[39m\n",
  "\x1b[2m   Start at \x1b[22m 13:35:24\n",
  "\x1b[2m   Duration \x1b[22m 2.50s\x1b[2m (transform 2.49s, setup 0ms, import 4.45s, tests 489ms, environment 17ms)\x1b[22m\n",
];
const vitest4 = `
\x1b[1m\x1b[30m\x1b[46m RUN \x1b[49m\x1b[39m\x1b[22m \x1b[36mv4.1.5 \x1b[39m\x1b[90m${probeProjects}/ufo\x1b[39m

 \x1b[32m✓\x1b[39m test/resolve.test.ts \x1b[2m(\x1b[22m\x1b[2m12 tests\x1b[22m\x1b[2m)\x1b[22m\x1b[32m 29\x1b[2mms\x1b[22m\x1b[39m
 \x1b[32m✓\x1b[39m test/url.test.ts \x1b[2m(\x1b[22m\x1b[2m6 tests\x1b[22m\x1b[2m)\x1b[22m\x1b[32m 29\x1b[2mms\x1b[22m\x1b[39m
 \x1b[32m✓\x1b[39m test/query.test.ts \x1b[2m(\x1b[22m\x1b[2m34 tests\x1b[22m\x1b[2m)\x1b[22m\x1b[32m 39\x1b[2mms\x1b[22m\x1b[39m
 \x1b[32m✓\x1b[39m test/trailing-slash.test.ts \x1b[2m(\x1b[22m\x1b[2m45 tests\x1b[22m\x1b[2m)\x1b[22m\x1b[32m 39\x1b[2mms\x1b[22m\x1b[39m
 \x1b[32m✓\x1b[39m test/parse.test.ts \x1b[2m(\x1b[22m\x1b[2m56 tests\x1b[22m\x1b[2m)\x1b[22m\x1b[32m 50\x1b[2mms\x1b[22m\x1b[39m
 \x1b[32m✓\x1b[39m test/join.test.ts \x1b[2m(\x1b[22m\x1b[2m45 tests\x1b[22m\x1b[2m)\x1b[22m\x1b[32m 38\x1b[2mms\x1b[22m\x1b[39m
 \x1b[32m✓\x1b[39m test/base.test.ts \x1b[2m(\x1b[22m\x1b[2m36 tests\x1b[22m\x1b[2m)\x1b[22m\x1b[32m 30\x1b[2mms\x1b[22m\x1b[39m
 \x1b[32m✓\x1b[39m test/encoding.test.ts \x1b[2m(\x1b[22m\x1b[2m58 tests\x1b[22m\x1b[2m)\x1b[22m\x1b[32m 38\x1b[2mms\x1b[22m\x1b[39m
 \x1b[32m✓\x1b[39m test/normalize.test.ts \x1b[2m(\x1b[22m\x1b[2m65 tests\x1b[22m\x1b[2m)\x1b[22m\x1b[32m 63\x1b[2mms\x1b[22m\x1b[39m
 \x1b[32m✓\x1b[39m test/double-slash.test.ts \x1b[2m(\x1b[22m\x1b[2m5 tests\x1b[22m\x1b[2m)\x1b[22m\x1b[32m 31\x1b[2mms\x1b[22m\x1b[39m
 \x1b[32m✓\x1b[39m test/utilities.test.ts \x1b[2m(\x1b[22m\x1b[2m98 tests\x1b[22m\x1b[2m)\x1b[22m\x1b[32m 66\x1b[2mms\x1b[22m\x1b[39m
 \x1b[32m✓\x1b[39m test/is-same.test.ts \x1b[2m(\x1b[22m\x1b[2m5 tests\x1b[22m\x1b[2m)\x1b[22m\x1b[32m 13\x1b[2mms\x1b[22m\x1b[39m
 \x1b[32m✓\x1b[39m test/punycode.test.ts \x1b[2m(\x1b[22m\x1b[2m24 tests\x1b[22m\x1b[2m)\x1b[22m\x1b[32m 24\x1b[2mms\x1b[22m\x1b[39m

${vitest4Signals.join("")}
`;
const pytestQuietSummary = "525 passed, 5 warnings, 12 subtests passed in 6.12s\n";
const pytestQuiet = `........................................................................ [ 13%]
...................................................................... [ 27%]
.............................................................. [ 38%]
........................................................................ [ 52%]
........................................................................ [ 66%]
........................................................................ [ 80%]
........................................................................ [ 93%]
.................................                                        [100%]
=============================== warnings summary ===============================
tests/test_funcutils_fb_py3.py::test_wraps_async
  ${probeProjects}/boltons/tests/test_funcutils_fb_py3.py:236: DeprecationWarning: 'asyncio.iscoroutinefunction' is deprecated and slated for removal in Python 3.16; use inspect.iscoroutinefunction() instead
    assert asyncio.iscoroutinefunction(f)

tests/test_funcutils_fb_py3.py::test_wraps_async
  ${probeProjects}/boltons/tests/test_funcutils_fb_py3.py:240: DeprecationWarning: 'asyncio.iscoroutinefunction' is deprecated and slated for removal in Python 3.16; use inspect.iscoroutinefunction() instead
    assert asyncio.iscoroutinefunction(f2)

tests/test_ioutils.py::TestMultiFileReader::test_open
  ${probeProjects}/boltons/tests/test_ioutils.py:561: DeprecationWarning: codecs.open() is deprecated. Use open() instead.
    utf8_file_str = codecs.open(CUR_FILE_PATH, encoding='utf8').read()

tests/test_ioutils.py::TestMultiFileReader::test_open
  ${probeProjects}/boltons/tests/test_ioutils.py:562: DeprecationWarning: codecs.open() is deprecated. Use open() instead.
    f1, f2 = (codecs.open(CUR_FILE_PATH, encoding='utf8'),

tests/test_ioutils.py::TestMultiFileReader::test_open
  ${probeProjects}/boltons/tests/test_ioutils.py:563: DeprecationWarning: codecs.open() is deprecated. Use open() instead.
    codecs.open(CUR_FILE_PATH, encoding='utf8'))

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
${pytestQuietSummary}`;

test("actual Vitest 4 ANSI and pytest-q capture bodies expose source-exact summary signals", () => {
  const blob = (text: string): string => createHash("sha1").update(`blob ${bytes(text)}\0`).update(text).digest("hex");
  for (const [oracle, command, input, expected, hash] of [
    ["vitest", "vitest run", vitest4, vitest4Signals, "e40b738143b5a03466ea41aea5c7d7328b2def30"],
    ["pytest", "pytest -q", pytestQuiet, [pytestQuietSummary], "a98e1fe635c69a6fb19b74d8c9768d9e83c6088f"],
  ] as const) {
    assert.equal(blob(input), hash, "Fixture must reproduce actual captured source bytes");
    assert.notEqual(blob(input + "\n"), hash, "Pinned capture integrity control must bite");
    const result = actual(command, input); assert.equal("replacement" in result, false);
    const found = verdict(oracle, input, result); green(found); assert.deepEqual(found.signals, expected);
    const output = input.replace(expected[0]!, "");
    red(verdict(oracle, input, replacement(input, output)), /native_signal/);
  }
  assert.ok(vitest4Signals.every((row) => row.includes("\x1b[")), "SGR inspection must retain raw colored signal rows");
  red(verdict("vitest", vitest4, replacement(vitest4, vitest4.replace(/\x1b\[[0-9;]*m/g, ""))), /no_replacement/);
});
