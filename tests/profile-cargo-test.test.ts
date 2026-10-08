import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filter } from "../src/core/engine.js";
import { cargoProfiles } from "../src/profiles/cargo.js";
import { familyProfiles } from "../src/profiles/cargo-test.js";
import type { Observation } from "../src/types.js";

const root = new URL("../fixtures/profiles/cargo-test/", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), "utf8");
interface Case {
  name: string; command: string; file: string; expectedFile: string;
  status: "reduced" | "passthrough"; termination: Observation["termination"];
  completeness: Observation["completeness"]; presentation: Observation["presentation"];
  provenance: { receipt: string; case: string };
}
const cases: Case[] = JSON.parse(read("cases.json")).cases;
const observation = (c: Case, output = read(c.file)): Observation => ({
  source: "shell", command: c.command, output, termination: c.termination,
  completeness: c.completeness, presentation: c.presentation,
});
const profile = familyProfiles[0]!;
function exact(obs: Observation): void {
  const result = filter(obs, { profiles: familyProfiles });
  assert.equal(result.status, "passthrough", obs.command);
  assert.equal("replacement" in result, false);
  assert.equal(result.outputBytes, Buffer.byteLength(obs.output));
  assert.equal(profile.reduce(obs.output, obs), undefined, "refuse, not an unsafe no-noise reduction");
}
function accepted(obs: Observation, expected: string): void {
  const result = filter(obs, { profiles: familyProfiles });
  assert.equal(result.status, "reduced", obs.command);
  if (result.status !== "reduced") assert.fail("expected admission");
  assert.equal(result.profile, "cargo-test");
  assert.equal(result.replacement, expected);
  assert.equal(result.inputBytes, Buffer.byteLength(obs.output));
  assert.equal(result.outputBytes, Buffer.byteLength(expected));
  const reduction = profile.reduce(obs.output, obs)!;
  assert.ok(reduction);
  // Independent UTF-16 evidence check: every golden row must be both emitted and declared.
  let cursor = 0;
  for (const row of expected.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const at = obs.output.indexOf(row, cursor);
    assert.ok(at >= cursor, `source row missing: ${row}`);
    const end = at + row.length;
    assert.ok(reduction.required.some(([a, b]) => a <= at && b >= end), `required row missing: ${row}`);
    assert.ok(reduction.pieces.some(piece => !("text" in piece) && piece[0] <= at && piece[1] >= end));
    cursor = end;
  }
}

test("C02 exports cargo-test only; native inventory and original boundary hashes", () => {
  assert.deepEqual(familyProfiles.map(p => p.id), ["cargo-test"]);
  assert.equal(cases.length, 23);
  assert.equal(new Set(cases.map(c => c.name)).size, cases.length);
  for (const c of cases) {
    const receipt = JSON.parse(read(c.provenance.receipt));
    const r = receipt.cases.find((r: Case) => r.name === c.name);
    assert.ok(r, c.name);
    assert.equal(r.command, c.command);
    assert.equal(r.completeness, "complete");
    assert.deepEqual(r.termination, c.termination);
    assert.equal(r.error, null); assert.equal(r.signal, null);
    assert.equal(Buffer.byteLength(read(c.file)), r.boundary.bytes);
    assert.equal(createHash("sha256").update(read(c.file)).digest("hex"), r.boundary.sha256);
  }
});
for (const c of cases) {
  test(`${c.name}: public filter native golden; original baseline red or exact witness`, () => {
    const obs = observation(c), expected = read(c.expectedFile);
    assert.equal(filter(obs, { profiles: cargoProfiles }).status, "passthrough", "original parser remains narrow");
    if (c.status === "reduced") accepted(obs, expected);
    else { assert.equal(expected, obs.output); exact(obs); }
  });
}
const positives = cases.filter(c => c.status === "reduced");
for (const c of positives) {
  test(`${c.name}: Unicode UTF-16, CRLF, unterminated final row`, () => {
    const input = read(c.file), expected = read(c.expectedFile);
    accepted(observation(c, input.replaceAll("\n", "\r\n")), expected.replaceAll("\n", "\r\n"));
    accepted(observation(c, input.trimEnd()), expected.trimEnd());
    const unicode = (s: string) => s.replaceAll("/opencode/", "/🦀café/");
    accepted(observation(c, unicode(input)), unicode(expected));
  });
  test(`${c.name}: unknown insertions, missing headers/summaries, inconsistent counters, metadata`, () => {
    const input = read(c.file), obs = observation(c, input);
    const rows = input.match(/[^\n]*\n|[^\n]+$/g)!;
    let offset = 0;
    for (const row of rows) {
      exact(observation(c, input.slice(0, offset) + "opaque café 🦀\n" + input.slice(offset)));
      offset += row.length;
      if (row.startsWith("     Running") || row.startsWith("   Doc-tests") || row.startsWith("test result:") || row.startsWith("    Finished")) {
        exact(observation(c, input.replace(row, "")));
      }
    }
    exact(observation(c, input + "warning: opaque diagnostic\n"));
    for (const text of [input.replace(/(\d+) passed;/, "99 passed;"), input.replace("0 failed;", "1 failed;"),
      input.replace(/(\d+) ignored;/, "99 ignored;"), input.replace("0 measured;", "1 measured;"),
      input.replace(/(\d+) filtered out;/, "9007199254740993 filtered out;"), input.replace(/running \d+ tests?/, "running 99 tests")]) {
      assert.notEqual(text, input); exact(observation(c, text));
    }
    const summary = input.lastIndexOf("test result:");
    exact(observation(c, input.slice(0, summary)));
    exact(observation(c, input.slice(0, summary + 25)));
    for (const variant of [{ ...obs, termination: { kind: "exited", code: 101 } },
      { ...obs, termination: { kind: "unknown" } }, { ...obs, termination: { kind: "timed_out" } },
      { ...obs, completeness: "truncated" }, { ...obs, completeness: "unknown" }, { ...obs, source: "other" }] as Observation[]) exact(variant);
    for (const control of ["\0", "\x01", "\x1b[32m", "\x7f", "\x85", "\r"]) exact(observation(c, control + input));
  });
}
test("C02 baseline utility regression by reference: full/lib delegation, warning/failure refusal", () => {
  const base = new URL("../fixtures/utility/cargo/", import.meta.url);
  for (const id of ["full", "lib", "warning", "failure"]) {
    const output = readFileSync(new URL(`${id}/original.log`, base), "utf8");
    const expected = readFileSync(new URL(`${id}/${id}.expected.log`, base), "utf8");
    const obs: Observation = { source: "shell", command: id === "lib" ? "cargo test --lib --color never" : "cargo test --color never",
      output, completeness: "complete", presentation: "unknown", termination: { kind: "exited", code: id === "failure" ? 101 : 0 } };
    assert.deepEqual(filter(obs, { profiles: familyProfiles }), filter(obs, { profiles: cargoProfiles }));
    if (id === "full" || id === "lib") accepted(obs, expected); else exact(obs);
  }
});
test("C02 closed argv: flag boundaries, arity, duplicates, selectors, finite target/profile/thread values", () => {
  const c = cases.find(c => c.name === "C02/workspace-exclude")!;
  const invalid = ["--workspace --exclude", "-p", "--features", "--target", "--profile", "--test", "--bin", "--example",
    "--workspace --workspace --lib", "--lib --lib", "--lib --doc", "--all-targets --examples", "--lib --release --profile c02",
    "--color always --lib", "--color never --color=never --lib", "--offline --offline --lib", "--exclude c02-beta --lib",
    "-p c02-alpha -p c02-alpha --lib", "--features extra --all-features --lib", "--target aarch64-apple-darwin --lib",
    "--profile future --lib", "--lib -- --test-threads=0", "--lib -- --test-threads=2", "--lib -- --test-threads",
    "--lib -- --exact", "--lib tests::alpha_one", "--lib -- --ignored --include-ignored", "--lib -- --skip",
    "--lib -- --skip tests::logs --skip tests::logs", "--lib -- --offline", "--lib --exact", "--lib --",
    "--lib -- --quiet", "--lib -- --list", "--lib -- --nocapture", "--lib -- --show-output", "--doc -- --ignored",
    "--lib --message-format=json", "--benches", "--locked", "--lib && echo", "--lib | cat", "--lib -- --format=json"];
  for (const flags of invalid) {
    const command = `cargo test ${flags}`;
    assert.equal(profile.match(command.split(" ")), false, command);
    exact({ ...observation(c), command });
  }
});
test("C02 suite-local identities, selected contexts, target/profile paths and filtered count checks", () => {
  const c = cases.find(c => c.name === "C02/workspace")!, input = read(c.file);
  const mutations = [input.replace("test tests::alpha_one ... ok", "test tests::alpha_two ... ok"),
    input.replace("test tests::alpha_one ... ok", "test tests::bad-name ... ok"),
    input.replace("0 filtered out;", "1 filtered out;"), input.replace("4 passed;", "04 passed;"),
    input.replace("ignored, native skip: café 🦀 — retained", "FAILED"),
    input.replace("c02_beta-d56e829566416e7f)", "c02_alpha-dca8643900cca1fe)"),
    input.replace("0.00s", "NaNs"), input.replace("3.63s", "1m 60s")];
  for (const output of mutations) { assert.notEqual(output, input); exact(observation(c, output)); }
  for (const [stem, replacement] of [["package", "unittests src/bin/other.rs"], ["test-target", "tests/other.rs"],
    ["bin-target", "unittests src/lib.rs"], ["examples", "unittests src/lib.rs"]]) {
    const selected = cases.find(c => c.name === `C02/${stem}`)!;
    const output = read(selected.file).replace(/(unittests [^\s]+\.rs|tests\/[^\s]+\.rs)/, replacement!);
    exact(observation(selected, output));
  }
  for (const stem of ["target-release", "custom-profile"]) {
    const selected = cases.find(c => c.name === `C02/${stem}`)!;
    exact(observation(selected, read(selected.file).replaceAll(stem === "target-release" ? "/release/" : "/c02/", "/debug/")));
  }
  const selected = cases.find(c => c.name === "C02/exact-filter")!;
  exact(observation(selected, read(selected.file).replace("tests::alpha_one ...", "tests::alpha_two ...")));
});
test("C02 native diagnostics and forged log rows cannot reduce even with false exit-zero or safe argv", () => {
  for (const stem of ["failure", "nocapture-collision", "show-output-collision", "quiet", "list"]) {
    const c = cases.find(c => c.name === `C02/${stem}`)!;
    exact({ ...observation(c), termination: { kind: "exited", code: 0 }, command: "cargo test --offline -p c02-alpha --lib" });
  }
});
test("C02 duplicate suite aliases, balanced transfers, malformed doctest metrics and names refuse", () => {
  const workspace = cases.find(c => c.name === "C02/workspace")!, input = read(workspace.file);
  const first = input.slice(input.indexOf("     Running"), input.indexOf("     Running", input.indexOf("     Running") + 1));
  const relativeAlias = first.replace(/\([^()]+\/target\/debug\/deps\//, "(target/debug/deps/");
  exact(observation(workspace, input + relativeAlias));
  const balanced = input.replace("4 passed; 0 failed; 2 ignored;", "3 passed; 0 failed; 3 ignored;");
  exact(observation(workspace, balanced));
  const docs = cases.find(c => c.name === "C02/doc-target")!, text = read(docs.file);
  for (const output of [text.replace("19.58s", "NaNs"), text.replace("11.93s", "Infinitys"),
    text.replace("(line 1)", "(line 0)"), text.replace("(line 1)", "(line 9007199254740993)"),
    text.replace("(line 5)", "(line 1)"), text.replace("identity (line 1)", "bad-name (line 1)"),
    text + text.slice(text.indexOf("   Doc-tests"))]) {
    assert.notEqual(output, text); exact(observation(docs, output));
  }
  const multi = cases.find(c => c.name === "C02/multi-package")!;
  exact(observation(multi, read(multi.file).slice(0, read(multi.file).lastIndexOf("     Running"))));
});
test("C02 passing Rust Unicode identities remain admitted; invalid identifiers refuse", () => {
  const c = cases.find(c => c.name === "C02/package")!, input = read(c.file), expected = read(c.expectedFile);
  accepted(observation(c, input.replace("tests::beta_one", "tests::café_测试")), expected);
  for (const value of ["test tests::bad-name ... ok", "test tests::beta_one ... ok extra", "test invoice ... ok\x01"]) {
    exact(observation(c, input.replace("test tests::beta_one ... ok", value)));
  }
});
