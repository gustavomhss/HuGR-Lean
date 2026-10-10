import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { filter } from "../src/core/engine.js";
import { tokenizeCommand } from "../src/core/command.js";
import { profiles } from "../src/profiles/index.js";
import { formatProfiles } from "../src/profiles/formats.js";
import { nodeTestProfile } from "../src/profiles/node-test.js";
import { familyProfiles as tscProfiles } from "../src/profiles/tsc.js";
import type { FilterResult, Observation, Reduction, Span } from "../src/types.js";
import { assertCorpusCoverage, readNativeCorpus } from "../scripts/native-corpus.mjs";

// Replay existing captures without rewriting bytes. Provenance, pinned donor
// paths/commit/license and native tool versions live in fixtures/*/SOURCES.md.
// These are corpus integration tests, not new native-tool conformance runs.
type Golden = { command: string; profile: string; expected?: string; expectedCRLF?: string };
const nativeRoot = "/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-runners/fixtures/runners/native";
const goldens: Readonly<Record<string, Golden>> = {
  "runners/cargo_test_success.txt": {
    command: "cargo test --color never", profile: "cargo-test",
    expected: "    Finished `test` profile [unoptimized + debuginfo] target(s) in 12.31s\n" +
      "     Running unittests main.rs (target/debug/deps/runner_fixture-d9245d9ac050ef78)\n" +
      "test tests::network ... ignored, needs network 🔥\n" +
      "test result: ok. 2 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.01s\n",
  },
  "runners/cargo_build_success.txt": {
    command: "cargo build --color never", profile: "cargo-build",
    expected: "    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.46s\n",
  },
  "runners/pytest_success.txt": {
    command: "python3 -m pytest --color=no", profile: "pytest",
    expected: "platform darwin -- Python 3.14.5, pytest-9.0.3, pluggy-1.6.0\n" +
      `rootdir: ${nativeRoot}\n` + "test_runners.py ..s                                                      [100%]\n" +
      "========================= 2 passed, 1 skipped in 0.06s =========================\n",
  },
  "runners/go_test_success.txt": {
    command: "go test -v", profile: "go-test-verbose",
    expected: "=== RUN   TestSkipped\n--- SKIP: TestSkipped (0.00s)\nPASS\nok  \texample.com/runners\t1.755s\n",
  },
  "runners/build_cargo_errors.txt": { command: "cargo build", profile: "cargo-build" },
  "runners/cargo_test_real_failures.txt": { command: "cargo test", profile: "cargo-test" },
  "runners/pytest_real_default.txt": { command: "pytest", profile: "pytest" },
  "formats/jest_all_passed.txt": {
    command: "jest --verbose", profile: "jest",
    expected: "PASS src/utils.test.js\n  ✓ should add numbers (5 ms)\n  ✓ should subtract numbers (2 ms)\n" +
      "  ✓ should multiply numbers (3 ms)\n  ✓ should divide numbers (4 ms)\n\nPASS src/helpers.test.js\n" +
      "  ✓ should format date (1 ms)\n  ✓ should parse JSON (2 ms)\n\nTest Suites: 2 passed, 2 total\n" +
      "Tests:       6 passed, 6 total\nTime:        0.8 s\n",
  },
  "formats/vitest_all_passed.txt": {
    command: "vitest run", profile: "vitest",
    expected: " ✓ test/utils.test.ts (3 tests) 200ms\n ✓ test/helpers.test.ts (2 tests) 150ms\n ✓ test/components.test.ts (4 tests) 300ms\n\n" +
      " Test Files  3 passed (3)\n      Tests  9 passed (9)\n   Start at  10:30:00\n   Duration  1.20s\n",
  },
  "formats/git_status_mixed.txt": {
    command: "git status", profile: "git-status",
    expected: "On branch main\nYour branch is up to date with 'origin/main'.\n\nChanges to be committed:\n" +
      "  modified:   src/main.rs\n  new file:   src/new_module.rs\n\nChanges not staged for commit:\n" +
      "  modified:   src/router.rs\n  deleted:    src/old_code.rs\n\nUntracked files:\n  scratchpad.txt\n  notes.md\n\n",
  },
  "formats/grep_single_file_multiple_matches.txt": {
    command: "rg -n --with-filename --regexp '' src", profile: "rg",
    expected: "src/main.rs:\n10:fn init() {\n25:fn process() {\n42:fn main() {\n58:fn cleanup() {\n",
    expectedCRLF: "src/main.rs:\n10:fn init() {\r\n25:fn process() {\r\n42:fn main() {\r\n58:fn cleanup() {\r\n",
  },
  "formats/jest_native.txt": {
    command: "jest --runInBand --verbose --no-color", profile: "jest",
    expected: "PASS ./jest-native.test.cjs\n  maths 🔥\n    ✓ adds café (7 ms)\n    nested\n" +
      "      ✓ keeps path: evidence (2 ms)\n\nTest Suites: 1 passed, 1 total\nTests:       2 passed, 2 total\n" +
      "Snapshots:   0 total\nTime:        1.022 s\nRan all test suites.\n",
  },
  "formats/vitest_native.txt": {
    command: "vitest run vitest-native.test.js --globals --no-color", profile: "vitest",
    expected: "\n RUN  v3.2.4 /private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-formats-native\n\n" +
      " ✓ vitest-native.test.js (2 tests) 5ms\n\n Test Files  1 passed (1)\n      Tests  2 passed (2)\n   Start at  00:23:02\n" +
      "   Duration  1.28s (transform 26ms, setup 0ms, collect 10ms, tests 5ms, environment 0ms, prepare 324ms)\n\n",
  },
  "formats/lint_tsc_errors.txt": { command: "tsc --pretty false", profile: "tsc" },
};

// Independent native semantic anchors, not an extraction of parser-declared
// spans or replacement goldens. Format names are critical per SOURCES.md;
// runner passing identities remain intentionally removable.
type Anchor = string | { text: string; occurrence: number };
const formatEvidence: Readonly<Record<string, readonly Anchor[]>> = {
  "formats/jest_all_passed.txt": [
    "PASS src/utils.test.js\n", "  ✓ should add numbers (5 ms)\n", "  ✓ should subtract numbers (2 ms)\n",
    "  ✓ should multiply numbers (3 ms)\n", "  ✓ should divide numbers (4 ms)\n", "PASS src/helpers.test.js\n",
    "  ✓ should format date (1 ms)\n", "  ✓ should parse JSON (2 ms)\n",
    "Test Suites: 2 passed, 2 total\n", "Tests:       6 passed, 6 total\n", "Time:        0.8 s\n",
  ],
  "formats/jest_native.txt": [
    "PASS ./jest-native.test.cjs\n", "  maths 🔥\n", "    ✓ adds café (7 ms)\n", "    nested\n", "      ✓ keeps path: evidence (2 ms)\n",
    "Test Suites: 1 passed, 1 total\n", "Tests:       2 passed, 2 total\n", "Snapshots:   0 total\n",
    "Time:        1.022 s\n", "Ran all test suites.\n",
  ],
  "formats/vitest_all_passed.txt": [
    " ✓ test/utils.test.ts (3 tests) 200ms\n", " ✓ test/helpers.test.ts (2 tests) 150ms\n", " ✓ test/components.test.ts (4 tests) 300ms\n",
    " Test Files  3 passed (3)\n", "      Tests  9 passed (9)\n", "   Start at  10:30:00\n", "   Duration  1.20s\n",
  ],
  "formats/vitest_native.txt": [
    " RUN  v3.2.4 /private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-formats-native\n",
    " ✓ vitest-native.test.js (2 tests) 5ms\n", " Test Files  1 passed (1)\n", "      Tests  2 passed (2)\n",
    "   Start at  00:23:02\n", "   Duration  1.28s (transform 26ms, setup 0ms, collect 10ms, tests 5ms, environment 0ms, prepare 324ms)\n",
  ],
  "formats/git_status_mixed.txt": [
    "On branch main\n", "Your branch is up to date with 'origin/main'.\n", "Changes to be committed:\n",
    "  modified:   src/main.rs\n", "  new file:   src/new_module.rs\n", "Changes not staged for commit:\n",
    "  modified:   src/router.rs\n", "  deleted:    src/old_code.rs\n", "Untracked files:\n", "  scratchpad.txt\n", "  notes.md\n",
  ],
  "formats/grep_single_file_multiple_matches.txt": [
    { text: "src/main.rs", occurrence: 0 }, "10:fn init() {\n", "25:fn process() {\n", "42:fn main() {\n", "58:fn cleanup() {\n",
  ],
};

const fixtureRoot = fileURLToPath(new URL("../fixtures/", import.meta.url));
function listFixtures(path = ""): string[] {
  const files: string[] = [];
  for (const item of readdirSync(join(fixtureRoot, path), { withFileTypes: true })) {
    // These two explicit namespaces have their own non-vacuous readers in the inventory test below.
    if (path === "" && (item.name === "utility" || item.name === "profiles")) continue;
    // Automatic native-view captures are replayed by tests/auto-*.test.ts and tests/automatic-*.test.ts.
    if (path === "" && item.name === "automatic") continue;
    const name = path ? `${path}/${item.name}` : item.name;
    assert.ok(item.isDirectory() || item.isFile(), `Cannot enumerate fixture entry: ${name}`);
    if (item.isDirectory()) files.push(...listFixtures(name));
    else if (item.name.endsWith(".txt")) files.push(name);
  }
  return files.sort();
}
// Historical .txt closure stays independent of native utility artifacts/source files.
const fixtureFiles = listFixtures();
const utilityReader = await import(new URL("../scripts/utility-corpus.mjs", import.meta.url).href);
const corpus = fixtureFiles.map((path) => {
  const golden = goldens[path];
  assert.ok(golden, `Fixture has no declared golden: ${path}`);
  const input = readFileSync(join(fixtureRoot, path), "utf8");
  assert.ok(input.length > 0, `Empty source fixture: ${path}`);
  return { ...golden, path, input };
});
const accepted = corpus.filter((entry) => entry.expected !== undefined);
const observation = (output: string, command: string, patch: Partial<Observation> = {}): Observation => ({
  source: "shell", command, output, termination: { kind: "exited", code: 0 },
  completeness: "complete", presentation: "unknown", ...patch,
});
function run(input: Observation): FilterResult {
  const before = structuredClone(input), result = filter(input); // Deliberately no injected options/registry.
  assert.deepEqual(input, before, "Production filtering must not mutate caller observation");
  assert.equal(result.inputBytes, Buffer.byteLength(input.output, "utf8"));
  return result;
}
const visible = (input: Observation, result: FilterResult): string => "replacement" in result ? result.replacement : input.output;
function exact(input: Observation, reason?: string, status: "passthrough" | "failed_open" = "passthrough"): void {
  const result = run(input);
  assert.equal(result.status, status, `${input.command}: ${JSON.stringify(input.output)}`);
  assert.equal("replacement" in result, false, "Exact passthrough must not offer a replacement");
  assert.equal(result.outputBytes, Buffer.byteLength(input.output, "utf8"));
  if (reason) assert.equal(result.reason, reason);
}
function reduced(input: Observation, expected: string, profile: string): void {
  const result = run(input);
  assert.equal(result.status, "reduced", input.command);
  if (result.status !== "reduced") assert.fail("Expected production registry reduction");
  assert.equal(result.profile, profile); assert.equal(result.replacement, expected);
  assert.equal(result.outputBytes, Buffer.byteLength(expected, "utf8"));
  assert.ok(result.outputBytes < result.inputBytes, "Accepted output must save UTF-8 bytes");
  assert.deepEqual(run(input), result, "Seed-independent deterministic filtering");
  const second = observation(expected, input.command, { presentation: input.presentation }), again = run(second);
  assert.equal(visible(second, again), expected, "Accepted output must be idempotent");
  assert.ok(again.outputBytes <= result.outputBytes, "Second pass must not expand output");
}

function covers(spans: readonly Span[], [start, end]: Span): boolean {
  let cursor = start;
  for (const [from, to] of spans) {
    if (to <= cursor) continue;
    if (from > cursor) return false;
    cursor = to;
    if (cursor >= end) return true;
  }
  return false;
}
function criticalRequired(output: string, reduction: Reduction, anchors: readonly Anchor[], label: string): void {
  assert.ok(anchors.length > 0, `${label}: empty critical native evidence`);
  const emitted: Span[] = [];
  let adjacent = false;
  for (const piece of reduction.pieces) {
    if ("text" in piece) { if (piece.text.length) adjacent = false; continue; }
    const previous = emitted.at(-1);
    if (adjacent && previous?.[1] === piece[0]) emitted[emitted.length - 1] = [previous[0], piece[1]];
    else emitted.push(piece);
    adjacent = true;
  }
  for (const span of [...reduction.required, ...emitted]) {
    assert.ok(Number.isSafeInteger(span[0]) && Number.isSafeInteger(span[1]) && span[0] >= 0 && span[0] < span[1] && span[1] <= output.length,
      `${label}: invalid UTF-16 source span ${span}`);
  }
  for (const anchor of anchors) {
    const text = (typeof anchor === "string" ? anchor : anchor.text).replace(/\r?\n/g, output.includes("\r\n") ? "\r\n" : "\n");
    const occurrence = typeof anchor === "string" ? 0 : anchor.occurrence;
    let start = -1;
    for (let index = 0; index <= occurrence; index++) { start = output.indexOf(text, start + 1); assert.ok(start >= 0, `${label}: missing native anchor ${JSON.stringify(text)}`); }
    if (typeof anchor === "string") assert.equal(output.indexOf(text, start + 1), -1, `${label}: ambiguous native anchor; declare occurrence`);
    const span: Span = [start, start + text.length], name = `${label}: critical native anchor ${JSON.stringify(text)} occurrence ${occurrence}`;
    assert.ok(covers(reduction.required, span), `${name} missing from required`);
    assert.ok(emitted.some(([from, to]) => from <= span[0] && to >= span[1]), `${name} not emitted intact by source pieces`);
  }
}
function formatRequired(input: Observation, id: string, anchors: readonly Anchor[]): void {
  const profile = profiles.find((item) => item.id === id);
  assert.ok(profile, `Missing production format profile: ${id}`);
  const reduction = profile.reduce(input.output, input);
  assert.ok(reduction, `${id}: expected an admitted native grammar`);
  criticalRequired(input.output, reduction, anchors, id);
}

test("every format profile has independent evidence coverage or explicit exact diagnostic passthrough", () => {
  assert.ok(formatProfiles.length > 0, "Empty format profile collection");
  const formats = corpus.filter((entry) => entry.path.startsWith("formats/"));
  assert.deepEqual([...new Set(formats.map((entry) => entry.profile))].sort(), formatProfiles.map((profile) => profile.id).sort());
  assert.deepEqual(Object.keys(formatEvidence).sort(), formats.filter((entry) => entry.expected !== undefined).map((entry) => entry.path).sort());
  for (const profile of formatProfiles) {
    assert.equal(profiles.find((item) => item.id === profile.id), profile.id === "tsc" ? tscProfiles[0] : profile);
  }
});
for (const entry of corpus.filter((item) => item.path.startsWith("formats/"))) test(`critical required format evidence: ${entry.path}`, () => {
  const input = observation(entry.input, entry.command), profile = profiles.find((item) => item.id === entry.profile);
  assert.ok(profile);
  if (entry.expected === undefined) {
    assert.equal(entry.profile, "tsc", "Undeclared format passthrough exception");
    assert.equal(profile.reduce(input.output, input), undefined);
    exact(input, "no_profile");
  } else {
    const anchors = formatEvidence[entry.path]; assert.ok(anchors, `Missing independent native evidence: ${entry.path}`);
    formatRequired(input, entry.profile, anchors);
    formatRequired({ ...input, output: entry.input.replace(/\r?\n/g, "\r\n") }, entry.profile, anchors);
  }
});
test("critical evidence oracle rejects missing declarations even with unchanged emitted pieces", () => {
  const output = "context\ncritical summary\n", boundary = output.indexOf("critical");
  const pieces: Span[] = [[0, boundary], [boundary, output.length]], anchors = ["critical summary\n"];
  criticalRequired(output, { pieces, required: pieces }, anchors, "control");
  assert.throws(() => criticalRequired(output, { pieces, required: [pieces[0]!] }, anchors, "control"), /critical native anchor.*missing from required/);
  assert.throws(() => criticalRequired(output, { pieces: [pieces[0]!], required: pieces }, anchors, "control"), /not emitted intact by source pieces/);
  const split = boundary + 4;
  criticalRequired(output, { pieces: [[boundary, split], [split, output.length]], required: [[boundary, output.length]] }, anchors, "adjacent control");
  assert.throws(() => criticalRequired(output, { pieces: [[boundary, split], { text: " " }, [split, output.length]], required: [[boundary, output.length]] }, anchors, "broken control"), /not emitted intact by source pieces/);
});

test("source fixture inventory and default production registry are nonempty and closed", async (t) => {
  assert.ok(fixtureFiles.length > 0, "Empty source fixture collection");
  assert.deepEqual(fixtureFiles, Object.keys(goldens).sort(), "Missing fixture or undeclared corpus case");
  assert.ok(accepted.length > 0, "Empty accepted corpus cannot prove production filtering");
  assert.ok(profiles.length > 0, "Empty production registry");
  const ids = profiles.map((profile) => profile.id).sort();
  assert.equal(new Set(ids).size, ids.length, "Duplicate production profile IDs");
  assert.equal(profiles.filter((profile) => profile === nodeTestProfile).length, 1, "Node profile must register exactly once");
  const utility = await utilityReader.readUtilityCorpus(join(fixtureRoot, "utility"));
  assert.deepEqual(utility.families.map((entry: { family: string }) => entry.family).sort(), ["cargo", "go", "node", "pytest"]);
  assert.equal(utility.cases.length, 25, "Independent native corpus contract changed");
  const delta = await readNativeCorpus(join(fixtureRoot, "profiles"));
  assert.deepEqual(ids, assertCorpusCoverage(profiles, [
    ...corpus.map(entry => ({ name: entry.path, family: entry.profile, status: "passthrough" as const,
      expected: entry.expected ?? entry.input, observation: observation(entry.input, entry.command), provenance: "legacy native corpus" })),
    ...utility.cases.map((entry: { qualifiedID: string; profile: string; expectedStatus: "reduced" | "passthrough"; expectedText: string; observation: Observation }) => ({
      name: `utility/${entry.qualifiedID}`, family: entry.profile, status: entry.expectedStatus,
      expected: entry.expectedText, observation: entry.observation, provenance: "authenticated utility corpus" })),
    ...delta,
  ], delta.exactFamilies).sort(), "Every shipped profile needs a corpus case");
  for (const entry of delta) {
    const result = run(entry.observation);
    assert.equal(result.status, entry.status, entry.name);
    assert.equal(visible(entry.observation, result), entry.expected, entry.name);
  }
  for (const family of utility.families) {
    assert.ok(family.cases.length > 0, `${family.family}: empty native family`);
    for (const entry of family.cases) {
      const profile = profiles.find((item) => item.id === entry.profile);
      assert.ok(profile, `${entry.qualifiedID}: missing real default profile`);
      const result = run(entry.observation);
      assert.equal(result.status, entry.expectedStatus, entry.qualifiedID);
      assert.equal(visible(entry.observation, result), entry.expectedText, entry.qualifiedID);
      if (entry.expectedStatus === "reduced") {
        const argv = tokenizeCommand(entry.command);
        assert.ok(argv, `${entry.qualifiedID}: unsupported literal command`);
        assert.equal(profile.match(argv), true, entry.qualifiedID);
        assert.equal(result.status === "reduced" && result.profile, entry.profile);
        const reduction = profile.reduce(entry.originalText, entry.observation);
        assert.ok(reduction, `${entry.qualifiedID}: missing native reduction`);
        criticalRequired(entry.originalText, reduction, entry.required, entry.qualifiedID);
      }
    }
  }
  t.diagnostic(`Existing capture replay: ${corpus.length} source fixtures, ${accepted.length} reduction goldens; profiles: ${ids.join(", ")}`);
});

for (const entry of corpus) test(`production golden: ${entry.path}`, () => {
  const input = observation(entry.input, entry.command);
  if (entry.expected === undefined) exact(input, unknownGrammarReason(entry.command));
  else if (["jest", "vitest"].includes(entry.profile)) {
    assert.equal(entry.expected, entry.input, `${entry.profile} golden must retain raw bytes`);
    exact(input, "not_smaller");
    exact({ ...input, output: entry.input.replaceAll("\n", "\r\n") }, "not_smaller");
    const colored = { ...input, output: `\x1b[32m${entry.input}\x1b[0m`, presentation: "terminal-rendered" as const };
    const result = run(colored);
    assert.equal(result.status, "normalized");
    assert.equal(visible(colored, result), entry.expected);
    assert.equal(result.outputBytes, Buffer.byteLength(entry.expected));
  }
  else {
    const crlf = entry.expectedCRLF ?? entry.expected.replaceAll("\n", "\r\n");
    const expected = entry.input.includes("\r\n") ? crlf : entry.expected;
    reduced(input, expected, entry.profile);
    const colored = { ...input, output: `\x1b[32m${entry.input}\x1b[0m`, presentation: "terminal-rendered" as const };
    // Tabs and any CR inhibit presentation normalization, preserving the stream.
    if (entry.input.includes("\t") || entry.input.includes("\r")) exact(colored, "unsupported_output");
    else reduced(colored, expected, entry.profile);
    reduced({ ...input, output: entry.input.replace(/\r?\n/g, "\r\n") }, crlf, entry.profile);
  }
});

test("production presentation-only normalization is idempotent and strictly smaller", () => {
  const entry = accepted.find((item) => item.profile === "cargo-build");
  assert.ok(entry?.expected, "Missing admitted standalone Cargo summary");
  const input = observation(`\x1b[32m${entry.expected}\x1b[0m`, entry.command, { presentation: "terminal-rendered" });
  const result = run(input);
  assert.equal(result.status, "normalized");
  assert.equal(visible(input, result), entry.expected);
  assert.equal(result.outputBytes, Buffer.byteLength(entry.expected, "utf8"));
  assert.ok(result.outputBytes < result.inputBytes);
  const second = observation(entry.expected, entry.command, { presentation: "terminal-rendered" });
  exact(second, "not_smaller");
});

const c1Fields = [
  ["formats/jest_native.txt", "./jest-native.test.cjs", "file path"],
  ["formats/jest_native.txt", "adds café", "test name"],
  ["formats/vitest_native.txt", "vitest-native.test.js", "file path"],
  ["formats/git_status_mixed.txt", "On branch main", "branch name"],
  ["formats/grep_single_file_multiple_matches.txt", "fn init() {", "match content"],
] as const;
for (const [path, field, label] of c1Fields) {
  const entry = corpus.find((item) => item.path === path);
  assert.ok(entry?.expected, `Missing reducing fixture: ${path}`);
  const expected = entry.expected;
  assert.ok(entry.input.includes(field) && expected.includes(field), `Missing dynamic field: ${path}`);
  const insert = (value: string) => entry.input.replace(field, field + value);
  test(`production ${entry.profile} ${label} ${["jest", "vitest"].includes(entry.profile) ? "preserves" : "reduces"} ordinary Unicode`, () => {
    const unicode = "漢字 e\u0301 🔥";
    if (["jest", "vitest"].includes(entry.profile)) exact(observation(insert(unicode), entry.command), "not_smaller");
    else reduced(observation(insert(unicode), entry.command), expected.replace(field, field + unicode), entry.profile);
  });
  test(`production ${entry.profile} ${label} preserves every C1 control exactly`, () => {
    if (["jest", "vitest"].includes(entry.profile)) exact(observation(entry.input, entry.command), "not_smaller");
    else reduced(observation(entry.input, entry.command), expected, entry.profile);
    const failures: string[] = [];
    for (let code = 0x80; code <= 0x9f; code++) {
      const output = insert(String.fromCodePoint(code)), bytes = Buffer.byteLength(output, "utf8");
      for (const presentation of ["unknown", "terminal-rendered"] as const) {
        const input = observation(output, entry.command, { presentation }), result = run(input);
        if (result.status !== "passthrough" || result.reason !== "unsupported_output" ||
          "replacement" in result || result.outputBytes !== bytes ||
          !Buffer.from(visible(input, result), "utf8").equals(Buffer.from(output, "utf8")))
          failures.push(`U+${code.toString(16).toUpperCase().padStart(4, "0")} (${presentation}): ${result.status}/${result.reason}`);
      }
    }
    assert.deepEqual(failures, [], `${entry.profile} ${label}: C1 controls must preserve public output`);
  });
}

test("common failure, incomplete, unknown, and missing metadata preserve entire corpus", () => {
  const variants: Partial<Observation>[] = [
    { termination: { kind: "exited", code: 1 } }, { termination: { kind: "exited", code: 137 } },
    { termination: { kind: "unknown" } }, { termination: { kind: "timed_out" } },
    { completeness: "truncated" }, { completeness: "unknown" }, { source: "other" },
  ];
  for (const entry of corpus) {
    for (const patch of variants) exact(observation(entry.input, entry.command, patch));
    for (const key of ["termination", "completeness", "presentation", "source"] as const) {
      const broken: Partial<Observation> = observation(entry.input, entry.command);
      delete broken[key];
      exact(broken as Observation, "invalid_observation", "failed_open");
    }
    const broken = { ...observation(entry.input, entry.command), termination: { kind: "exited" } };
    exact(broken as Observation, "invalid_observation", "failed_open");
  }
});

const unknownGrammarReason = (command: string) => command === "tsc --pretty false" ? "no_profile" : "unsupported_output";
test("commands dispatch by identity, not native-looking output", () => {
  const unknown = ["unknown test", "cat README.md", "read src/index.ts", "git diff", "npm test", "node script.js", "cargo test | tee report", "FOO=bar pytest"];
  for (const entry of corpus) {
    for (const command of unknown) exact(observation(entry.input, command));
    for (const other of corpus) if (other.profile !== entry.profile) exact(observation(entry.input, other.command), unknownGrammarReason(other.command));
  }
});

test("unknown/read/diff/repeated JSON and unsafe CR remain exact through every corpus command", () => {
  const json = '{"id":"🔥 café","rows":[1,1],"status":"PASS"}\n';
  const outputs = [
    "unknown tool output\nwarning: invoice saved 🔥\nwarning: invoice saved 🔥\n",
    'export const source = "PASS test";\n// café 🔥\nexport const source2 = "PASS test";\n',
    "diff --git a/café.ts b/café.ts\n--- a/café.ts\n+++ b/café.ts\n@@ -1 +1 @@\n-old 🔥\n+new 🔥\n",
    json.repeat(8), JSON.stringify({ duplicate: ["🔥", "🔥"], value: json }),
  ];
  for (const entry of corpus) {
    for (const output of outputs) for (const presentation of ["unknown", "terminal-rendered"] as const)
      exact(observation(output, entry.command, { presentation }), unknownGrammarReason(entry.command));
    for (const output of ["\rprogress\r" + entry.input, entry.input.replace(/\r?\n/, "\runsafe\r"), `\x1b[31m${entry.input}\x1b[0m\r`, "FAILx\rPASS!"])
      exact(observation(output, entry.command, { presentation: "terminal-rendered" }), unknownGrammarReason(entry.command));
  }
});

test("unknown lines inserted at every accepted record boundary force exact preservation", () => {
  for (const entry of accepted) {
    const boundaries = new Set([0, ...Array.from(entry.input.matchAll(/\n/g), (match) => match.index + 1)]);
    for (const offset of boundaries) for (const line of ["warning: keep invoice 🔥\n", "user log café\n"])
      exact(observation(entry.input.slice(0, offset) + line + entry.input.slice(offset), entry.command), "unsupported_output");
  }
});

test("Unicode paths and repeated ripgrep evidence preserve order, multiplicity, and CRLF bytes", () => {
  const input = "src/🔥 café.ts:7:https://example:x 🔥\r\nsrc/🔥 café.ts:7:https://example:x 🔥\r\nother/café.ts:2:other\r\nsrc/🔥 café.ts:9:last\r\nsrc/🔥 café.ts:10:\r\n";
  const expected = "src/🔥 café.ts:\n7:https://example:x 🔥\r\n7:https://example:x 🔥\r\nother/café.ts:2:other\r\nsrc/🔥 café.ts:\n9:last\r\n10:\r\n";
  assert.equal("🔥".length, 2); assert.equal(Buffer.byteLength("🔥", "utf8"), 4);
  reduced(observation(input, "rg -n term src"), expected, "rg");
  formatRequired(observation(input, "rg -n term src"), "rg", [
    { text: "src/🔥 café.ts", occurrence: 0 }, { text: "7:https://example:x 🔥\r\n", occurrence: 0 },
    { text: "7:https://example:x 🔥\r\n", occurrence: 1 }, "other/café.ts:2:other\r\n",
    { text: "src/🔥 café.ts", occurrence: 2 }, "9:last\r\n", "10:\r\n",
  ]);
});

function randomCorpus(seed: number, count: number): string[] {
  let state = seed >>> 0;
  const next = (): number => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; };
  const sample = (): string => {
    let point = next() % 0x110000;
    if (point >= 0xd800 && point <= 0xdfff) point += 0x800;
    return String.fromCodePoint(point);
  };
  const alphabet = ["a", "0", ":", " ", "\n", "\r", "\t", "\0", "\x1b[32m", "🔥", "café", "e\u0301", "漢字", "\u202e"];
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return "";
    if (index === 1) return "🔥 café e\u0301 漢字";
    if (index === 2) return "\0\r\n\t\x1b[32m\u202e";
    return Array.from({ length: next() % 80 }, () => next() % 2 ? alphabet[next() % alphabet.length]! : sample()).join("");
  });
}
test("1,000 seeded finite arbitrary UTF-8 strings stay exact across production registry", () => {
  const strings = randomCorpus(0x546873e, 1000);
  assert.equal(strings.length, 1000); assert.deepEqual(randomCorpus(0x546873e, 1000), strings);
  assert.notDeepEqual(randomCorpus(0x546873f, 1000), strings, "Seed oracle must detect a changed seed");
  assert.ok(strings.some((text) => text.includes("🔥"))); assert.ok(strings.some((text) => text.includes("\r")));
  const commands = [...new Set(corpus.map((entry) => entry.command))];
  assert.ok(commands.length > 0, "Empty command collection");
  for (const output of strings) {
    assert.equal(Buffer.from(output, "utf8").toString("utf8"), output, "Generator must emit Unicode scalar values");
    for (const command of commands) exact(observation(output, command, { presentation: "terminal-rendered" }), unknownGrammarReason(command));
    exact(observation(output, "unknown test"), "no_profile");
  }
});
