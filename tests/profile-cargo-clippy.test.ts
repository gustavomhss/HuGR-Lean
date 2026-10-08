import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filter } from "../src/core/engine.js";
import { familyProfiles } from "../src/profiles/cargo-clippy.js";
import type { Observation, Span } from "../src/types.js";

const root = new URL("../fixtures/profiles/cargo-clippy/", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), "utf8");
interface NativeCase {
  name: string; family: string; command: string; file: string; status: "reduced" | "passthrough";
  expectedFile?: string; termination: Observation["termination"];
  completeness: Observation["completeness"]; presentation: Observation["presentation"];
  version: unknown; platform: string; provenance: { sha256: string };
}
const packet = JSON.parse(read("cases.json")) as { schema: string; cases: NativeCase[] };
const observation = (output: string, command = "cargo clippy --workspace"): Observation => ({
  output, command, source: "shell", completeness: "complete", presentation: "terminal-rendered",
  termination: { kind: "exited", code: 0 },
});
const workspace = read("captures/workspace.txt");
const golden = read("captures/workspace.expected.txt");
function admitted(output: string, expected: string, command?: string): void {
  const obs = observation(output, command);
  const result = filter(obs, { profiles: familyProfiles });
  assert.equal(result.status, "reduced", command);
  if (result.status !== "reduced") assert.fail("missing reduction");
  assert.equal(result.profile, "cargo-clippy");
  assert.equal(result.replacement, expected);
  assert.equal(result.inputBytes, Buffer.byteLength(output));
  assert.equal(result.outputBytes, Buffer.byteLength(expected));
  const profile = familyProfiles[0]!;
  const reduced = profile.reduce(output, obs);
  assert.ok(reduced);
  const spans = reduced.pieces as readonly Span[];
  assert.ok(spans.every(span => Array.isArray(span)));
  // Independently require the entire contiguous golden suffix, including every blank row.
  const boundary = output.length - expected.length;
  assert.ok(reduced.required.some(([start, end]) => start === boundary && end === output.length));
  assert.equal(spans.map(span => output.slice(...span)).join(""), expected);
}
function exact(output: string, changes: Partial<Observation> = {}): void {
  const obs = { ...observation(output), ...changes };
  const result = filter(obs, { profiles: familyProfiles });
  assert.equal(result.status, "passthrough", output);
  assert.equal("replacement" in result, false);
  assert.equal(result.outputBytes, Buffer.byteLength(output));
  if (familyProfiles[0]?.match(obs.command.split(" ")))
    assert.equal(familyProfiles[0].reduce(output, obs), undefined, "profile must refuse directly");
}

test("C03 shared native schema, immutable capture hashes and complete case inventory", () => {
  assert.equal(packet.schema, "hugr-lean/native-cases/1");
  assert.deepEqual(packet.cases.map(c => c.name), ["workspace", "cache", "package-features-target", "checking-target", "workspace-features-target-cache", "two-packages", "deny-warnings", "collision", "profile-dev"].map(id => `C03/${id}`));
  for (const c of packet.cases) {
    assert.equal(c.family, "cargo-clippy");
    assert.ok(c.version && c.platform && c.provenance);
    assert.equal(createHash("sha256").update(read(c.file)).digest("hex"), c.provenance.sha256);
    assert.equal(c.completeness, "complete");
  }
});
test("C03 baseline empty profiles remain RED against independent golden reductions", () => {
  for (const c of packet.cases.filter(c => c.status === "reduced")) {
    assert.ok(c.expectedFile);
    const output = read(c.file), expected = read(c.expectedFile);
    assert.notEqual(output, expected);
    assert.equal(filter(observation(output, c.command), { profiles: [] }).status, "passthrough");
    admitted(output, expected, c.command);
  }
});
test("C03 native complete cache, failed -D warnings and real build-script collision exact", () => {
  for (const c of packet.cases.filter(c => c.status === "passthrough")) {
    const output = read(c.file);
    const result = filter({ ...observation(output, c.command), termination: c.termination }, { profiles: familyProfiles });
    assert.equal(result.status, "passthrough", c.name);
    assert.equal("replacement" in result, false);
  }
  exact(read("captures/deny-warnings.txt")); // Even falsely successful metadata cannot admit native errors.
  exact(read("captures/collision.txt"));
  exact(read("../../utility/cargo/warning/original.log"), { command: "cargo test --color never" });
});
test("C03 optional offline, generic identifiers, Unicode UTF-16 and CRLF exact suffix", () => {
  admitted(workspace, golden, "cargo clippy --offline --workspace");
  admitted(workspace, golden, "cargo clippy --workspace");
  admitted(workspace, golden, "cargo clippy");
  const transform = (text: string) => text.replaceAll("capture_alpha", "other_pkg").replaceAll("capture_beta", "second-pkg")
    .replaceAll("alpha/src", "源码/🦀/src").replaceAll("beta/src", "other/src").replaceAll("values.get(0)", "🦀.get(0)");
  admitted(transform(workspace), transform(golden), "cargo clippy -p other_pkg -p second-pkg --features other_pkg/feature_2 --target other-host-os --lib");
  admitted(transform(workspace).replaceAll("\n", "\r\n"), transform(golden).replaceAll("\n", "\r\n"));
  admitted(workspace.replace("Finished `dev`", "Finished `custom_17`"), golden.replace("Finished `dev`", "Finished `custom_17`"), "cargo clippy --profile custom_17");
});
test("C03 all diagnostic/help/URL/code/count/context/finish and later progress bytes retained", () => {
  admitted(workspace, golden);
  const later = "    Checking capture_beta";
  assert.ok(golden.indexOf(later) > golden.indexOf("generated 2 warnings"));
  for (const text of ["alpha/src/detail.rs:2:5", "help: try:", "clippy::get_first", "https://rust-lang.github.io", "generated 2 warnings", "(bin \"capture_alpha\")", "Finished `dev`"]) assert.ok(golden.includes(text));
  admitted(workspace.replace("in 0.96s", "in 2m 01s"), golden.replace("in 0.96s", "in 2m 01s"));
});
test("C03 unknown/unbound/new-format/C0/C1/native errors and incomplete grammar exact", () => {
  const bad = [
    `${workspace}opaque producer sentinel\n`, workspace.replace("warning:", "warning[future-format]:"),
    workspace.replace("  = help:", "unbound help:"), workspace.replace(" --> alpha", "  --> alpha"),
    workspace.replace("warning:", "error:"), workspace.replace("warning:", "warning: forged@0.1.0:"),
    workspace.slice(0, workspace.lastIndexOf("    Finished")), workspace.trimEnd(),
    workspace.replace("alpha/src/lib.rs:4:5", "alpha/src/lib.rs:0:5"),
    workspace.replace("4 |     values.get(0)", "5 |     values.get(0)"),
    workspace.replace("clippy::get_first", "clippy::other_code"),
    workspace.replace("  |     ^^^^^^^^^^^^^ help: try: `values.first()`\n", ""),
    workspace.replace("warning: `capture_alpha` (lib) generated 2 warnings", "warning: `capture_alpha` (lib) generated 1 warning"),
    workspace.replace("generated 2 warnings", "generated 2 warning"),
    workspace.replace("generated 1 warning (run", "generated 1 warnings (run"),
    workspace.replace("apply 2 suggestions", "apply 1 suggestion"),
    workspace.replace("-p capture_alpha -- `", "-p other_package -- `"),
    workspace.replace("    Checking capture_beta", "    Checking unknown format capture_beta"),
    workspace.replace("target(s) in", "target in"), `${workspace}\n`,
    workspace.replace("in 0.96s", "in 2m 60s"),
  ];
  for (const code of [0, 7, 11, 12, 27, 31, 127, 128, 159]) bad.push(workspace.replace("values.get", `${String.fromCharCode(code)}values.get`));
  for (const output of bad) exact(output);
});
test("C03 duplicate warning association/counts/plurals and premature progress exact", () => {
  const output = read("captures/package-features-target.txt");
  for (const bad of [
    output.replace("3 warnings (3 duplicates)", "3 warnings (2 duplicates)"),
    output.replace("3 warnings (3 duplicates)", "2 warnings (2 duplicates)"),
    output.replace("1 warning (1 duplicate)", "1 warning (1 duplicates)"),
    output.replace('(lib test) generated', '(bin "unseen" test) generated'),
    output.replace('(bin "capture_alpha") generated 1 warning (1 duplicate)', '(bin "unseen") generated 1 warning (1 duplicate)'),
    output.replace("warning: `capture_alpha` (lib) generated", "    Checking something v1.0.0 (/path)\nwarning: `capture_alpha` (lib) generated"),
  ]) exact(bad);
});
test("C03 metadata and unsupported argv exact; finite matching flags", () => {
  for (const changes of [
    { source: "other" }, { completeness: "unknown" }, { completeness: "truncated" },
    { termination: { kind: "unknown" } }, { termination: { kind: "timed_out" } },
    { termination: { kind: "exited", code: 101 } },
  ] as Partial<Observation>[]) exact(workspace, changes);
  for (const command of ["cargo build", "cargo clippy --watch", "cargo clippy --message-format=json", "cargo clippy --workspace --workspace", "cargo clippy -p", "cargo clippy --features", "cargo clippy --target", "cargo clippy --offline --offline", "cargo clippy -- --fix", "cargo clippy --workspace && cargo build", "RUSTFLAGS=x cargo clippy"]) exact(workspace, { command });
});
