import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filter } from "../src/core/engine.js";
import { lines } from "../src/core/lines.js";
import { runnerProfiles } from "../src/profiles/runners.js";
import type { Observation, Profile, Reduction, Span } from "../src/types.js";

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/runners/${name}.txt`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

function observation(output: string, command: string): Observation {
  return { source: "shell", command, output, termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" };
}

function materialize(output: string, result: Reduction): string {
  const emitted: string[] = [];
  for (const piece of result.pieces) {
    assert.ok(!("text" in piece), "runner pieces must be source spans, never text pieces");
    assert.equal(piece.length, 2);
    assert.ok(Number.isInteger(piece[0]) && Number.isInteger(piece[1]));
    assert.ok(piece[0] >= 0 && piece[0] < piece[1] && piece[1] <= output.length);
    emitted.push(output.slice(...piece));
  }
  assert.ok(result.required.length > 0, "required evidence must not be vacuous");
  for (const required of result.required) {
    assert.ok(result.pieces.some((piece) => !("text" in piece) && piece[0] <= required[0] && piece[1] >= required[1]),
      `required source span ${required} must actually be emitted`);
  }
  return emitted.join("");
}

function requiredSpan(result: Reduction, span: Span, label: string): void {
  assert.ok(result.required.some((required) => required[0] === span[0] && required[1] === span[1]),
    `${label} source span ${span} must belong to required`);
}

function requiredEvidence(input: string, result: Reduction, expected: string): void {
  const source = lines(input);
  const summary = source.filter((line) => line.text !== "").at(-1);
  assert.ok(summary, "supported native output must contain its final summary");
  requiredSpan(result, summary.span, "native final summary");
  // Expected retained rows include every skip/diagnostic row and any context.
  // Passing identities deliberately absent from expected output are not required.
  for (const retained of lines(expected)) {
    const original = source.find((line) => line.text === retained.text);
    assert.ok(original, `retained evidence must be source-backed: ${retained.text}`);
    requiredSpan(result, original.span, `retained evidence ${retained.text}`);
  }
}

const root = "/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-runners/fixtures/runners/native";
const cases = [
  {
    id: "cargo-test", argv: ["cargo", "test", "--color", "never"], file: "cargo_test_success",
    expected: "    Finished `test` profile [unoptimized + debuginfo] target(s) in 12.31s\n" +
      "     Running unittests main.rs (target/debug/deps/runner_fixture-d9245d9ac050ef78)\n" +
      "test tests::network ... ignored, needs network 🔥\n" +
      "test result: ok. 2 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.01s\n",
  },
  {
    id: "cargo-build", argv: ["cargo", "build", "--color", "never"], file: "cargo_build_success",
    expected: "    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.46s\n",
  },
  {
    id: "pytest", argv: ["python3", "-m", "pytest", "--color=no"], file: "pytest_success",
    expected: "platform darwin -- Python 3.14.5, pytest-9.0.3, pluggy-1.6.0\n" +
      `rootdir: ${root}\n` + "test_runners.py ..s                                                      [100%]\n" +
      "========================= 2 passed, 1 skipped in 0.06s =========================\n",
  },
  {
    id: "go-test-verbose", argv: ["go", "test", "-v"], file: "go_test_success",
    expected: "=== RUN   TestSkipped\n--- SKIP: TestSkipped (0.00s)\nPASS\nok  \texample.com/runners\t1.755s\n",
  },
] as const;

function profile(id: string): Profile {
  const found = runnerProfiles.find((entry) => entry.id === id);
  assert.ok(found, `missing profile ${id}`);
  return found;
}

function supportedObservation(id: string, input: string): Observation {
  const entry = cases.find((item) => item.id === id);
  assert.ok(entry, `missing supported native command for ${id}`);
  assert.equal(profile(id).match(entry.argv), true, `grammar oracle requires supported argv: ${entry.argv.join(" ")}`);
  return observation(input, entry.argv.join(" "));
}

function accepted(id: string, input: string, expected: string): Reduction {
  const obs = supportedObservation(id, input);
  const result = profile(id).reduce(input, obs);
  assert.ok(result, `${id} should accept supported output`);
  assert.equal(materialize(input, result), expected);
  requiredEvidence(input, result, expected);
  assert.ok(Buffer.byteLength(expected, "utf8") < Buffer.byteLength(input, "utf8"));
  const filtered = filter(obs);
  assert.equal(filtered.status, "reduced", `${id}: default registry must reduce supported output`);
  if (filtered.status !== "reduced") assert.fail("Expected default registry reduction");
  assert.equal(filtered.profile, id);
  assert.equal(filtered.replacement, expected);
  assert.equal(filtered.inputBytes, Buffer.byteLength(input, "utf8"));
  assert.equal(filtered.outputBytes, Buffer.byteLength(expected, "utf8"));
  return result;
}

function exact(obs: Observation): void {
  const filtered = filter(obs);
  assert.equal(filtered.status, "passthrough", `${obs.command}: ${obs.output}`);
  assert.equal("replacement" in filtered, false);
  assert.equal(filtered.inputBytes, Buffer.byteLength(obs.output, "utf8"));
  assert.equal(filtered.outputBytes, filtered.inputBytes);
}

function rejected(id: string, input: string): void {
  const obs = supportedObservation(id, input);
  assert.equal(profile(id).reduce(input, obs), undefined, `${id} admitted unsupported output: ${input}`);
  exact(obs);
}

test("identities use exact argv and closed flag support", () => {
  assert.deepEqual(runnerProfiles.map((item) => item.id), cases.map((item) => item.id));
  const positive: Record<string, string[][]> = {
    "cargo-test": [["cargo", "test"], ["cargo", "test", "--color", "never"], ["cargo", "test", "--color=never"]],
    "cargo-build": [["cargo", "build"], ["cargo", "build", "--color=never"]],
    pytest: [["pytest"], ["python", "-m", "pytest"], ["python3", "-m", "pytest", "--color=no"], ["pytest", "-q"]],
    "go-test-verbose": [["go", "test", "-v"], ["go", "test", "-v", "."], ["go", "test", "-v", "./..."]],
  };
  const negative = [[], ["echo", "cargo test"], ["echo", "pytest"], ["cargo-test"], ["cargo", "check"],
    ["cargo", "test", "--message-format=json"], ["cargo", "build", "--release"], ["cargo", "test", "--", "--nocapture"],
    ["cargo", "test", "--color", "always"], ["pytest", "-v"], ["pytest", "--version"],
    ["pytest", "--junitxml=out.xml"], ["python", "-m", "other", "pytest"], ["python3", "-c", "pytest"],
    ["go", "test"], ["go", "test", "-json", "-v"], ["go", "test", "-v", "-race"],
    ["cargo", "test", "&&", "echo"], ["pytest", "|", "cat"], ["/tmp/pytest"], ["notcargo", "test"]];
  for (const entry of runnerProfiles) {
    for (const argv of positive[entry.id]!) assert.equal(entry.match(argv), true, argv.join(" "));
    for (const argv of negative) assert.equal(entry.match(argv), false, `${entry.id}: ${argv.join(" ")}`);
    for (const other of cases) if (other.id !== entry.id) assert.equal(entry.match(other.argv), false);
  }
});

for (const entry of cases) {
  test(`${entry.id}: native success retains exact summaries and required evidence`, (t) => {
    const input = fixture(entry.file);
    accepted(entry.id, input, entry.expected);
    assert.equal(Buffer.byteLength("🔥", "utf8"), 4);
    assert.equal("🔥".length, 2);
    t.diagnostic(`UTF-8 bytes: ${Buffer.byteLength(input, "utf8")} -> ${Buffer.byteLength(entry.expected, "utf8")}`);
  });

  test(`${entry.id}: CRLF and complete unterminated summary retain exact source`, () => {
    accepted(entry.id, fixture(entry.file).replace(/\n/g, "\r\n"), entry.expected.replace(/\n/g, "\r\n"));
    accepted(entry.id, fixture(entry.file).trimEnd(), entry.expected.trimEnd());
  });

  test(`${entry.id}: failed, incomplete and unknown observations stay exact`, () => {
    const input = fixture(entry.file);
    const base = supportedObservation(entry.id, input);
    const variants: Observation[] = [
      { ...base, termination: { kind: "exited", code: 1 } },
      { ...base, termination: { kind: "exited", code: 5 } },
      { ...base, termination: { kind: "unknown" } },
      { ...base, termination: { kind: "timed_out" } },
      { ...base, completeness: "truncated" }, { ...base, completeness: "unknown" }, { ...base, source: "other" },
    ];
    for (const variant of variants) {
      assert.equal(profile(entry.id).reduce(input, variant), undefined);
      exact(variant);
    }
  });

  test(`${entry.id}: unknown user logs and warnings rejected at every line boundary`, () => {
    const input = fixture(entry.file);
    const boundaries = new Set([0, ...lines(input).map((line) => line.span[1])]);
    for (const offset of boundaries) {
      for (const log of ["user invoice log 🔥\n", "warning: important warning\n", "PASS test user log\n"]) {
        rejected(entry.id, input.slice(0, offset) + log + input.slice(offset));
      }
    }
  });

  test(`${entry.id}: multiple suites, foreign grammar, control bytes and empty output rejected`, () => {
    const input = fixture(entry.file);
    for (const variant of [input + input, "", "\n", "\x1b[32m" + input, "\0" + input, "\r" + input]) rejected(entry.id, variant);
    for (const other of cases) if (entry.id !== other.id) rejected(entry.id, fixture(other.file));
  });
}

test("pinned real donor failures remain exact even with incorrect zero exit", () => {
  const donors = [
    ["cargo-build", "build_cargo_errors", "01c4d6b98b3b6dad3962f33bd17d7b64a6e15478"],
    ["cargo-test", "cargo_test_real_failures", "66f4a414ea48ac742288f280d54f0d5446e0221f"],
    ["pytest", "pytest_real_default", "e73456c12b7fc523378262a82cbaf14c99142caf"],
  ];
  for (const [id, file, sha] of donors) {
    const input = fixture(file!);
    const blob = `blob ${Buffer.byteLength(input, "utf8")}\0${input}`;
    assert.equal(createHash("sha1").update(blob, "utf8").digest("hex"), sha);
    rejected(id!, input);
    assert.equal(profile(id!).reduce(input, { ...supportedObservation(id!, input), termination: { kind: "exited", code: 1 } }), undefined);
  }
});

test("cargo-test rejects malformed totals, duplicate tests, failed and incomplete suites", () => {
  const input = fixture("cargo_test_success");
  const variants = [
    input.replace("running 3 tests", "running 4 tests"), input.replace("running 3 tests", "running 3 test"),
    input.replace("2 passed;", "3 passed;"), input.replace("1 ignored;", "0 ignored;"),
    input.replace("0 failed;", "1 failed;"), input.replace("0 measured;", "1 measured;"),
    input.replace("0 filtered out;", "9007199254740993 filtered out;"), input.replace("2 passed;", "02 passed;"),
    input.replace("test tests::café", "test tests::arithmetic"), input.replace(" ... ok", " ... FAILED"),
    input.slice(0, input.indexOf("test result:")), input.replace("`test` profile", "test"),
    input.replace("     Running unittests", "   Doc-tests"),
  ];
  for (const variant of variants) { assert.notEqual(variant, input); rejected("cargo-test", variant); }
});

test("cargo-build rejects diagnostics, unsupported finish variants and missing finish", () => {
  const input = fixture("cargo_build_success");
  for (const variant of [input.replace("`dev`", "`release`"), input.replace("unoptimized + debuginfo", "optimized"),
    input.slice(0, input.indexOf("    Finished")), input.replace("   Compiling", "    Checking"),
    input.replace("    Finished", "warning: unused variable\n    Finished")]) {
    assert.notEqual(variant, input); rejected("cargo-build", variant);
  }
});

test("pytest rejects malformed summaries, percentages, versions, reporters and plugins", () => {
  const input = fixture("pytest_success");
  const variants = [input.replace("collected 3 items", "collected 4 items"), input.replace("2 passed,", "3 passed,"),
    input.replace("1 skipped in", "0 skipped in"), input.replace("[100%]", "[99%]"),
    input.replace("collected 3 items", "collected 3 item"), input.replace("collected 3 items", "collected 03 items"),
    input.replace("pytest-9.0.3", "pytest-99.0.0"), input.replace("pluggy-1.6.0", "pluggy-2.0.0"),
    input.replace("collected 3 items", "plugins: asyncio-1.4.0\ncollected 3 items"),
    input.replace("..s", ".Fs"), input.replace("..s", ".xs"), input.replace("..s", "..E"),
    input.replace("test_runners.py ..s", "test_runners.py::test_one PASSED"),
    input.replace("test_runners.py ..s", "..s"), input.slice(0, input.lastIndexOf("=========================")),
    input.slice(input.indexOf("test_runners.py"))];
  for (const variant of variants) { assert.notEqual(variant, input); rejected("pytest", variant); }
});

test("go rejects failure, nesting, parallel and malformed output", () => {
  const input = fixture("go_test_success");
  const variants = [input.replace("--- PASS: TestArithmetic", "--- FAIL: TestArithmetic"), input.replace("\nPASS\n", "\nFAIL\n"),
    input.replace("--- PASS: TestArithmetic", "--- PASS: TestWrong"), input.replace(/TestCafé/g, "TestArithmetic"),
    input.replace(/TestCafé/g, "TestCafé/subtest"), input.replace("--- PASS: TestArithmetic", "=== PAUSE TestArithmetic\n--- PASS: TestArithmetic"),
    input.replace("\nPASS\n", "\n"), input.replace("ok  \t", "ok "),
    input.slice(0, input.indexOf("\nok  \t"))];
  for (const variant of variants) { assert.notEqual(variant, input); rejected("go-test-verbose", variant); }
});

test("go retains diagnostic RUN/result context, skip reasons and cached summary as required source", () => {
  const entry = cases[3], input = fixture(entry.file);
  const passing = "=== RUN   TestArithmetic\n    runners_test.go:8: saved invoice 🔥\n--- PASS: TestArithmetic (0.00s)\n";
  const diagnostic = input.replace("=== RUN   TestArithmetic\n--- PASS: TestArithmetic (0.00s)\n", passing)
    .replace("--- SKIP: TestSkipped", "    runners_test.go:15: needs network 🔥\n--- SKIP: TestSkipped")
    .replace("1.755s", "(cached)");
  const expected = passing + entry.expected.replace("--- SKIP: TestSkipped", "    runners_test.go:15: needs network 🔥\n--- SKIP: TestSkipped")
    .replace("1.755s", "(cached)");
  accepted(entry.id, diagnostic, expected);
  accepted(entry.id, diagnostic.replaceAll("\n", "\r\n"), expected.replaceAll("\n", "\r\n"));
  accepted(entry.id, input.replace("1.755s", "(cached)"), entry.expected.replace("1.755s", "(cached)"));
});

test("cargo accepted Unicode prefix uses UTF-16 spans, not byte offsets", () => {
  const entry = cases[0];
  const input = fixture(entry.file).replace(root, `${root}/🔥café`);
  accepted(entry.id, input, entry.expected);
});

test("cargo stream validates 1,000 Unicode passing rows and retains ignored evidence exactly", () => {
  const entry = cases[0];
  const passing = Array.from({ length: 1000 }, (_, index) => `test tests::𐐀café_${index} ... ok\n`).join("");
  const input = fixture(entry.file).replace(root, `${root}/🔥café`)
    .replace("test tests::arithmetic ... ok\n", passing).replace("test tests::café ... ok\n", "")
    .replace("running 3 tests", "running 1001 tests").replace("2 passed;", "1000 passed;");
  const expected = entry.expected.replace("2 passed;", "1000 passed;");
  accepted(entry.id, input, expected);
  accepted(entry.id, input.replaceAll("\n", "\r\n"), expected.replaceAll("\n", "\r\n"));
  accepted(entry.id, input.trimEnd(), expected.trimEnd());
  rejected(entry.id, input.replace("test tests::𐐀café_999", "test tests::𐐀café_0"));
  rejected(entry.id, input.replace("running 1001 tests", "running 1002 tests"));
  rejected(entry.id, input.replace("test tests::𐐀café_999", "captured log 🔥\ntest tests::𐐀café_999"));
});

test("cargo consumes the entire tail and keeps build EOF stricter than test blank tails", () => {
  const entry = cases[0], input = fixture(entry.file), tail = "\n".repeat(1000);
  accepted(entry.id, input + tail, entry.expected);
  for (const extra of ["captured output 🔥\n", input, "running 0 tests\n", "test tests::late ... ok\n"]) {
    rejected(entry.id, input + tail + extra);
  }
  rejected("cargo-build", fixture("cargo_build_success") + tail);
  const emptySuite = input.replace("running 3 tests", "running 0 tests")
    .replace(/^test tests::.*\n/gm, "").replace("2 passed;", "0 passed;").replace("1 ignored;", "0 ignored;");
  const emptyExpected = entry.expected.replace(/^test tests::.*\n/gm, "")
    .replace("2 passed;", "0 passed;").replace("1 ignored;", "0 ignored;");
  accepted(entry.id, emptySuite, emptyExpected);
});

test("pytest successful rows removed but skip rows, Unicode paths and configuration retained", () => {
  const entry = cases[2];
  const input = fixture(entry.file).replace("test_runners.py ..s", "test_runners.py .                      [ 33%]\ntests/🔥café.py .s")
    .replace(`rootdir: ${root}`, `rootdir: ${root}/🔥 café\nconfigfile: pyproject.toml`);
  const expected = entry.expected.replace("test_runners.py ..s", "tests/🔥café.py .s")
    .replace(`rootdir: ${root}`, `rootdir: ${root}/🔥 café\nconfigfile: pyproject.toml`);
  accepted(entry.id, input, expected);
});

test("single-test and all-skip native totals remain evidence, not synthesized counts", () => {
  const cargoEntry = cases[0];
  const cargoInput = fixture(cargoEntry.file).replace("running 3 tests", "running 1 test")
    .replace("test tests::arithmetic ... ok\n", "").replace("test tests::café ... ok\n", "").replace("2 passed;", "0 passed;");
  accepted(cargoEntry.id, cargoInput, cargoEntry.expected.replace("2 passed;", "0 passed;"));
  const pytestEntry = cases[2];
  const pytestInput = fixture(pytestEntry.file).replace("collected 3 items", "collected 1 item")
    .replace("..s", "s").replace("2 passed, 1 skipped", "1 skipped");
  accepted(pytestEntry.id, pytestInput, pytestEntry.expected.replace("..s", "s").replace("2 passed, 1 skipped", "1 skipped"));
});

test("required-span test oracle rejects an omitted required summary", () => {
  assert.throws(() => materialize("progress\nsummary\n", { pieces: [[0, 9]], required: [[9, 17]] }),
    /required source span.*must actually be emitted/);
});

test("required-evidence oracle rejects emitted summary, skip or diagnostic missing from required", () => {
  const input = "test tests::network ... ignored, needs network 🔥\nwarning: calibration diagnostic\nsummary\n";
  const [skip, diagnostic, summary] = lines(input);
  assert.ok(skip && diagnostic && summary);
  const pieces = [skip.span, diagnostic.span, summary.span];
  const omissions = [
    [[skip.span, diagnostic.span], "native final summary"],
    [[diagnostic.span, summary.span], "retained evidence test"],
    [[skip.span, summary.span], "retained evidence warning"],
  ] as const;
  for (const [required, missing] of omissions) {
    const result: Reduction = { pieces, required };
    assert.equal(materialize(input, result), input);
    assert.throws(() => requiredEvidence(input, result, input), new RegExp(`${missing}.*must belong to required`));
  }
});

test("runner materializer rejects text pieces even when they repeat source evidence", () => {
  assert.throws(() => materialize("summary\n", { pieces: [{ text: "summary\n" }], required: [[0, 8]] }),
    /runner pieces must be source spans, never text pieces/);
});
