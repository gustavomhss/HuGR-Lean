import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filter } from "../src/core/index.js";
import { ruffProfile } from "../src/profiles/ruff.js";
import type { Observation } from "../src/types.js";

const root = new URL("../fixtures/profiles/ruff/", import.meta.url);
const receipt = JSON.parse(readFileSync(new URL("capture-receipt.json", root), "utf8"));
type FixtureCase = {
  name: string; family: string; command: string; expected?: string; status: "reduced" | "passthrough";
  version: string; platform: string; termination: Observation["termination"];
  completeness: Observation["completeness"]; presentation: Observation["presentation"];
  provenance: { sha256: string; record: string; originalCase: string };
} & ({ file: string; output?: never } | { output: string; file?: never });
const manifest: { schema: string; family: string; cases: FixtureCase[] } = JSON.parse(readFileSync(new URL("cases.json", root), "utf8"));
function fixtureOutput(item: FixtureCase): string {
  assert.notEqual(Object.hasOwn(item, "file"), Object.hasOwn(item, "output"), "Exactly one file or inline output");
  assert.match(item.provenance.sha256, /^[a-f0-9]{64}$/u);
  if (typeof item.file === "string") return readFileSync(new URL(item.file, root), "utf8");
  assert.equal(typeof item.output, "string");
  return item.output!;
}
const input: string = receipt.outputs["lint-json"].text;
// Independent explicit golden: every native token, field and value retained, no JSON.stringify oracle.
const golden = '[{"cell":null,"code":"F401","end_location":{"column":10,"row":1},"filename":"/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/L03-ruff-project/lint.py","fix":{"applicability":"safe","edits":[{"content":"","end_location":{"column":1,"row":2},"location":{"column":1,"row":1}}],"message":"Remove unused import: `os`"},"location":{"column":8,"row":1},"message":"`os` imported but unused","noqa_row":1,"url":"https://docs.astral.sh/ruff/rules/unused-import"},{"cell":null,"code":"F821","end_location":{"column":14,"row":4},"filename":"/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/L03-ruff-project/lint.py","fix":null,"location":{"column":7,"row":4},"message":"Undefined name `missing`","noqa_row":4,"url":"https://docs.astral.sh/ruff/rules/undefined-name"}]';
const original = receipt.cases.find((item: { id: string }) => item.id === "L03-check-json-exit-zero");
function observation(output = input, patch: Partial<Observation> = {}): Observation {
  return { source: "shell", command: original.argv.join(" "), output, termination: { kind: "exited", code: 0 },
    completeness: "complete", presentation: "unknown", ...patch };
}
const run = (output = input, patch: Partial<Observation> = {}) => filter(observation(output, patch), { profiles: [ruffProfile] });

test("L03 native JSON exit-zero has independent 790-byte source-preserving golden", () => {
  const result = run();
  assert.equal(result.status, "reduced");
  assert.ok("replacement" in result);
  assert.equal(result.replacement, golden);
  assert.equal(result.inputBytes, 1163);
  assert.equal(result.outputBytes, 790);
});

function exact(output: string, patch: Partial<Observation> = {}): void {
  const result = run(output, patch);
  assert.equal(result.status, "passthrough", JSON.stringify(patch));
  assert.equal("replacement" in result, false);
  assert.equal(result.inputBytes, result.outputBytes);
  assert.equal(result.outputBytes, Buffer.byteLength(output));
}
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const changed = (alter: (records: any[]) => void): string => {
  const records = JSON.parse(input); alter(records); return pretty(records);
};
function compacted(output: string): string {
  const result = run(output);
  assert.equal(result.status, "reduced"); assert.ok("replacement" in result);
  assert.ok(result.outputBytes < result.inputBytes);
  return result.replacement;
}

test("L03 capture sources/hashes and external native text retain original byte boundaries", () => {
  const files = ["clean", "lint", "fix", "syntax", "format-check", "format-diff", "format-write", "format-warning", "format-clean", "silent"];
  for (const [name, artifact] of Object.entries(receipt.outputs) as [string, any][]) {
    const bytes = Buffer.from(artifact.text);
    assert.equal(bytes.length, artifact.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256);
    if (files.includes(name)) assert.equal(readFileSync(new URL(`${name}.txt`, root), "utf8"), artifact.text);
  }
  for (const artifact of Object.values(receipt.sources) as any[]) {
    assert.equal(Buffer.byteLength(artifact.text), artifact.bytes);
    assert.equal(createHash("sha256").update(artifact.text).digest("hex"), artifact.sha256);
  }
  assert.deepEqual(receipt.cases.map((item: any) => item.id), [
    "L03-check-clean", "L03-check-failed", "L03-check-exit-zero", "L03-check-full",
    "L03-check-json-failed", "L03-check-json-exit-zero", "L03-check-fix", "L03-check-syntax",
    "L03-format-check", "L03-format-diff", "L03-format-json-preview-check", "L03-format-write",
    "L03-format-json-warning", "L03-format-json-preview-clean", "L03-format-clean", "L03-format-silent",
  ]);
  assert.equal(manifest.schema, "hugr-lean/native-cases/1");
  assert.deepEqual(manifest.cases.map((item) => item.name), receipt.cases.map((item: any) => item.id));
  for (const [index, item] of manifest.cases.entries()) {
    const original = receipt.cases[index], artifact = receipt.outputs[original.output];
    assert.equal(item.command, original.argv.join(" "));
    assert.equal(item.family, "ruff");
    assert.deepEqual(item.termination, { kind: "exited", code: original.receipt.exitCode });
    assert.equal(item.version + "\n", receipt.tool.version);
    assert.equal(item.platform, receipt.receiptDefaults.platform);
    assert.equal(item.completeness, "complete"); assert.equal(item.presentation, "unknown");
    assert.equal(item.provenance.record, "capture-receipt.json");
    assert.equal(item.provenance.originalCase, original.id);
    assert.equal(item.provenance.sha256, artifact.sha256);
    const output = fixtureOutput(item);
    assert.equal(output, artifact.text, `${item.name}: exact raw EOF and data`);
    assert.equal(Buffer.byteLength(output), artifact.bytes);
    assert.equal(createHash("sha256").update(output).digest("hex"), item.provenance.sha256);
    const result = run(output, { command: item.command, termination: item.termination,
      completeness: item.completeness, presentation: item.presentation });
    assert.equal(result.status, item.status);
    if (item.status === "reduced") {
      assert.equal(item.expected, golden); assert.ok("replacement" in result);
      assert.equal(result.replacement, item.expected);
      assert.equal(result.inputBytes - result.outputBytes, 373);
    } else {
      assert.equal(item.expected ?? output, output); assert.equal("replacement" in result, false);
      assert.equal(result.inputBytes, result.outputBytes);
    }
  }
  assert.deepEqual(manifest.cases.filter((item) => Object.hasOwn(item, "output")).map((item) => item.name), [
    "L03-check-json-failed", "L03-check-json-exit-zero", "L03-format-json-preview-check", "L03-format-json-preview-clean",
  ]);
  for (const item of manifest.cases.filter((item) => Object.hasOwn(item, "output"))) {
    assert.equal(fixtureOutput(item).endsWith("\n"), false);
    assert.equal(fixtureOutput(item).endsWith("]"), true);
  }
});

test("L03 failure/native/silent/formatter captures remain whole exact", () => {
  for (const item of receipt.cases) {
    if (item.id === "L03-check-json-exit-zero") continue;
    exact(receipt.outputs[item.output].text, {
      command: item.argv.join(" "), termination: { kind: "exited", code: item.receipt.exitCode },
    });
  }
});

test("L03 finite original argv: direct identity, generic absolute Unix ruff, no wrappers", () => {
  for (const executable of ["ruff", "/ruff", "/opt/other-tools/bin/ruff", receipt.tool.executable]) {
    for (const format of [["--output-format=json"], ["--output-format", "json"]]) {
      const argv = [executable, "check", ...format, "--exit-zero"];
      assert.equal(ruffProfile.match(argv), true);
      assert.equal(compactedForCommand(argv.join(" ")), golden);
      assert.equal(ruffProfile.match([...argv, "--isolated", "--no-cache", "other.py", "src"]), true);
    }
  }
  const base = ["ruff", "check", "--output-format=json", "--exit-zero"];
  for (const argv of [
    ["./ruff", ...base.slice(1)], ["other/ruff", ...base.slice(1)], ["/opt/ruff-custom", ...base.slice(1)],
    ["/opt/bin/Ruff", ...base.slice(1)], ["uv", "run", ...base], ["python", "-m", ...base],
    ["node", "/bin/ruff", ...base.slice(1)], ["npx", ...base], ["env", ...base],
    ["ruff", "format", ...base.slice(2)], ["ruff", "check", "--exit-zero"],
    ["ruff", "check", "--output-format=json"], [...base, "--fix"], [...base, "--preview"],
    [...base, "--statistics"], [...base, "--exit-zero"], [...base, "--output-format", "json"],
    ["ruff", "check", "--output-format=json", "--exit-zero", "file.py", "--no-cache"],
    ["ruff", "check", "--output-format", "full", "--exit-zero"],
    ["ruff", "check", "--output-format", "--exit-zero"],
  ]) {
    assert.equal(ruffProfile.match(argv), false, argv.join(" "));
    exact(input, { command: argv.join(" ") });
  }
  for (const command of ["RUFF_OUTPUT_FORMAT=json " + base.join(" "), base.join(" ") + " && echo done", "ruff check --exit-zero --output-format=json $FILES"]) exact(input, { command });
});
function compactedForCommand(command: string): string {
  const result = run(input, { command });
  assert.equal(result.status, "reduced"); assert.ok("replacement" in result);
  return result.replacement;
}

test("L03 every diagnostic/fix/edit/location field is mandatory; unknown schemas stay exact", () => {
  const paths: (string | number)[][] = [[], ["location"], ["end_location"], ["fix"], ["fix", "edits", 0],
    ["fix", "edits", 0, "location"], ["fix", "edits", 0, "end_location"]];
  const at = (records: any[], path: (string | number)[]) => path.reduce((value, key) => value[key], records[0]);
  for (const path of paths) {
    const record = at(JSON.parse(input), path);
    for (const key of Object.keys(record)) exact(changed((records) => { delete at(records, path)[key]; }));
    for (const key of ["custom", "metrics", "__proto__", "constructor"]) {
      exact(changed((records) => { Object.defineProperty(at(records, path), key, { value: "KEEP", enumerable: true }); }));
    }
  }
  exact(pretty({ diagnostics: JSON.parse(input) })); exact("[ ]");
  exact(changed((records) => { records.push(null); }));
  exact(changed((records) => { records[1].unknown = "second record must also validate"; }));
  for (const key of ["code", "filename", "message"]) {
    for (const value of [null, 1, [], {}]) exact(changed((records) => { records[0][key] = value; }));
  }
  for (const value of [1, "cell", {}, []]) exact(changed((records) => { records[0].cell = value; }));
  for (const value of [1, {}, []]) exact(changed((records) => { records[0].url = value; }));
  for (const value of [0, -1, 1.5, "1", true, {}, []]) exact(changed((records) => { records[0].noqa_row = value; }));
  for (const value of [[], {}, "fix", true]) exact(changed((records) => { records[0].fix = value; }));
  for (const value of ["display-only", null, 1]) exact(changed((records) => { records[0].fix.applicability = value; }));
  for (const value of [1, {}, []]) exact(changed((records) => { records[0].fix.message = value; }));
  for (const value of [[], null, {}, [null]]) exact(changed((records) => { records[0].fix.edits = value; }));
  for (const value of [null, 1, []]) exact(changed((records) => { records[0].fix.edits[0].content = value; }));
});

test("L03 positions and edit ranges are safe positive integers, ordered and non-overlapping", () => {
  for (const path of ["location", "end_location"]) {
    for (const key of ["row", "column"]) {
      for (const value of [0, -1, 1.5, 9007199254740992, "1", null, true]) {
        exact(changed((records) => { records[0][path][key] = value; }));
        exact(changed((records) => { records[0].fix.edits[0][path][key] = value; }));
      }
    }
  }
  exact(changed((records) => { records[0].end_location = { row: 1, column: 7 }; }));
  exact(changed((records) => { records[0].location = { row: 2, column: 1 }; records[0].end_location = { row: 1, column: 100 }; }));
  exact(changed((records) => { records[0].end_location = { row: 0, column: 100 }; }));
  exact(changed((records) => { records[0].fix.edits[0].location = { row: 3, column: 1 }; }));
  for (const next of [{ row: 1, column: 2 }, { row: 1, column: 1 }]) {
    exact(changed((records) => { records[0].fix.edits.push({ content: "x", location: next, end_location: { row: 4, column: 1 } }); }));
  }
  const insertion = changed((records) => {
    records[0].fix.edits[0] = { content: "insert 🧪", location: { row: 1, column: 1 }, end_location: { row: 1, column: 1 } };
  });
  assert.equal(compacted(insertion), JSON.stringify(JSON.parse(insertion)));
});

test("L03 generic values, Unicode bodies, unsafe/multiple edits and metrics positions all survive", () => {
  const value = JSON.parse(input);
  value[0].code = "CUSTOM123"; value[0].filename = "/other/漢字 café 🧪.py";
  value[0].message = "keep  two spaces\tand\nnewline café 🧪";
  value[0].fix.applicability = "unsafe"; value[0].fix.message = null;
  value[0].fix.edits[0].content = '  café 🧪\n  "body"  \\ keep';
  value[0].fix.edits.push({ content: "second", location: { row: 3, column: 4 }, end_location: { row: 5, column: 2 } });
  value[0].noqa_row = null; value[0].url = null;
  const raw = pretty(value), expected = JSON.stringify(value);
  assert.equal(compacted(raw), expected);
  assert.deepEqual(JSON.parse(compacted(raw)), value);
  const reduction = ruffProfile.reduce(raw, observation(raw)); assert.ok(reduction);
  assert.deepEqual(reduction.pieces, reduction.required);
  let end = 0;
  for (const piece of reduction.pieces) {
    assert.ok(Array.isArray(piece)); const [start, stop] = piece;
    assert.ok(start >= end && stop > start && stop <= raw.length);
    assert.ok(!(raw.charCodeAt(start - 1) >= 0xd800 && raw.charCodeAt(start - 1) <= 0xdbff));
    end = stop;
  }
  assert.equal(reduction.pieces.map((piece) => Array.isArray(piece) ? raw.slice(...piece) : "").join(""), expected);
  assert.equal(compacted(raw.replaceAll("\n", "\r\n")), expected);
});

test("L03 original metadata and unknown tails/duplicates/alternate spellings stay exact", () => {
  for (const patch of [{ source: "other" }, { completeness: "unknown" }, { completeness: "truncated" },
    { termination: { kind: "unknown" } }, { termination: { kind: "timed_out" } },
    { termination: { kind: "exited", code: 1 } }, { termination: { kind: "exited", code: 2 } }] as const) {
    exact(input, patch); assert.equal(ruffProfile.reduce(input, observation(input, patch)), undefined);
  }
  for (const output of [input + "\nwarning: keep", "warning: keep\n" + input, input + "{}", input.slice(0, -1),
    input.replace('"cell": null,', '"cell": null, "cell": null,'), input.replace('"column": 10,', '"column": 10, "column": 10,'),
    input.replace('"code": "F401"', '"code": "\\u0046401"'), input.replace('"column": 10', '"column": 1e1'),
    input.replace('"column": 10', '"column": 10.0'), "", "null", "[]", golden]) exact(output);
  for (let code = 0; code <= 0x9f; code++) {
    if (code > 0x1f && code < 0x7f) continue;
    const output = input.replace("imported but unused", "imported but unused" + String.fromCharCode(code));
    exact(output);
  }
});
