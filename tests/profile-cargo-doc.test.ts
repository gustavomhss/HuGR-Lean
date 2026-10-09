import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { filter } from "../src/core/index.js";
import type { Observation } from "../src/types.js";
import { familyProfiles } from "../src/profiles/cargo-doc.js";

const root = new URL("../fixtures/profiles/cargo-doc/", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, root), "utf8");
const observation = (output: string, command = "cargo doc --offline"): Observation => ({
  output, command, source: "shell", termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown",
});
test("C05 default independent native golden positive", () => {
  const result = filter(observation(read("default/native.txt")), { profiles: familyProfiles });
  assert.equal(result.status, "reduced");
  assert.ok("replacement" in result);
  assert.equal(result.replacement, read("default/expected.txt"));
});

type Case = Omit<Observation, "output"> & { id: string; argv: string[]; outputFile: string; expectedProposalFile: string;
  rawSHA256: string; inputBytes: number; removableBytes: number; proposedDisposition: string;
  artifacts: { file: string; sha256: string }[]; provenance: { record: string; recipe: string; recipeSHA256: string; completedStream: boolean } };
const cases = (JSON.parse(read("cases.json")) as { schema: string; cases: Case[] });
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const run = (output: string, command?: string) => filter(observation(output, command), { profiles: familyProfiles });
function exact(output: string, command?: string, patch: Partial<Observation> = {}): void {
  const result = filter({ ...observation(output, command), ...patch }, { profiles: familyProfiles });
  assert.equal(result.status, "passthrough");
  assert.ok(!("replacement" in result));
  assert.equal(result.inputBytes, Buffer.byteLength(output));
  assert.equal(result.outputBytes, result.inputBytes);
}
test("C05 flat completed native provenance and literal economy", () => {
  assert.equal(cases.schema, "hugr-lean/native-cases/1");
  assert.deepEqual(cases.cases.map(c => c.id).sort(), ["default", "cached", "no-deps", "workspace", "package", "features",
    "explicit-target", "private-items", "workspace-warning", "opaque-log", "syntax-fail", "bins-warning", "checking-warning", "three-warning", "profile-path"].sort());
  assert.equal(cases.cases.reduce((sum, c) => sum + c.inputBytes, 0), 11215);
  assert.equal(cases.cases.reduce((sum, c) => sum + c.removableBytes, 0), 2661);
  for (const c of cases.cases) {
    const native = read(c.outputFile), expected = read(c.expectedProposalFile);
    assert.equal(sha(native), c.rawSHA256, c.id);
    assert.notEqual(sha(native + "x"), c.rawSHA256, "positive corruption control");
    assert.equal(Buffer.byteLength(native), c.inputBytes, c.id);
    assert.equal(Buffer.byteLength(native) - Buffer.byteLength(expected), c.removableBytes, c.id);
    assert.equal(sha(read(c.provenance.recipe)), c.provenance.recipeSHA256, c.id);
    assert.equal(c.provenance.record, "SOURCES.md");
    assert.ok(read(c.provenance.record).includes(c.provenance.recipeSHA256));
    assert.equal(c.command, c.argv.join(" "));
    assert.equal(c.completeness, "complete"); assert.equal(c.presentation, "unknown");
    assert.equal(c.provenance.completedStream, true); assert.ok(native.endsWith("\n"));
    const generated = /   Generated (.+\/index\.html)(?: and (\d+) other files?)?\n$/.exec(native);
    if (generated) assert.equal(c.artifacts.length, 1 + Number(generated[2] ?? 0));
  }
});
for (const c of cases.cases) test(`C05 ${c.id} independent public custom-filter golden`, () => {
  const output = read(c.outputFile), expected = read(c.expectedProposalFile);
  const result = filter({ ...c, output }, { profiles: familyProfiles });
  if (c.proposedDisposition === "reduced") {
    assert.equal(result.status, "reduced"); assert.ok("replacement" in result);
    assert.equal(result.profile, "cargo-doc"); assert.equal(result.replacement, expected);
    assert.equal(result.inputBytes - result.outputBytes, c.removableBytes);
  } else {
    assert.equal(result.status, "passthrough"); assert.ok(!("replacement" in result)); assert.equal(expected, output);
  }
});
test("C05 known warning later progress finish and artifacts remain mandatory", () => {
  const output = read("three-warning/native.txt"), obs = observation(output, cases.cases.find(c => c.id === "three-warning")!.command);
  const reduced = familyProfiles[0]!.reduce(output, obs);
  assert.ok(reduced);
  assert.deepEqual(reduced.required, [[output.indexOf("warning:"), output.length]]);
  const result = filter(obs, { profiles: familyProfiles });
  assert.ok("replacement" in result); assert.equal(result.replacement, read("three-warning/expected.txt"));
  assert.ok(result.replacement.includes(" Documenting doc-beta"));
  assert.ok(result.replacement.includes(" Documenting doc-gamma"));
  assert.ok(result.replacement.endsWith("index.html and 2 other files\n"));
});
test("C05 optional offline and generic package profile features target path values", () => {
  const c = cases.cases.find(c => c.id === "profile-path")!;
  const edits = (s: string) => s.replaceAll("doc-alpha", "audit-package").replaceAll("doc_alpha", "audit_package")
    .replaceAll("custom-doc", "audit-dev").replaceAll("x86_64-apple-darwin", "aarch64-unknown-linux-gnu")
    .replaceAll("missing_native_item", "another_native_item");
  const command = edits(c.command).replace("--offline ", "").replace("Cargo.toml", "'./other project/Cargo.toml'").replace("doc-warning", "audit-package/audit-feature");
  const result = run(edits(read(c.outputFile)), command);
  assert.equal(result.status, "reduced"); assert.ok("replacement" in result);
  assert.equal(result.replacement, edits(read(c.expectedProposalFile)));
  const plain = run(read("default/native.txt"), "cargo doc");
  assert.equal(plain.status, "reduced");
});
test("C05 UTF-16 spans and UTF-8 economy preserve astral source/path", () => {
  const edit = (s: string) => s.replaceAll("hugr-c05-doc-YIDrnP", "workspace-🦀-é").replace("intentionally warns.", "intentionally warns. 🦀");
  const output = edit(read("features/native.txt")), expected = edit(read("features/expected.txt"));
  const obs = observation(output, "cargo doc --features doc-warning --no-deps");
  const reduction = familyProfiles[0]!.reduce(output, obs);
  assert.ok(reduction); assert.deepEqual(reduction.required, [[output.indexOf("warning:"), output.length]]);
  assert.notEqual(output.indexOf("warning:"), Buffer.byteLength(output.slice(0, output.indexOf("warning:"))));
  const result = filter(obs, { profiles: familyProfiles });
  assert.ok("replacement" in result); assert.equal(result.replacement, expected);
  assert.equal(result.outputBytes, Buffer.byteLength(expected));
});
test("C05 whole grammar unknown rows at every boundary stay exact", () => {
  const c = cases.cases.find(c => c.id === "three-warning")!, output = read(c.outputFile);
  const rows = output.split("\n");
  for (let i = 0; i < rows.length; i++) {
    const changed = [...rows]; changed.splice(i, 0, "opaque native-looking log"); exact(changed.join("\n"), c.command);
  }
  for (const suffix of ["\n", " Documenting new-package v1.0.0 (/tmp/new)\n", "   Generated /tmp/doc/extra/index.html\n", "warning: new rustdoc variant\n"]) exact(output + suffix, c.command);
  exact(output.slice(0, -1), c.command);
  exact(output.replace("\n", "\r\n"), c.command);
});
test("C05 artifact path target/profile and generated counters guard", () => {
  const c = cases.cases.find(c => c.id === "explicit-target")!, output = read(c.outputFile);
  exact(output.replace("/x86_64-apple-darwin/doc/", "/wrong-target/doc/"), c.command);
  exact(output.replace("/doc/doc_alpha/", "/doc/unrelated_crate/"), c.command);
  for (const path of ["/doc/doc_alpha/no-index.html", "/doc/../index.html", "/doc//index.html", "/doc/doc_alpha/index.html/trailing"]) {
    exact(output.replace("/doc/doc_alpha/index.html", path), c.command);
  }
  exact(output.replace("`dev` profile", "`other` profile"), c.command);
  exact(output.replace("target(s) in 9.33s", "target(s) in NaNs"), c.command);
  exact(output.replace(/   Generated .+\n$/, ""), c.command);
  exact(output.replace(/^ Documenting [^\n]+\n/m, ""), c.command);
  const three = cases.cases.find(c => c.id === "three-warning")!, native = read(three.outputFile);
  for (const count of ["1 other file", "2 other file", "02 other files", "3 other files", "0 other files", "9007199254740992 other files"]) {
    exact(native.replace("2 other files", count), three.command);
  }
  exact(native.replace(" and 2 other files", ""), three.command);
  exact(native.replace(/^ Documenting doc-gamma[^\n]+\n/m, ""), three.command);
});
test("C05 diagnostic frames source context and warning counters guard", () => {
  const c = cases.cases.find(c => c.id === "features")!, output = read(c.outputFile);
  for (const [before, after] of [
    ["generated 1 warning", "generated 2 warnings"], ["generated 1 warning", "generated 2 warning"],
    ["generated 1 warning", "generated 1 warnings"],
    ["(lib doc)", "(lib)"], ["warning: `doc-alpha`", "warning: `wrong-package`"],
    ["lib.rs:7:15", "lib.rs:8:15"], ["lib.rs:7:15", "lib.rs:7:16"],
    ["7 | ///", "0 | ///"], ["no item named `missing_native_item`", "no item named `different_item`"],
    ["  = note:", "  = unexpected:"], ["  = help:", "  = unfamiliar:"],
  ]) exact(output.replace(before!, after!), c.command);
  const frame = output.slice(output.indexOf("warning:"), output.indexOf("warning: `"));
  exact(output.replace(frame, ""), c.command);
  exact(output.replace(frame, frame + frame).replace("generated 1 warning", "generated 2 warnings"), c.command);
  exact(output.replace(/warning: `[^\n]+\n/, ""), c.command);
});
test("C05 metadata failures unknown boundaries controls C0 C1 Cf stay exact", () => {
  const output = read("default/native.txt");
  for (const patch of [
    { source: "other" }, { completeness: "truncated" }, { completeness: "unknown" }, { presentation: "terminal-rendered" },
    { termination: { kind: "unknown" } }, { termination: { kind: "timed_out" } }, { termination: { kind: "exited", code: 101 } },
  ] as Partial<Observation>[]) exact(output, undefined, patch);
  exact(output.replace("   Compiling", "\u001b[32m   Compiling\u001b[0m"), undefined, { presentation: "terminal-rendered" });
  exact(output.replace(" Documenting", "error: could not document"));
  for (let code = 0; code <= 0x9f; code++) {
    if (code === 10 || (code >= 0x20 && code < 0x7f)) continue;
    exact(output.replace("/alpha)", `/al${String.fromCharCode(code)}pha)`));
  }
  for (const control of ["\u200b", "\u200d", "\u202e", "\ufeff"]) exact(output.replace("/alpha)", `/al${control}pha)`));
});
test("C05 finite direct argv refuses launchers unknown duplicate flags and incomplete values", () => {
  const output = read("default/native.txt");
  for (const command of ["npx cargo doc", "env cargo doc", "cargo doc --open", "cargo doc --release", "cargo doc --lib",
    "cargo doc --offline --offline", "cargo doc --target", "cargo doc --profile", "cargo doc --features",
    "cargo doc --manifest-path nope", "cargo doc --jobs 0", "cargo doc --workspace -p doc-alpha",
    "cargo doc --features ';log'", "cargo doc --no-deps=true", "cargo doc --offline && cargo doc"]) exact(output, command);
});
test("C05 unobserved Checking grammar remains conservative exact", () => {
  exact(read("default/native.txt").replace("   Compiling", "    Checking"));
  exact(read("default/native.txt").replace(" Documenting", "    Checking"));
  exact(read("cached/native.txt"));
});
