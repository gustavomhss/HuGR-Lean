import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filter } from "../src/core/index.js";
import { pyrightProfile } from "../src/profiles/pyright.js";
import type { Observation } from "../src/types.js";

const root = new URL("../fixtures/profiles/pyright/", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), "utf8");
const input = read("json-success.txt");
const command = JSON.parse(read("capture-receipt.json")).records.find((item: { name: string }) =>
  item.name === "L08-json-success").command as string;
function observation(output = input, patch: Partial<Observation> = {}): Observation {
  return { source: "shell", command, output, termination: { kind: "exited", code: 0 },
    completeness: "complete", presentation: "unknown", ...patch };
}
const run = (output = input, patch: Partial<Observation> = {}) =>
  filter(observation(output, patch), { profiles: [pyrightProfile] });
function exact(output: string, patch: Partial<Observation> = {}): void {
  const result = run(output, patch);
  assert.equal(result.status, "passthrough", JSON.stringify(patch));
  assert.equal("replacement" in result, false);
  assert.equal(result.inputBytes, result.outputBytes);
  assert.equal(result.outputBytes, Buffer.byteLength(output));
  assert.equal(pyrightProfile.reduce(output, observation(output, patch)), undefined);
}
function compacted(output: string, patch: Partial<Observation> = {}): string {
  const result = run(output, patch);
  assert.equal(result.status, "reduced", result.reason);
  assert.ok("replacement" in result);
  assert.ok(result.outputBytes < result.inputBytes);
  return result.replacement;
}
// Synthetic corruptions alter real captured native envelopes, not a parallel parser.
const changed = (alter: (value: any) => void, source = "json-multi-unicode.txt") => {
  const value = JSON.parse(read(source)); alter(value);
  return JSON.stringify(value, null, 2) + "\n\n";
};

test("L08 real native JSON success retains independent golden and both LF", () => {
  const result = filter(observation(), { profiles: [pyrightProfile] });
  assert.equal(result.status, "reduced", result.reason);
  assert.ok("replacement" in result);
  assert.equal(result.replacement, read("json-success.golden.txt"));
  assert.equal(result.inputBytes, 251);
  assert.equal(result.outputBytes, 171);
});

test("L08 real warning information and multifile Unicode tokens match independent goldens", () => {
  for (const [name, inputBytes, outputBytes] of [
    ["json-warning", 828, 484], ["json-information", 803, 473], ["json-multi-unicode", 2537, 1444],
  ] as const) {
    const raw = read(name + ".txt"), golden = read(name + ".golden.txt");
    assert.equal(compacted(raw), golden);
    assert.equal(Buffer.byteLength(raw), inputBytes);
    assert.equal(Buffer.byteLength(golden), outputBytes);
    assert.deepEqual(JSON.parse(golden), JSON.parse(raw));
  }
});

test("L08 file-only native manifest authenticates hashes metadata EOF and selected-profile dispositions", () => {
  const manifest = JSON.parse(read("cases.json"));
  const captures = [JSON.parse(read("capture-receipt.json")), JSON.parse(read("capture-json-receipt.json"))];
  assert.equal(manifest.schema, "hugr-lean/native-cases/1");
  const records = captures.flatMap(capture => capture.records);
  assert.deepEqual(manifest.cases.map((item: any) => item.name), records.map((item: any) => item.name));
  let savings = 0;
  for (const item of manifest.cases) {
    assert.equal(Object.hasOwn(item, "file"), true);
    assert.equal(Object.hasOwn(item, "output"), false);
    const raw = read(item.file), capture = captures.find(c => c.records.some((r: any) => r.name === item.name));
    const record = capture.records.find((r: any) => r.name === item.name);
    assert.equal(createHash("sha256").update(raw).digest("hex"), item.provenance.sha256);
    assert.equal(item.provenance.sha256, record.sha256);
    assert.equal(Buffer.byteLength(raw), record.bytes);
    assert.equal(item.command, record.command); assert.deepEqual(item.termination, record.termination);
    assert.equal(item.version + "\n", capture.versionOutput); assert.equal(item.platform, capture.platform);
    assert.equal(item.completeness, "complete"); assert.equal(item.presentation, "unknown");
    const result = run(raw, { command: item.command, termination: item.termination });
    assert.equal(result.status, item.status, item.name);
    if (item.status === "reduced") {
      assert.ok("replacement" in result); assert.equal(result.replacement, item.expected);
      assert.equal(item.expected, read(item.file.replace(".txt", ".golden.txt")));
      assert.ok(result.replacement.endsWith("}\n\n"));
      savings += result.inputBytes - result.outputBytes;
    } else exact(raw, { command: item.command, termination: item.termination });
  }
  assert.equal(savings, 1847);
  for (const capture of captures) for (const source of capture.sources) {
    const raw = read(source.file);
    assert.equal(Buffer.byteLength(raw), source.bytes);
    assert.equal(createHash("sha256").update(raw).digest("hex"), source.sha256);
  }
});

test("L08 finite direct original argv rejects flags wrappers and Unicode command tokens", () => {
  for (const executable of ["pyright", "/pyright", "/opt/other-tools/bin/pyright", command.split(" ")[0]!]) {
    const argv = [executable, "--outputjson", "other.py", "src tree"];
    assert.equal(pyrightProfile.match(argv), true);
    assert.equal(compacted(input, { command: `${executable} --outputjson other.py 'src tree'` }), read("json-success.golden.txt"));
  }
  for (const command of ["pyright", "pyright clean.py", "pyright --outputjson", "./pyright --outputjson other.py",
    "other/pyright --outputjson other.py", "/opt/bin/pyright-custom --outputjson other.py",
    "npx --no-install pyright --outputjson other.py", "node /bin/pyright --outputjson other.py",
    "python -m pyright --outputjson other.py", "env pyright --outputjson other.py",
    "MODE=json pyright --outputjson other.py", "pyright --outputjson other.py && echo done",
    "pyright --outputjson other.py; echo done", "pyright --outputjson $FILES",
    "pyright --outputjson 'café 🧪.py'", "pyright --outputjson ''",
    "pyright --outputjson other.py --outputjson", "pyright --outputjson -- other.py",
    "pyright --outputjson --stats other.py", "pyright --outputjson other.py --verbose",
    "pyright --outputjson --project config.json other.py", "pyright --outputjson --warnings other.py",
    "pyright --outputjson --watch other.py", "pyright --outputjson --level warning other.py",
    "pyright other.py --outputjson", "pyright --outputjson=true other.py",
  ]) exact(input, { command });
});

test("L08 closed native fields types required messages rules and paths refuse schema drift", () => {
  const paths: (string | number)[][] = [[], ["summary"], ["generalDiagnostics", 1],
    ["generalDiagnostics", 1, "range"], ["generalDiagnostics", 1, "range", "start"],
    ["generalDiagnostics", 1, "range", "end"], ["generalDiagnostics", 0]];
  const at = (value: any, path: (string | number)[]) => path.reduce((current, key) => current[key], value);
  for (const path of paths) {
    for (const key of Object.keys(at(JSON.parse(read("json-multi-unicode.txt")), path))) {
      exact(changed(value => { delete at(value, path)[key]; }));
    }
    for (const key of ["plugin", "metrics", "__proto__", "constructor"]) {
      exact(changed(value => Object.defineProperty(at(value, path), key, { value: "KEEP", enumerable: true })));
    }
  }
  for (const key of ["file", "message", "rule"]) {
    for (const invalid of [null, 0, {}, [], true, "", "   ", "bad\u001bcontrol"]) {
      exact(changed(value => { value.generalDiagnostics[1][key] = invalid; }));
    }
  }
  for (const invalid of ["relative.py", "/", "/a//file.py", "/a/../file.py", "/a\nfile.py", "C:\\file.py"]) {
    exact(changed(value => { value.generalDiagnostics[1].file = invalid; }));
  }
  for (const invalid of ["unusedVariable", "report", "report_unused", "reportUnusedVariable\n"]) {
    exact(changed(value => { value.generalDiagnostics[1].rule = invalid; }));
  }
  for (const invalid of ["1.1.409", null, 1]) exact(changed(value => { value.version = invalid; }));
  for (const invalid of ["", "0", "01", "1e3", "-1", "9007199254740992", 1791521454731, null]) {
    exact(changed(value => { value.time = invalid; }));
  }
  for (const invalid of [null, {}, [null], [1]]) exact(changed(value => { value.generalDiagnostics = invalid; }));
  for (const invalid of [null, [], 1]) exact(changed(value => { value.summary = invalid; }));
});

test("L08 zero errors and warning information file totals corroborate all diagnostics", () => {
  for (const key of ["errorCount", "warningCount", "informationCount", "filesAnalyzed"]) {
    for (const invalid of [-1, 1.5, "2", null, true, 9007199254740992]) {
      exact(changed(value => { value.summary[key] = invalid; }));
    }
  }
  exact(changed(value => { value.summary.errorCount = 1; }));
  exact(changed(value => { value.generalDiagnostics[1].severity = "error"; value.summary.errorCount = 1; }));
  exact(changed(value => { value.summary.warningCount = 1; }));
  exact(changed(value => { value.summary.informationCount = 3; }));
  exact(changed(value => { value.summary.filesAnalyzed = 2; }));
  exact(changed(value => { value.summary.filesAnalyzed = 0; }, "json-success.txt"));
  exact(changed(value => { value.generalDiagnostics.pop(); }));
  for (const invalid of [-1, "0.1", null, true, 1e100]) exact(changed(value => { value.summary.timeInSec = invalid; }));
});

test("L08 ranges require ordered safe zero-based positions and native file grouping", () => {
  for (const side of ["start", "end"]) for (const key of ["line", "character"]) {
    for (const invalid of [-1, 1.5, 9007199254740992, "1", null, true]) {
      exact(changed(value => { value.generalDiagnostics[1].range[side][key] = invalid; }));
    }
  }
  exact(changed(value => { value.generalDiagnostics[1].range.end = { line: 1, character: 3 }; }));
  exact(changed(value => { value.generalDiagnostics[1].range.end = { line: 0, character: 100 }; }));
  exact(changed(value => { [value.generalDiagnostics[1], value.generalDiagnostics[2]] =
    [value.generalDiagnostics[2], value.generalDiagnostics[1]]; }));
  exact(changed(value => { [value.generalDiagnostics[2], value.generalDiagnostics[3]] =
    [value.generalDiagnostics[3], value.generalDiagnostics[2]]; }));
  exact(changed(value => { value.generalDiagnostics.push(value.generalDiagnostics[3]); value.summary.warningCount++; }));
});

test("L08 duplicates noncanonical escapes numbers and mixed producer tails stay exact", () => {
  const raw = read("json-multi-unicode.txt");
  for (const output of [raw.replace('"version": "1.1.408",', '"version": "1.1.408", "version": "1.1.408",'),
    raw.replace('"line": 1,', '"line": 1, "line": 1,'),
    raw.replace('"warningCount": 2,', '"warningCount": 2, "warningCount": 2,'),
    raw.replace('"character": 12', '"character": 1.2e1'),
    raw.replace('"character": 12', '"character": 12.0'),
    raw.replace('"errorCount": 0', '"errorCount": -0'),
    raw.replace("café", "caf\\u00e9"), raw.replace("🧪", "\\ud83e\\uddea"),
    raw.replace('"version"', '"\\u0076ersion"'),
    raw + "plugin: finished\n", "plugin: finished\n" + raw, raw + input,
    raw + '\n{"version":"1.1.408"}\n\n', raw.slice(0, raw.indexOf('"summary"')),
    raw.replace("café", "café\u001b[0m"), "", "null\n\n", "[]\n\n"]) exact(output);
  for (const control of [0, 1, 8, 11, 12, 14, 27, 127, 128, 159]) {
    exact(changed(value => { value.generalDiagnostics[0].message += String.fromCharCode(control); }));
  }
});

test("L08 metadata nonzero incomplete and terminal presentation remain exact", () => {
  for (const patch of [{ source: "other" }, { completeness: "unknown" }, { completeness: "truncated" },
    { presentation: "terminal-rendered" }, { termination: { kind: "unknown" } },
    { termination: { kind: "timed_out" } }, { termination: { kind: "exited", code: 1 } },
    { termination: { kind: "exited", code: 3 } }] as const) exact(input, patch);
});

test("L08 native two-LF EOF is required retained and never a fake smaller reduction", () => {
  const golden = read("json-success.golden.txt");
  assert.equal(compacted(input), golden);
  for (const output of [input.slice(0, -1), input.slice(0, -2), input + "\n", input + " ",
    input.replaceAll("\n", "\r\n"), golden]) exact(output);
});

test("L08 UTF16 source spans retain every exact data token escapes Unicode and metrics", () => {
  const raw = changed(value => {
    value.generalDiagnostics[1].file = "/generic/漢字 café 🧪.py";
    value.generalDiagnostics[2].file = "/generic/漢字 café 🧪.py";
    value.generalDiagnostics[1].rule = "reportOtherRule";
    value.generalDiagnostics[1].message = 'keep  two spaces\tand\ncontext 🧪 "quoted" \\ body';
    value.time = "1791521454999"; value.summary.timeInSec = 12.345;
  });
  const result = compacted(raw), reduction = pyrightProfile.reduce(raw, observation(raw));
  assert.ok(reduction); assert.deepEqual(reduction.pieces, reduction.required);
  const tokens = (value: string) => value.match(/"(?:\\.|[^"\\])*"|[^\s"{}\[\],:]+|[{}\[\],:]/gu);
  assert.deepEqual(tokens(result), tokens(raw));
  assert.ok(result.includes('context 🧪 \\"quoted\\" \\\\ body'));
  assert.ok(result.includes('"time":"1791521454999"'));
  assert.ok(result.includes('"timeInSec":12.345'));
  let end = 0;
  for (const piece of reduction.pieces) {
    assert.ok(Array.isArray(piece)); const [start, stop] = piece;
    assert.ok(start >= end && stop > start && stop <= raw.length);
    for (const offset of [start, stop]) {
      const left = raw.charCodeAt(offset - 1), right = raw.charCodeAt(offset);
      assert.ok(!(left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff));
    }
    end = stop;
  }
  assert.deepEqual(reduction.required.at(-1), [raw.length - 2, raw.length]);
  assert.equal(reduction.pieces.map(piece => Array.isArray(piece) ? raw.slice(...piece) : "").join(""), result);
  assert.ok(Buffer.byteLength(raw) > raw.length); assert.ok(result.endsWith("}\n\n"));
});
