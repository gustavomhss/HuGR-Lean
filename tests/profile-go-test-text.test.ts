import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { filter } from "../src/core/engine.js";
import { tokenizeCommand } from "../src/core/command.js";
import { lines } from "../src/core/lines.js";
import type { Observation, Reduction } from "../src/core/types.js";
import { familyProfiles } from "../src/profiles/go-test-text.js";
import { goProfile } from "../src/profiles/go.js";

const root = new URL("../fixtures/profiles/go-test-text/", import.meta.url);
const read = (file: string): string => readFileSync(new URL(file, root), "utf8");
interface Case {
  name: string; command: string; file: string; expectedFile: string;
  status: "reduced" | "passthrough"; provenance: { sha256: string };
  historicalProposalFile?: string;
}
const manifest: { schema: string; cases: Case[] } = JSON.parse(read("cases.json"));
const positives = ["literal-selector", "literal-nested", "literal-count", "literal-race-cover-count-run", "quiet-parallel", "mixed-parallel"];
function entry(id: string): Case {
  const found = manifest.cases.find(c => c.name === "G01/" + id);
  assert.ok(found, id);
  return found;
}
function observation(output: string, command: string): Observation {
  return { source: "shell", command, output, termination: { kind: "exited", code: 0 },
    completeness: "complete", presentation: "unknown" };
}
function exact(obs: Observation): void {
  const result = filter(obs, { profiles: familyProfiles });
  assert.equal(result.status, "passthrough", `${obs.command}\n${obs.output}`);
  assert.equal("replacement" in result, false);
  assert.equal(result.outputBytes, Buffer.byteLength(obs.output));
}
function spans(output: string, reduced: Reduction, expected: string): void {
  const emitted = reduced.pieces.map(piece => {
    assert.ok(Array.isArray(piece), "dynamic text must be source spans");
    return output.slice(...piece);
  }).join("");
  assert.equal(emitted, expected, "independent golden must be emitted, not merely declared required");
  let cursor = 0;
  for (const row of lines(expected)) {
    const original = lines(output).find(source => source.span[0] >= cursor && source.text === row.text);
    assert.ok(original, "golden row must have chronological source occurrence");
    assert.ok(reduced.required.some(span => span[0] === original.span[0] && span[1] === original.span[1]));
    cursor = original.span[1];
  }
}
function accepted(id: string, output = read(entry(id).file), expected = read(entry(id).expectedFile)): void {
  const obs = observation(output, entry(id).command);
  const result = filter(obs, { profiles: familyProfiles });
  assert.equal(result.status, "reduced", id);
  if (result.status !== "reduced") assert.fail("expected admitted native reduction");
  assert.equal(result.replacement, expected);
  assert.equal(result.profile, "go-test-verbose");
  assert.equal(result.inputBytes, Buffer.byteLength(output));
  assert.equal(result.outputBytes, Buffer.byteLength(expected));
  const reduced = familyProfiles[0]!.reduce(output, obs);
  assert.ok(reduced);
  spans(output, reduced, expected);
}

test("G01 native corpus pins and independent goldens are complete and nonvacuous", () => {
  assert.equal(manifest.schema, "hugr-lean/native-cases/1");
  assert.equal(new Set(manifest.cases.map(c => c.name)).size, manifest.cases.length);
  assert.deepEqual(readdirSync(root).filter(name => name.endsWith(".txt")).sort(),
    manifest.cases.flatMap(c => [c.file, c.expectedFile, ...(c.historicalProposalFile ? [c.historicalProposalFile] : [])]).sort());
  for (const c of manifest.cases) {
    const output = read(c.file), expected = read(c.expectedFile);
    assert.ok(output.length && expected.length);
    assert.equal(createHash("sha256").update(output).digest("hex"), c.provenance.sha256);
    let cursor = 0;
    for (const row of lines(expected)) {
      const source = lines(output).find(line => line.span[0] >= cursor && line.text === row.text);
      assert.ok(source, c.name + ": independent golden source row");
      cursor = source.span[1];
    }
    if (c.status === "passthrough") assert.equal(expected, output);
    else assert.ok(Buffer.byteLength(expected) < Buffer.byteLength(output));
    const result = filter(observation(output, c.command), { profiles: familyProfiles });
    assert.equal(result.status, c.status, c.name + ": runtime disposition must match manifest");
    if (result.status === "reduced") assert.equal(result.replacement, expected);
    else { assert.equal("replacement" in result, false); assert.equal(expected, output); }
    if (c.historicalProposalFile) {
      const proposal = read(c.historicalProposalFile);
      assert.ok(Buffer.byteLength(proposal) < Buffer.byteLength(output));
      assert.equal(tokenizeCommand(c.command), undefined, "historical proposals are unsupported-command witnesses");
      let position = 0;
      for (const row of lines(proposal)) {
        const source = lines(output).find(line => line.span[0] >= position && line.text === row.text);
        assert.ok(source, "historical proposal remains an ordered source-backed subset");
        position = source.span[1];
      }
    }
  }
});

for (const id of positives) {
  test(`G01 ${id}: original delegate red, public custom profile native golden green`, () => {
    const c = entry(id), obs = observation(read(c.file), c.command);
    assert.equal(filter(obs, { profiles: [goProfile] }).status, "passthrough", "baseline must not already admit delta");
    accepted(id);
  });
  test(`G01 ${id}: failed/incomplete/unknown metadata exact`, () => {
    const c = entry(id), obs = observation(read(c.file), c.command);
    const variants: Observation[] = [
      { ...obs, source: "other" }, { ...obs, completeness: "unknown" }, { ...obs, completeness: "truncated" },
      { ...obs, termination: { kind: "timed_out" } }, { ...obs, termination: { kind: "unknown" } },
      { ...obs, termination: { kind: "exited", code: 1 } },
    ];
    for (const variant of variants) {
      exact(variant);
      assert.equal(familyProfiles[0]!.reduce(variant.output, variant), undefined);
    }
  });
  test(`G01 ${id}: unbound unknown/native-shaped injections refuse at every boundary`, () => {
    const c = entry(id), output = read(c.file);
    for (const offset of [0, ...lines(output).map(row => row.span[1])]) {
      for (const text of ["invoice log 🧭\n", "warning: unbound evidence\n", "=== RUN   TestPretend\n", "=== NAME  TestMissing\n"]) {
        exact(observation(output.slice(0, offset) + text + output.slice(offset), c.command));
      }
    }
  });
  test(`G01 ${id}: controls, missing boundaries, unknown tail and bad summaries exact`, () => {
    const c = entry(id), output = read(c.file);
    for (const changed of ["", "\n", output + "tail\n", output + output, output.replace(/\nPASS\n/, "\n"),
      output.replace(/^ok  \t.*\n/m, ""), output.replace("ok  \t", "ok \t"), output.replace(/\d+\.\d+s(?=\t|\n|$)/g, "NaNs"),
      ...["\0", "\x1b[32m", "\x85", "\r"].map(prefix => prefix + output)]) {
      exact(observation(changed, c.command));
    }
    accepted(id, output.replaceAll("\n", "\r\n"), read(c.expectedFile).replaceAll("\n", "\r\n"));
  });
}

test("G01 frozen routing validates literal selectors, numeric bounds and flag arities", () => {
  assert.deepEqual(familyProfiles.map(p => p.id), ["go-test-verbose"]);
  for (const id of positives) assert.equal(familyProfiles[0]!.match(tokenizeCommand(entry(id).command)!), true);
  const input = read(entry("literal-selector").file);
  const commands = ["go test -json -v -run TestNested/group/quiet .", "go test -v -bench TestNested .",
    "go test -v -run Other .", "go test -v -run", "go test -v -run= .", "go test -v -run TestNested . -count 2",
    "go test -v -run TestNested -count=0 .", "go test -v -run TestNested -count=02 .", "go test -v -run TestNested -count=101 .",
    "go test -v -run TestNested -count=9007199254740993 .", "go test -v -run TestNested -parallel=257 .",
    "go test -v -run TestNested -parallel=0 .", "go test -v -run TestNested -parallel=01 .",
    "go test -v -run TestNested//quiet .", "go test -v -run TestNested.group .",
    "go test -v -run TestNested -count .", "go test -v -v -run TestNested .", "go test -v=true -run TestNested .",
    "go test -v -run TestNested -unknown .", "go test -v -run TestNested ./...",
    "env go test -v -run TestNested .", "go test -v -run TestNested . && echo done"];
  for (const command of commands) {
    exact(observation(input, command));
    const argv = tokenizeCommand(command);
    if (argv) assert.equal(familyProfiles[0]!.match(argv), command === "go test -v -run Other .", command);
  }
  for (const c of manifest.cases.filter(c => /[\^$]/.test(c.command))) {
    assert.equal(tokenizeCommand(c.command), undefined, "lead-owned tokenizer boundary");
    exact(observation(read(c.file), c.command));
  }
});

test("G01 default, nonverbose coverage, empty selector and collision exact", () => {
  for (const id of ["default", "cover-default", "selector-empty", "literal-collision", "name-switch"]) {
    const c = entry(id);
    exact(observation(read(c.file), c.command));
  }
  const c = entry("mixed-parallel"), output = read(c.file);
  const loggedOnly = output.slice(0, output.indexOf("=== RUN   TestParallelQuiet")) + output.slice(output.lastIndexOf("\nPASS\n") + 1);
  exact(observation(loggedOnly, c.command));
});

test("G01 count validates complete occurrences and coverage records agree with argv", () => {
  const c = entry("literal-count"), input = read(c.file);
  exact(observation(input, c.command.replace("-count 2", "-count 1")));
  exact(observation(input.slice(input.indexOf("=== RUN   TestNested", 1)), c.command));
  const cover = entry("literal-race-cover-count-run"), output = read(cover.file);
  for (const changed of [output.replace("coverage: 100.0%", "coverage: 99.0%"),
    output.replaceAll("100.0%", "101.0%"), output.replace(/^coverage:.*\n/m, ""),
    output.replace(/\tcoverage:.*\n$/, "\n"), output.replace("--- PASS:", "--- FAIL:")]) exact(observation(changed, cover.command));
});

test("G01 child/parent closure and pause/continue state are validated before quiet removal", () => {
  const c = entry("quiet-parallel"), input = read(c.file);
  const changes = [
    input.replace("=== PAUSE TestParallelQuiet/one\n", ""),
    input.replace("=== CONT  TestParallelQuiet/one\n", ""),
    input.replace("=== CONT  TestParallelQuiet/one", "=== CONT  TestParallelQuiet/missing"),
    input.replace("=== CONT  TestParallelQuiet/one\n", "=== CONT  TestParallelQuiet/one\n=== CONT  TestParallelQuiet/one\n"),
    input.replace("    --- PASS: TestParallelQuiet/one", "--- PASS: TestParallelQuiet/one"),
    input.replace("    --- PASS: TestParallelQuiet/one (0.00s)\n", ""),
    input.replace("--- PASS: TestParallelQuiet (0.00s)\n", ""),
    input.replace("=== RUN   TestParallelQuiet/two", "=== RUN   TestParallelQuiet/one"),
    input.replace("=== RUN   TestParallelQuiet\n", "=== PAUSE TestParallelQuiet\n"),
    input.replace("--- PASS: TestParallelQuiet (0.00s)", "--- PASS: TestParallelQuiet (" + "9".repeat(400) + "s)"),
    input.replace("=== CONT  TestParallelQuiet/two\n", "=== CONT  TestParallelQuiet/two\n=== RUN   TestParallelQuiet/late\n"),
  ];
  for (const changed of changes) { assert.notEqual(changed, input); exact(observation(changed, c.command)); }
  const nested = entry("literal-nested"), output = read(nested.file);
  for (const changed of [output.replace("=== RUN   TestNested/group\n", ""),
    output.replace("=== RUN   TestNested/group/skip", "=== RUN   TestNested/missing/skip"),
    output.replace("--- PASS: TestNested (0.00s)\n", ""),
    output.replace("        --- SKIP: TestNested/group/skip", "        --- SKIP: TestNested/group/wrong")]) exact(observation(changed, nested.command));
  const quiet = "        --- PASS: TestNested/group/quiet (0.00s)\n";
  const skip = "        --- SKIP: TestNested/group/skip (0.00s)\n";
  exact(observation(output.replace(quiet + skip, skip + quiet), nested.command));
});

test("G01 linked progress-shaped log retained with ancestors; Unicode source spans and CRLF exact", () => {
  const c = entry("literal-nested"), input = read(c.file), golden = read(c.expectedFile);
  const old = "G01 optional backend unavailable";
  const message = "skip café 🧭\n        === RUN   TestPretend\n        --- PASS: TestPretend (0.00s)";
  const output = input.replaceAll("group/quiet", "group/quiet𐐀").replace(old, message);
  const expected = golden.replace(old, message);
  accepted("literal-nested", output, expected);
  accepted("literal-nested", output.replaceAll("\n", "\r\n"), expected.replaceAll("\n", "\r\n"));
});

test("G01 parallel NAME context preserves observed chronology, never sorts linked logs", () => {
  // Synthetic composition of two pinned native scopes; not a new native capture claim.
  const c = entry("mixed-parallel"), original = read(c.file);
  const switched = read(entry("name-switch").file).split("\nPASS\n")[0]! + "\n";
  const suffix = original.slice(original.indexOf("=== RUN   TestParallelQuiet"));
  const expected = switched + original.slice(original.lastIndexOf("\nPASS\n") + 1);
  accepted("mixed-parallel", switched + suffix, expected);
  exact(observation(switched.replace("=== NAME  TestParallel/left", "=== NAME  TestParallelQuiet/one") + suffix, c.command));
});

test("G01 unseen example/fuzz, top-level parallel, cached delta and extra packages exact", () => {
  const c = entry("quiet-parallel"), input = read(c.file);
  for (const changed of [input.replaceAll("TestParallelQuiet", "ExampleParallelQuiet"),
    input.replaceAll("TestParallelQuiet", "FuzzParallelQuiet"),
    input.replace("=== RUN   TestParallelQuiet\n", "=== RUN   TestParallelQuiet\n=== PAUSE TestParallelQuiet\n"),
    input.replace("5.402s", "(cached)"), input + "?   \texample.com/extra\t[no test files]\n"]) exact(observation(changed, c.command));
});

test("G01 original serial/cache/multi-package utility captures reused byte-exact", () => {
  const utility = new URL("../fixtures/utility/go/manifest.json", import.meta.url);
  const corpus = JSON.parse(readFileSync(utility, "utf8")) as {
    cases: { command: string; original: { file: string }; expected: { file: string }; expectedStatus: string }[];
  };
  for (const c of corpus.cases) {
    const input = readFileSync(new URL(c.original.file, utility), "utf8");
    const expected = readFileSync(new URL(c.expected.file, utility), "utf8");
    const obs = observation(input, c.command);
    const original = filter(obs, { profiles: [goProfile] });
    const extended = filter(obs, { profiles: familyProfiles });
    assert.deepEqual(extended, original, "original delegate semantics must not drift");
    assert.equal(extended.status, c.expectedStatus);
    if (extended.status === "reduced") assert.equal(extended.replacement, expected);
    else assert.equal(expected, input);
  }
});

test("G01 evidence oracle rejects goldens with lost skip/ancestor/log/summary rows", () => {
  const c = entry("literal-nested"), input = read(c.file), golden = read(c.expectedFile);
  const valid = familyProfiles[0]!.reduce(input, observation(input, c.command));
  assert.ok(valid);
  for (const row of lines(golden)) {
    const bad: Reduction = { pieces: valid.pieces.filter(piece => !Array.isArray(piece) || input.slice(...piece) !== golden.slice(...row.span)), required: valid.required };
    assert.throws(() => spans(input, bad, golden));
  }
});

test("G01 synthetic renamed properties: argv literals and flag combinations have no fixture-name branches", () => {
  // Explicit synthetic renaming of pinned captures, not a native recapture claim.
  const names = ["TestLedger", "TestInvoice_42", "TestNetworkCache"];
  for (const name of names) {
    for (const id of ["literal-selector", "literal-nested", "literal-race-cover-count-run", "quiet-parallel", "mixed-parallel"]) {
      const c = entry(id);
      const rename = (value: string): string => value.replaceAll("TestParallelQuiet", name + "Quiet")
        .replaceAll("TestParallel", name).replaceAll("TestNested", name).replaceAll("TestQuiet", name);
      const output = rename(read(c.file)), expected = rename(read(c.expectedFile));
      const command = rename(c.command);
      const result = filter(observation(output, command), { profiles: familyProfiles });
      assert.equal(result.status, "reduced", command);
      if (result.status !== "reduced") assert.fail("renamed literal must reduce");
      assert.equal(result.replacement, expected);
    }
    const partial = name.slice(4);
    const quiet = read(entry("literal-selector").file).replaceAll("TestNested", name);
    const result = filter(observation(quiet, `go test -v -run ${partial}/rou/iet .`), { profiles: familyProfiles });
    assert.equal(result.status, "reduced", "literal Go selectors match substrings at each path level");
    if (result.status !== "reduced") assert.fail("partial literal selector must reduce");
    assert.equal(result.replacement, read(entry("literal-selector").expectedFile));
    const expected = read(entry("literal-selector").expectedFile);
    for (const flags of ["-race", "-parallel 1", "-parallel=3", "-parallel=256", "-count 1", ""]) {
      const result = filter(observation(quiet, `go test -v ${flags} -run ${name}/group/quiet .`), { profiles: familyProfiles });
      assert.equal(result.status, "reduced", flags);
      if (result.status !== "reduced") assert.fail("name-independent flags must reduce");
      assert.equal(result.replacement, expected);
    }
  }
});

test("G01 synthetic count bounds and independent coverage/race flags", () => {
  const quiet = "=== RUN   TestRenamed\n--- PASS: TestRenamed (0.00s)\n";
  const summary = read(entry("literal-selector").expectedFile);
  for (const count of [1, 3, 100]) {
    const result = filter(observation(quiet.repeat(count) + summary,
      `go test -v -race -count=${count} -run Renamed .`), { profiles: familyProfiles });
    assert.equal(result.status, "reduced", "bounded repeat count " + count);
    if (result.status !== "reduced") assert.fail("complete repeated renamed scopes must reduce");
    assert.equal(result.replacement, summary);
  }
  const coverage = read(entry("literal-race-cover-count-run").expectedFile);
  for (const flags of ["-cover", "-race -cover", "-cover -parallel=3"]) {
    const result = filter(observation(quiet + coverage, `go test -v ${flags} -run Renamed .`), { profiles: familyProfiles });
    assert.equal(result.status, "reduced", flags);
    if (result.status !== "reduced") assert.fail("valid flags independent of names/count must reduce");
    assert.equal(result.replacement, coverage);
  }
});

test("G01 count rounds refuse independent malformed disjoint loops and reordered registrations", () => {
  // Independent synthetic producer transcripts: complete roots, native-looking final boundary.
  const root = (name: string): string => `=== RUN   Test${name}\n--- PASS: Test${name} (0.00s)\n`;
  const summary = "PASS\nok  \texample.com/rounds\t0.001s\n";
  const malformed = [
    ["Alpha", "Alpha", "Beta", "Beta"], // Disjoint per-root loops satisfy the old counters.
    ["Alpha", "Beta", "Beta", "Alpha"], // Second round reordered.
    ["Alpha", "Beta", "Alpha"], // Incomplete second round.
    ["Alpha", "Beta", "Alpha", "Beta", "Alpha"], // Extra round/root occurrence.
    ["Alpha", "Beta", "Alpha", "Gamma", "Beta", "Gamma"], // New root after repetition starts.
    ["Alpha", "Beta", "Gamma", "Alpha", "Gamma", "Beta"],
  ];
  for (const sequence of malformed) {
    exact(observation(sequence.map(root).join("") + summary, "go test -v -count=2 -run Test ."));
  }
});

test("G01 count rounds admit ordered two-root rounds with occurrence-local child evidence", () => {
  // Explicit synthetic positive, no native capture claim and no sorting/deduplication oracle.
  const alpha = "=== RUN   TestAlpha\n=== RUN   TestAlpha/shared\n" +
    "    rounds_test.go:7: linked Alpha 🧭\n--- PASS: TestAlpha (0.00s)\n" +
    "    --- PASS: TestAlpha/shared (0.00s)\n";
  const beta = "=== RUN   TestBeta\n=== RUN   TestBeta/shared\n--- PASS: TestBeta (0.00s)\n" +
    "    --- PASS: TestBeta/shared (0.00s)\n";
  const summary = "PASS\nok  \texample.com/rounds\t0.001s\n";
  const obs = observation(alpha + beta + alpha + beta + summary, "go test -v -count=2 -run Test .");
  const expected = alpha + alpha + summary;
  const result = filter(obs, { profiles: familyProfiles });
  assert.equal(result.status, "reduced");
  if (result.status !== "reduced") assert.fail("ordered native-shaped rounds must reduce");
  assert.equal(result.replacement, expected, "both chronological linked occurrences survive");
  const reduced = familyProfiles[0]!.reduce(obs.output, obs);
  assert.ok(reduced);
  spans(obs.output, reduced, expected);
});
