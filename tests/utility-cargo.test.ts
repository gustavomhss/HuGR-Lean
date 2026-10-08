import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { filter } from "../src/core/engine.js";
import { cargoProfiles } from "../src/profiles/cargo.js";
import type { Observation, Profile, Reduction, Span } from "../src/types.js";
import { loadUtility } from "./utility-fixtures.js";

const native = await loadUtility();
const read = (file: string) => native.read("cargo", file).toString("utf8");
const raw = (id: string) => native.case("cargo", id).originalText;
const golden = (id: string) => native.case("cargo", id).expectedText;
const profile = cargoProfiles.find((entry) => entry.id === "cargo-test")!;
const obs = (output: string, command = "cargo test --color never"): Observation => ({
  source: "shell", command, output, termination: { kind: "exited", code: 0 },
  completeness: "complete", presentation: "unknown",
});
// Independent UTF-16 row boundaries; no production line reader or parser-derived goldens.
function rows(input: string): { text: string; span: Span }[] {
  const result: { text: string; span: Span }[] = [];
  for (let start = 0; start < input.length;) {
    const lf = input.indexOf("\n", start), end = lf < 0 ? input.length : lf + 1;
    result.push({ text: input.slice(start, end).replace(/\r?\n$/, ""), span: [start, end] });
    start = end;
  }
  return result;
}
type Anchor = { text: string; occurrence: number };
function anchors(input: string): Anchor[] {
  return rows(input).filter((row) => row.text !== "").map(({ text, span }) => {
    let occurrence = 0, cursor = 0;
    for (;;) {
      const at = input.indexOf(text, cursor);
      assert.ok(at >= 0, "physical row anchor must exist");
      if (at === span[0]) break;
      assert.ok(at < span[0], "anchor must begin at physical row");
      occurrence++; cursor = at + text.length;
    }
    return { text, occurrence };
  });
}
function anchoredRow(input: string, anchor: Anchor): { text: string; span: Span } {
  let at = -1, cursor = 0;
  for (let i = 0; i <= anchor.occurrence; i++) {
    at = input.indexOf(anchor.text, cursor); assert.ok(at >= 0, `missing occurrence ${anchor.occurrence}: ${anchor.text}`);
    cursor = at + anchor.text.length;
  }
  const row = rows(input).find(row => row.span[0] === at && row.text === anchor.text);
  assert.ok(row, "anchor must identify full physical row"); return row;
}
function evidence(input: string, reduction: Reduction, required: readonly Anchor[]): string {
  assert.ok(required.length > 0, "independent evidence must be nonempty");
  const spans: Span[] = [];
  let previous = 0;
  for (const piece of reduction.pieces) {
    assert.ok(!("text" in piece), "native evidence must use source spans");
    assert.ok(Number.isInteger(piece[0]) && Number.isInteger(piece[1]) &&
      previous <= piece[0] && piece[0] < piece[1] && piece[1] <= input.length, "valid ordered UTF-16 pieces");
    spans.push(piece); previous = piece[1];
  }
  const covers = (list: readonly Span[], span: Span) => list.some(([a, b]) => a <= span[0] && b >= span[1]);
  for (const span of reduction.required) {
    assert.ok(Number.isInteger(span[0]) && Number.isInteger(span[1]) &&
      0 <= span[0] && span[0] < span[1] && span[1] <= input.length, "valid UTF-16 required span");
    assert.ok(covers(spans, span), "declared evidence must be emitted");
  }
  for (const anchor of required) {
    assert.ok(Number.isSafeInteger(anchor.occurrence) && anchor.occurrence >= 0);
    const row = anchoredRow(input, anchor);
    assert.ok(covers(reduction.required, row.span), `missing declaration: ${anchor.text}`);
    assert.ok(covers(spans, row.span), `missing emission: ${anchor.text}`);
  }
  return spans.map((span) => input.slice(...span)).join("");
}
function accepted(input: string, expected: string, command = "cargo test --color never"): void {
  const observation = obs(input, command);
  assert.equal(profile.match(command.split(" ")), true, `admitted argv: ${command}`);
  const result = profile.reduce(input, observation);
  assert.ok(result, "Cargo must accept complete supported grammar");
  assert.equal(evidence(input, result, anchors(expected)), expected);
  const filtered = filter(observation);
  assert.equal(filtered.status, "reduced");
  if (filtered.status !== "reduced") assert.fail("missing reduction");
  assert.equal(filtered.profile, "cargo-test");
  assert.equal(filtered.replacement, expected);
  assert.equal(filtered.inputBytes, Buffer.byteLength(input));
  assert.equal(filtered.outputBytes, Buffer.byteLength(expected));
}
function exact(observation: Observation, candidate?: Profile): void {
  assert.equal((candidate ?? profile).reduce(observation.output, observation), undefined, "grammar/metadata must decline");
  const result = candidate ? filter(observation, { profiles: [candidate] }) : filter(observation);
  assert.equal(result.status, "passthrough", observation.output);
  assert.equal("replacement" in result, false);
  assert.equal(result.inputBytes, Buffer.byteLength(observation.output));
  assert.equal(result.outputBytes, result.inputBytes);
}

test("CARGO-SUITES: native absolute executable headers, 2m 01s, integration and doctest", () => {
  accepted(raw("full"), golden("full"));
});
test("CARGO-LIB: native --lib retains Finished, Running, ignored Unicode and summary", () => {
  accepted(raw("lib"), golden("lib"), "cargo test --lib --color never");
});
test("independent native golden positions, occurrence-zero anchors and honest MATERIAL", () => {
  for (const [id, keep] of [["full", [2, 3, 6, 15, 17, 28, 30, 35]], ["lib", [1, 2, 5, 14]]] as const) {
    const input = raw(id), expected = golden(id), source = rows(input);
    assert.equal(keep.map((line) => input.slice(...source[line - 1]!.span)).join(""), expected);
    assert.ok(anchors(expected).every((anchor) => anchor.occurrence === 0));
    const saved = Buffer.byteLength(input) - Buffer.byteLength(expected);
    assert.equal(saved >= 1024 && saved / Buffer.byteLength(input) >= 0.1, id === "full");
  }
  assert.equal(createHash("sha256").update(raw("full")).digest("hex"),
    "de588a236150859c4fa563f6a735fc350a451f3ad04f94d397c966387c452762");
});
test("CARGO-LIB: admitted color forms in both orders", () => {
  for (const command of ["cargo test --lib", "cargo test --lib --color=never", "cargo test --color=never --lib",
    "cargo test --lib --color never", "cargo test --color never --lib"]) accepted(raw("lib"), golden("lib"), command);
});
test("closed command identity rejects duplicate/missing/unknown options and shell syntax", () => {
  accepted(raw("lib"), golden("lib"), "cargo test --lib");
  for (const command of ["cargo test --lib --lib", "cargo test --color never --color=never", "cargo test --lib=1",
    "cargo test --lib --color", "cargo test --color always --lib", "cargo test --color auto --lib",
    "cargo test --tests", "cargo test --doc", "cargo test --release", "cargo test --message-format=json",
    "cargo test -- --nocapture", "cargo test --lib extra", "cargo test --lib && echo", "cargo test --lib | cat"]) {
    assert.equal(profile.match(command.split(" ")), false, command);
    assert.equal(filter(obs(raw("lib"), command)).status, "passthrough", command);
  }
});
test("CARGO-LIB: full integration/doc suites cannot masquerade as library-only", () => {
  accepted(raw("lib"), golden("lib"), "cargo test --lib");
  exact(obs(raw("full"), "cargo test --lib --color never"));
  exact(obs(raw("full").slice(0, raw("full").indexOf("   Doc-tests")), "cargo test --lib"));
  for (const header of ["tests/native_integration.rs", "unittests src/main.rs"]) {
    exact(obs(raw("lib").replace("unittests src/lib.rs", header), "cargo test --lib"));
  }
});
for (const id of ["full", "lib"] as const) {
  const command = id === "lib" ? "cargo test --lib --color never" : "cargo test --color never";
  test(`${id}: CRLF, Unicode before retained rows, complete unterminated summary`, () => {
    accepted(raw(id).replaceAll("\n", "\r\n"), golden(id).replaceAll("\n", "\r\n"), command);
    accepted(raw(id).trimEnd(), golden(id).trimEnd(), command);
    accepted(raw(id).replaceAll("/Documents/HuGR/", "/Documents/🦀café/HuGR/"),
      golden(id).replaceAll("/Documents/HuGR/", "/Documents/🦀café/HuGR/"), command);
  });
  test(`${id}: false nonzero, unknown, timeout, incomplete and foreign-source facts preserve`, () => {
    accepted(raw(id), golden(id), command);
    const base = obs(raw(id), command);
    for (const variant of [{ ...base, termination: { kind: "exited", code: 101 } },
      { ...base, termination: { kind: "unknown" } }, { ...base, termination: { kind: "timed_out" } },
      { ...base, completeness: "truncated" }, { ...base, completeness: "unknown" },
      { ...base, source: "other" }] as Observation[]) exact(variant);
  });
  test(`${id}: unknown rows/warnings at every boundary preserve whole output`, () => {
    accepted(raw(id), golden(id), command);
    for (const offset of [0, ...rows(raw(id)).map((row) => row.span[1])]) {
      for (const extra of ["opaque invoice café 🦀\n", "warning: unfamiliar compiler diagnostic\n"]) {
        exact(obs(raw(id).slice(0, offset) + extra + raw(id).slice(offset), command));
      }
    }
  });
  test(`${id}: C0/C1/DEL, ANSI and bare CR cannot disappear with removable progress`, () => {
    accepted(raw(id), golden(id), command);
    const controls = [...Array.from({ length: 32 }, (_, n) => n).filter((n) => n !== 9 && n !== 10 && n !== 13),
      ...Array.from({ length: 33 }, (_, n) => n + 127)];
    for (const code of controls) exact(obs(raw(id).replace("running 8 tests", `running 8 tests${String.fromCharCode(code)}`), command));
    for (const extra of ["\r", "\x1b[32m"]) exact(obs(extra + raw(id), command));
  });
}
test("native warning exact under bare/admitted color commands; failure exact under 101 and incorrect zero", () => {
  for (const id of ["failure", "warning"]) {
    assert.equal(golden(id), raw(id));
    for (const command of ["cargo test", "cargo test --color never", "cargo test --color=never"]) {
      exact(obs(raw(id), command));
      exact({ ...obs(raw(id), command), termination: { kind: "exited", code: id === "failure" ? 101 : 0 } });
    }
  }
});
test("CARGO-SUITES: names reset across suites, relative headers and seconds isolate new grammar", () => {
  const relative = (input: string) => input.replace(/\([^()]+\/target\/debug\/deps\//g, "(target/debug/deps/").replace("2m 01s", "12.31s");
  accepted(relative(raw("full")), relative(golden("full")));
  const firstEnd = raw("full").indexOf("     Running tests/");
  accepted(raw("full").slice(0, firstEnd), golden("full").split("\n").slice(0, 4).join("\n") + "\n");
});
test("CARGO-SUITES: valid duplicate identities/ignored rows/summaries reset in distinct contexts", () => {
  const input = raw("lib"), expected = golden("lib");
  const next = input.slice(input.indexOf("     Running")).replace("unittests src/lib.rs", "tests/other.rs")
    .replace("hugr_utility_cargo-d33d504b26e55d28)", "other-d33d504b26e55d28)");
  const kept = expected.slice(expected.indexOf("     Running")).replace("unittests src/lib.rs", "tests/other.rs")
    .replace("hugr_utility_cargo-d33d504b26e55d28)", "other-d33d504b26e55d28)");
  accepted(input + next, expected + kept);
});
test("malformed durations, counts, duplicate/missing suites and unknown headers preserve", () => {
  accepted(raw("full"), golden("full"));
  const input = raw("full"), source = rows(input);
  const remove = (index: number) => input.slice(0, source[index]!.span[0]) + input.slice(source[index]!.span[1]);
  const variants = [input + input, "", "\n", input.replace("running 8 tests", "running 9 tests"),
    input.replace("running 7 tests", "running 6 tests"), input.replace("running 1 test", "running 1 tests"),
    input.replace("running 8 tests", "running 08 tests"), input.replace("7 passed;", "8 passed;"),
    input.replace("1 ignored;", "0 ignored;"), input.replace("0 failed;", "1 failed;"),
    input.replace("0 measured;", "1 measured;"), input.replace("0 filtered out;", "9007199254740993 filtered out;"),
    input.replace("7 passed;", "07 passed;"), input.replace("5.61s", "NaNs"),
    input.replace("test tests::passing_00_original_dependency_free_native_evidence_keeps_suite_context_and_long_identity_without_external_dependencies ... ok",
      "test tests::duplicate_suite_identity ... ok"),
    input.replace("test tests::passing_06_original_dependency_free_native_evidence_keeps_suite_context_and_long_identity_without_external_dependencies ... ok",
      "test tests::duplicate_suite_identity ... ok"),
    input.replace(source[16]!.text, source[2]!.text), input.replace("   Doc-tests hugr_utility_cargo", source[2]!.text),
    input.replace("     Running tests/", "     Running examples/"), input.replace("   Doc-tests", "   Unknown-tests"),
    input.replace("test src/lib.rs - add (line 4)", "test opaque invoice"), input.replace(" ... ok", " ... FAILED"),
    input.replace(source[1]!.text, source[1]!.text + "\n" + source[1]!.text),
    ...[2, 4, 14, 16, 18, 27, 29, 31, 34].map(remove),
    ...[14, 27, 34].flatMap((index) => [
      source[index]!.text.replace(/\d+ passed;/, "99 passed;"),
      source[index]!.text.replace("0 failed;", "1 failed;"),
      source[index]!.text.replace(/\d+ ignored;/, "99 ignored;"),
      source[index]!.text.replace("0 measured;", "1 measured;"),
    ].map((summary) => input.replace(source[index]!.text, summary))),
    ...["0m 01s", "2m 60s", "2m 99s", "-2m 01s", "2m NaNs", "2m 1e2s", "Infinitys", "2m", "NaNs",
      `2m ${"9".repeat(400)}s`].map((duration) => input.replace("2m 01s", duration))];
  for (const variant of variants) { assert.notEqual(variant, input); exact(obs(variant)); }
});
for (const duration of ["1m 00s", "3m 12s"]) {
  test(`SYNTHETIC duration ${duration}: native-shaped success; actual native remains 2m 01s`, () => {
    accepted(raw("full").replace("2m 01s", duration), golden("full").replace("2m 01s", duration));
  });
}
test("suite-local reconciliation rejects balanced count transfers and summary swaps", () => {
  const input = raw("full"), source = rows(input);
  const swap = (left: string, right: string) => input.replace(left, "SWAP_MARKER").replace(right, left).replace("SWAP_MARKER", right);
  const moved = input.slice(...source[7]!.span);
  const variants = [swap("running 8 tests", "running 7 tests"), swap(source[14]!.text, source[27]!.text),
    input.replace(moved, "").replace(source[27]!.text, moved + source[27]!.text)];
  const totals = (text: string) => [...text.matchAll(/^running (\d+) tests?$/gm)].reduce((sum, match) => sum + Number(match[1]), 0);
  const summaryTotals = (text: string) => [...text.matchAll(/^test result: ok\. (\d+) passed; 0 failed; (\d+) ignored;/gm)]
    .reduce(([passed, ignored], match) => [passed! + Number(match[1]), ignored! + Number(match[2])], [0, 0]);
  for (const variant of variants) {
    assert.notEqual(variant, input); assert.equal(totals(variant), totals(input));
    assert.equal(rows(variant).filter((row) => row.text.endsWith(" ... ok")).length, 15);
    assert.deepEqual(summaryTotals(variant), summaryTotals(input));
  }
  accepted(input, golden("full"));
  for (const variant of variants) exact(obs(variant));
});
test("unique suite contexts reject repeated Doc-tests and same executable under changed header", () => {
  const input = raw("full"), source = rows(input);
  accepted(input, golden("full"));
  const executable = (line: string) => line.slice(line.lastIndexOf(" (") + 2, -1);
  const alias = input.replace(executable(source[16]!.text), executable(source[2]!.text));
  assert.notEqual(source[16]!.text, source[2]!.text); assert.notEqual(alias, input);
  exact(obs(alias));
  exact(obs(input + input.slice(input.indexOf("   Doc-tests"))));
});
for (const duration of ["0.46s", "1m 00s"]) {
  test(`SYNTHETIC build ${duration}: accepted witness before malformed finite-duration checks`, () => {
    const compile = "   Compiling fixture v0.1.0\n", command = "cargo build --color never";
    const finish = `    Finished \`dev\` profile [unoptimized + debuginfo] target(s) in ${duration}\n`;
    const build = cargoProfiles.find((entry) => entry.id === "cargo-build")!;
    const valid = compile + finish, result = build.reduce(valid, obs(valid, command));
    assert.ok(result, "accepted build baseline before negatives");
    assert.equal(evidence(valid, result, anchors(finish)), finish);
    for (const malformed of [`${"9".repeat(400)}s`, `2m ${"9".repeat(400)}s`, `${"9".repeat(400)}m 00s`,
      "2m 60s", "2m NaNs", "Infinitys", "-1s", "1e309s"]) {
      const invalid = valid.replace(duration, malformed);
      assert.notEqual(invalid, valid); assert.equal(build.reduce(invalid, obs(invalid, command)), undefined, malformed);
      assert.equal(filter(obs(invalid, command)).status, "passthrough", malformed);
    }
  });
}
test("streaming 1,000 Unicode tests, count guards and complete EOF", () => {
  const input = raw("lib"), expected = golden("lib"), passing = rows(input).filter((row) => row.text.endsWith(" ... ok"));
  let large = input;
  for (const row of passing) large = large.replace(input.slice(...row.span), "");
  large = large.replace("running 8 tests\n", "running 1001 tests\n" +
    Array.from({ length: 1000 }, (_, i) => `test tests::𐐀café_${i} ... ok\n`).join(""))
    .replace("7 passed;", "1000 passed;");
  const command = "cargo test --lib", kept = expected.replace("7 passed;", "1000 passed;");
  accepted(large + "\n".repeat(1000), kept, command);
  accepted(large.replaceAll("\n", "\r\n"), kept.replaceAll("\n", "\r\n"), command);
  for (const invalid of [large.replace("𐐀café_999", "𐐀café_0"), large.replace("1001 tests", "1002 tests"),
    large.replace("1000 passed;", "999 passed;"), large.slice(0, large.indexOf("test result:")),
    large + "\n".repeat(1000) + "test tests::late ... ok\n"]) exact(obs(invalid, command));
});
test("cargo-build seconds/minutes keep exact Finished; EOF and test grammars remain strict", () => {
  const build = cargoProfiles.find((entry) => entry.id === "cargo-build")!;
  const compile = "   Compiling fixture v0.1.0\n";
  for (const duration of ["0.46s", "2m 01s"]) {
    const finished = `    Finished \`dev\` profile [unoptimized + debuginfo] target(s) in ${duration}\n`;
    const input = compile + finished, observation = obs(input, "cargo build --color never");
    const reduction = build.reduce(input, observation);
    assert.ok(reduction); assert.equal(evidence(input, reduction, anchors(finished)), finished);
    for (const tail of ["\n", raw("lib"), "opaque\n"]) {
      assert.equal(build.reduce(input + tail, obs(input + tail, observation.command)), undefined);
      assert.equal(filter(obs(input + tail, observation.command)).status, "passthrough");
    }
  }
  assert.equal(build.match(["cargo", "build", "--lib"]), false);
});
test("DECLARED-EVIDENCE teeth: declaration-only and emission-only forged reductions fail", () => {
  const input = "noise 🦀\nsummary\nsummary\n", retained = rows(input).slice(1).map((row) => row.span);
  const required = [{ text: "summary", occurrence: 0 }, { text: "summary", occurrence: 1 }];
  const valid: Reduction = { pieces: retained, required: retained };
  assert.equal(evidence(input, valid, required), "summary\nsummary\n");
  for (let index = 0; index < retained.length; index++) {
    assert.throws(() => evidence(input, { ...valid, required: retained.filter((_, i) => i !== index) }, required), /missing declaration/);
    assert.throws(() => evidence(input, { ...valid, pieces: retained.filter((_, i) => i !== index) }, required), /declared evidence must be emitted/);
  }
  assert.throws(() => evidence(input, { pieces: [{ text: "summary\nsummary\n" }], required: retained }, required), /source spans/);
  const byteOffsets = retained.map(([a, b]) => [Buffer.byteLength(input.slice(0, a)), Buffer.byteLength(input.slice(0, b))] as Span);
  assert.throws(() => evidence(input, { pieces: byteOffsets, required: byteOffsets }, required), /UTF-16/);
});

type Artifact = { file: string; sha256: string; bytes: number; sourceFile?: string };
type NativeCase = {
  id: string; profile: string; command: string; role: string; expectedStatus: string;
  exitCode: number; complete: boolean; signal: null; timedOut: boolean; material: boolean;
  capture: Artifact; original: Artifact; stdout: Artifact; stderr: Artifact; expected: Artifact;
  fixtureSources: Artifact[]; required: Anchor[];
  producer?: { script: string; sourceSHA256: string };
};
function verified(artifact: Artifact): Buffer {
  assert.ok(artifact.file.split("/").every((part) => /^[A-Za-z0-9_.-]+$/.test(part) && part !== "." && part !== ".."), "safe stored path");
  const bytes = native.read("cargo", artifact.file);
  assert.equal(bytes.length, artifact.bytes, `byte binding: ${artifact.file}`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256, `hash binding: ${artifact.file}`);
  assert.equal(Buffer.from(bytes.toString("utf8")).equals(bytes), true, "lossless UTF-8");
  return bytes;
}
function sourceBinding(stored: readonly Artifact[], recorded: readonly Artifact[]): void {
  assert.ok(stored.length > 0 && recorded.length > 0);
  const signature = (item: Artifact, relocated: boolean) => JSON.stringify([
    relocated ? item.sourceFile ?? item.file : item.file, item.sha256, item.bytes,
  ]);
  assert.deepEqual(stored.map((item) => signature(item, true)).sort(),
    recorded.map((item) => signature(item, false)).sort(), "source name/hash/byte binding");
  for (const item of stored) verified(item);
}
test("native manifest binds raw/receipt/source facts, tool versions, expected bytes and all anchors", async () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.schema, "hugr-lean/utility-corpus/1"); assert.equal(manifest.family, "cargo");
  const cases: NativeCase[] = manifest.cases;
  assert.deepEqual(cases.map((entry) => entry.id), ["full", "lib", "failure", "warning"]);
  assert.ok(cases.some((entry) => entry.role === "noise" && entry.material));
  for (const entry of cases) {
    const receipt = native.case("cargo", entry.id).captureReceipt;
    assert.equal(receipt.id, entry.id); assert.equal(receipt.command, entry.command);
    assert.equal(entry.profile, "cargo-test"); assert.equal(receipt.baseline, "882585e5f916821a482d14bc7bfe7d6a102b772a");
    assert.equal(receipt.nativeSpawned, true); assert.equal(receipt.nativeExitObserved, true);
    assert.equal(receipt.runtime.node, "v22.17.1"); assert.deepEqual(receipt.tools, manifest.tools);
    for (const key of ["exitCode", "complete", "signal", "timedOut"] as const) assert.equal(receipt[key], entry[key]);
    const producer = entry.producer ?? manifest.producer;
    assert.equal(receipt.producer.sourceSHA256 ?? receipt.producer.sha256, producer.sourceSHA256);
    assert.equal(receipt.producer.script, producer.script);
    for (const key of ["original", "stdout", "stderr"] as const) {
      verified(entry[key]);
      assert.equal(entry[key].sha256, receipt.artifacts[key].sha256); assert.equal(entry[key].bytes, receipt.artifacts[key].bytes);
      assert.equal(entry[key].sourceFile ?? entry[key].file, receipt.artifacts[key].file);
    }
    assert.equal(entry.original.bytes, entry.stdout.bytes + entry.stderr.bytes);
    sourceBinding(entry.fixtureSources, receipt.fixtureSources ?? receipt.fixtureSourcesBefore);
    const expected = verified(entry.expected).toString("utf8");
    assert.equal(expected, golden(entry.id)); assert.deepEqual(entry.required, anchors(expected));
    const source = raw(entry.id), spans = rows(source).filter((row) => row.text !== "").map((row) => row.span);
    evidence(source, { pieces: spans, required: spans }, entry.required);
    assert.deepEqual(native.case("cargo", entry.id).required.map(a => a.sourceSpan), entry.required.map(anchor => {
      const row = anchoredRow(source, anchor);
      return [row.span[0], row.span[1] - (source.slice(...row.span).endsWith("\n") ? 1 : 0)];
    }), "reader UTF-16 anchors agree with independent row oracle");
    const saved = entry.original.bytes - entry.expected.bytes;
    assert.equal(entry.material, saved >= 1024 && saved / entry.original.bytes >= 0.1);
    assert.equal(entry.expectedStatus, entry.role === "noise" ? "reduced" : "passthrough");
    if (entry.role === "exact") assert.equal(source, expected);
  }
  await native.descriptorTeeth("cargo", "full");
});
test("source lock reconstructed-full / recorded-control bytes bind generated-comment changes", () => {
  for (const [id, after] of [["full", "lib"], ["failure", "failure-after"], ["warning", "warning-after"]]) {
    const before = read(`sources/${id}/Cargo.lock`), changed = read(`sources/${after}/Cargo.lock`);
    assert.notEqual(before, changed);
    assert.equal(changed, "# This file is automatically @generated by Cargo.\n# It is not intended for manual editing.\n" + before);
    const receipt = JSON.parse(read(`${id}/receipt.json`));
    const sources: Artifact[] = receipt.fixtureSources ?? receipt.fixtureSourcesBefore;
    const prior = sources.find((entry) => entry.file === "Cargo.lock")!;
    verified({ ...prior, file: `sources/${id}/Cargo.lock` });
    const post: Artifact = id === "full" ?
      JSON.parse(read("lib/receipt.json")).fixtureSourcesBefore.find((entry: Artifact) => entry.file === "Cargo.lock") :
      receipt.fixtureSourcesAfter.find((entry: Artifact) => entry.file === "Cargo.lock");
    if (id === "full") {
      const inspection = boundLineage().inspection;
      assert.equal(prior.sha256, inspection.sourcePostCaptureInspection["Cargo.lock"].beforeSHA256);
      assert.equal(post.sha256, inspection.sourcePostCaptureInspection["Cargo.lock"].afterSHA256);
    }
    verified({ ...post, file: `sources/${after}/Cargo.lock` });
  }
});
test("binding oracle teeth reject digest/byte/path and source-name substitutions", () => {
  assert.equal(createHash("sha256").update("").digest("hex"), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  const artifact: Artifact = { file: "sources/full/Cargo.lock", sourceFile: "Cargo.lock", bytes: 112,
    sha256: "c979d625775116140efcb86e25b0785f3959ce3cc8660f5a969b7d0d5d38c0cb" };
  verified(artifact);
  assert.throws(() => verified({ ...artifact, sha256: "0".repeat(64) }), /hash binding/);
  assert.throws(() => verified({ ...artifact, bytes: 113 }), /byte binding/);
  assert.throws(() => verified({ ...artifact, file: "../Cargo.lock" }), /safe stored path/);
  const recorded = [{ ...artifact, file: "Cargo.lock" }];
  sourceBinding([artifact], recorded);
  assert.throws(() => sourceBinding([{ ...artifact, sourceFile: "build.rs" }], recorded), /source name\/hash\/byte binding/);
});
test("native golden declaration-only and emission-only omissions fail for every retained line", () => {
  for (const id of ["full", "lib"]) {
    const input = raw(id), required = anchors(golden(id));
    const spans = required.map((anchor) => rows(input).filter((row) => row.text === anchor.text)[anchor.occurrence]!.span);
    assert.equal(evidence(input, { pieces: spans, required: spans }, required), golden(id));
    for (let index = 0; index < spans.length; index++) {
      assert.throws(() => evidence(input, { pieces: spans, required: spans.filter((_, i) => i !== index) }, required), /missing declaration/);
      assert.throws(() => evidence(input, { pieces: spans.filter((_, i) => i !== index), required: spans }, required), /declared evidence must be emitted/);
    }
  }
});
test("PRESERVE positive control and forged shrink mutant bite without production edits", () => {
  const input = readFileSync(new URL("../fixtures/runners/cargo_test_success.txt", import.meta.url), "utf8");
  const expected = rows(input).filter((row) => row.text.startsWith("    Finished") || row.text.startsWith("     Running") ||
    row.text.includes(" ... ignored") || row.text.startsWith("test result:")).map((row) => input.slice(...row.span)).join("");
  accepted(input, expected);
  exact(obs(input.replace("running 3 tests", "running 4 tests")));
  exact({ ...obs(input), termination: { kind: "exited", code: 101 } });
  const kept = rows(input).filter((row) => row.text.startsWith("test result:")).map((row) => row.span);
  const mutant: Profile = { ...profile, reduce: () => ({ pieces: kept, required: kept }) };
  assert.throws(() => exact(obs(input + "unknown compiler warning\n"), mutant), /grammar\/metadata must decline/);
  assert.throws(() => exact({ ...obs(input), termination: { kind: "exited", code: 101 } }, mutant), /grammar\/metadata must decline/);
  accepted(input, expected);
});

type SourceRecord = { case: string; sourceFile: string; originalExpectedHash: string } & (
  { origin: "recorded-before"; recordedBeforeSatisfied: true } |
  { origin: "reconstructed-producer-literal"; recordedBeforeSatisfied: false; producer: Artifact }
);
type Lineage = {
  schema: string; sourceRecovery: string; producer: Artifact & { commit: string; license: string };
  inspection: Artifact; index: { sha256: string; bytes: number; parts: Artifact[] }; sourceRecords: SourceRecord[];
  fullAfterStorage: { file: string; sourceFile: string; origin: string; receipt: string; inventory: string };
};
const proof = (): Lineage => JSON.parse(read("provenance/lineage.json"));
function boundLineage(lineage = proof()) {
  assert.equal(lineage.schema, "hugr-lean/cargo-lineage-proof/1");
  const producer = verified(lineage.producer);
  const inspection = JSON.parse(verified(lineage.inspection).toString("utf8"));
  assert.equal(lineage.index.parts.length, 3, "complete index fragments required");
  const bytes = Buffer.concat(lineage.index.parts.map((part) => verified(part)));
  assert.equal(bytes.length, lineage.index.bytes, "complete index byte binding");
  const hash = createHash("sha256").update(bytes).digest("hex");
  assert.equal(hash, lineage.index.sha256, "ordered original index digest binding");
  assert.equal(hash, inspection.captureIndex.sha256, "independent inspection-index binding");
  const index = JSON.parse(bytes.toString("utf8"));
  assert.equal(index.producer.sourceSHA256, lineage.producer.sha256);
  assert.equal(index.producer.bytes, producer.length);
  assert.equal(index.producer.script, lineage.producer.sourceFile);
  assert.equal(inspection.producerCommit, lineage.producer.commit);
  assert.equal(lineage.producer.license, "MIT");
  return { lineage, producer, inspection, index };
}
function lockLiteral(producer: Buffer): Buffer {
  // Parse inert pinned source; never import, evaluate or run the native producer.
  const ast = ts.createSourceFile("original-producer.mjs", producer.toString("utf8"), ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const literals: ts.StringLiteral[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "sources" &&
        node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) {
        if (ts.isPropertyAssignment(property) && ts.isStringLiteral(property.name) && property.name.text === "Cargo.lock") {
          assert.ok(ts.isStringLiteral(property.initializer), "lock evidence must be an original literal");
          literals.push(property.initializer);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.equal(literals.length, 1, "one original Cargo.lock literal required");
  return Buffer.from(literals[0]!.text);
}
function sourceRecord(record: SourceRecord, lineage = proof()): void {
  assert.equal(record.sourceFile, "Cargo.lock", "reconstruction scope is lock metadata only");
  const receipt = JSON.parse(read(`${record.case}/receipt.json`));
  const inventory: Artifact[] = receipt.fixtureSources ?? receipt.fixtureSourcesBefore;
  const expected = inventory.find((entry) => entry.file === record.sourceFile)!;
  assert.ok(expected, "recorded source name required");
  assert.equal(record.originalExpectedHash, expected.sha256, "sourceRecord original expected hash binding");
  const stored = verified({ ...expected, file: `sources/${record.case}/Cargo.lock` });
  if (record.case === "full") {
    assert.equal(record.origin, "reconstructed-producer-literal", "full lock cannot claim recorded-before origin");
    assert.equal(record.recordedBeforeSatisfied, false, "full pre-capture-copy requirement remains blocked");
    if (record.origin !== "reconstructed-producer-literal") assert.fail("missing reconstruction producer");
    assert.equal(record.producer.sha256, lineage.producer.sha256);
    const literal = lockLiteral(verified(record.producer));
    assert.equal(createHash("sha256").update(literal).digest("hex"), expected.sha256);
    assert.equal(literal.length, expected.bytes); assert.equal(literal.equals(stored), true);
  } else {
    assert.equal(record.origin, "recorded-before"); assert.equal(record.recordedBeforeSatisfied, true);
  }
}
test("independent original index/inspection/producer bind failure, full receipt, raw and source inventory", () => {
  const { lineage, index, inspection } = boundLineage();
  assert.equal(index.state, "blocked"); assert.equal(index.failures.length, 1);
  assert.equal(index.failures[0].message, inspection.collectorError); assert.equal(inspection.collectorExitCode, 1);
  const full = index.captures.find((entry: { id: string }) => entry.id === "full");
  assert.deepEqual(full, JSON.parse(read("full/receipt.json")));
  assert.deepEqual(index.projects[0].fixtureSources, full.fixtureSources);
  assert.equal(full.exitCode, inspection.nativeExitCode); assert.equal(full.exitCode, 0);
  assert.equal(full.nativeFacts.finishedRows[0], inspection.nativeFinishedRow);
  assert.equal(rows(raw("full"))[1]!.text, inspection.nativeFinishedRow);
  for (const key of ["original", "stdout", "stderr"] as const) {
    verified({ ...full.artifacts[key], file: `full/${key}.log` });
  }
  for (const id of ["lib", "failure", "warning"]) {
    const receipt = JSON.parse(read(`${id}/receipt.json`));
    assert.equal(receipt.priorIndexSHA256, lineage.index.sha256);
    assert.equal(receipt.originalProducerCommit, lineage.producer.commit);
  }
});
test("typed source origins distinguish reconstructed lock from actual recorded later/before files", () => {
  const { lineage } = boundLineage();
  assert.deepEqual(lineage.sourceRecords.map((record) => record.case), ["full", "lib", "failure", "warning"]);
  for (const record of lineage.sourceRecords) sourceRecord(record, lineage);
  assert.match(lineage.sourceRecovery, /Accepted recovered producer literal for Cargo.lock metadata only; recordedBeforeSatisfied remains false/);
  const after = lineage.fullAfterStorage;
  assert.equal(after.sourceFile, "Cargo.lock"); assert.equal(after.origin, "recorded-later-before-lib");
  const inventory: Artifact[] = JSON.parse(read(after.receipt))[after.inventory];
  const descriptor = inventory.find((item) => item.file === after.sourceFile)!;
  verified({ ...descriptor, file: after.file });
});
test("lineage teeth reject index order/digest, producer bytes and dishonest before-source labels", () => {
  const original = proof(); boundLineage(original);
  assert.throws(() => boundLineage({ ...original, index: { ...original.index, parts: [...original.index.parts].reverse() } }), /ordered original index digest binding/);
  assert.throws(() => boundLineage({ ...original, inspection: { ...original.inspection, sha256: "0".repeat(64) } }), /hash binding/);
  assert.throws(() => boundLineage({ ...original, producer: { ...original.producer, bytes: 13503 } }), /byte binding/);
  assert.throws(() => boundLineage({ ...original, index: { ...original.index, parts: [] } }), /complete index fragments required/);
  const script = verified(original.producer).toString("utf8");
  assert.throws(() => lockLiteral(Buffer.from(script.replace('"Cargo.lock":', '"Cargo.alias":'))), /one original Cargo.lock literal required/);
  const full = original.sourceRecords[0]!; sourceRecord(full, original);
  assert.throws(() => sourceRecord({ ...full, sourceFile: "src/lib.rs" }, original), /lock metadata only/);
  assert.throws(() => sourceRecord({ ...full, origin: "recorded-before", recordedBeforeSatisfied: true }, original), /cannot claim recorded-before/);
  assert.throws(() => sourceRecord({ ...full, originalExpectedHash: "0".repeat(64) }, original), /original expected hash binding/);
});
test("CARGO-LIB binds actual quoted/tab argv and refuses incompatible observation commands", () => {
  for (const command of ["cargo test '--lib' --color 'never'", "cargo\ttest\t--color=never\t\"--lib\""]) {
    const result = profile.reduce(raw("lib"), obs(raw("lib"), command));
    assert.ok(result); assert.equal(evidence(raw("lib"), result, anchors(golden("lib"))), golden("lib"));
    const filtered = filter(obs(raw("lib"), command));
    assert.equal(filtered.status, "reduced");
    if (filtered.status !== "reduced") assert.fail("quoted library argv must reduce");
    assert.equal(filtered.replacement, golden("lib"));
    exact(obs(raw("full"), command));
    exact(obs(raw("lib").replace("unittests src/lib.rs", "unittests src/main.rs"), command));
  }
  for (const command of ["cargo test '--lib extra'", "cargo test --color '--lib'", "cargo build", "echo cargo test"]) {
    exact(obs(raw("lib"), command));
  }
});
test("legacy Cargo installed goldens remain exact under existing command identities", () => {
  const installed = JSON.parse(readFileSync(new URL("../fixtures/installed-goldens.json", import.meta.url), "utf8"));
  for (const [file, id, command] of [["cargo_test_success.txt", "cargo-test", "cargo test --color never"],
    ["cargo_build_success.txt", "cargo-build", "cargo build --color never"]]) {
    const input = readFileSync(new URL(`../fixtures/runners/${file}`, import.meta.url), "utf8");
    const expected: string = installed.outputs[`runners/${file}`];
    assert.ok(expected); const result = filter(obs(input, command));
    assert.equal(result.status, "reduced");
    if (result.status !== "reduced") assert.fail("legacy Cargo must reduce");
    assert.equal(result.profile, id); assert.equal(result.replacement, expected);
    const reduction = cargoProfiles.find((entry) => entry.id === id)!.reduce(input, obs(input, command));
    assert.ok(reduction); assert.equal(evidence(input, reduction, anchors(expected)), expected);
  }
});
test("actual native Cargo core bytes and material flags match frozen independent goals", (t) => {
  const manifest = JSON.parse(read("manifest.json"));
  for (const entry of manifest.cases as NativeCase[]) {
    const observation = { ...obs(raw(entry.id), entry.command), termination: { kind: "exited", code: entry.exitCode } } as Observation;
    const result = filter(observation), saved = result.inputBytes - result.outputBytes;
    assert.equal(result.status, entry.expectedStatus); assert.equal(result.inputBytes, entry.original.bytes);
    assert.equal(result.outputBytes, entry.expected.bytes);
    assert.equal(saved >= 1024 && saved / result.inputBytes >= 0.1, entry.material);
    t.diagnostic(`${entry.id}: ${result.inputBytes} -> ${result.outputBytes} UTF-8 bytes; saved ${saved}; material=${entry.material}`);
  }
});
