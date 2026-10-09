import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filter } from "../src/core/index.js";
import { pylintProfile } from "../src/profiles/pylint.js";
import type { Observation } from "../src/types.js";

const root = new URL("../fixtures/profiles/pylint/", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), "utf8");
const receipt = JSON.parse(read("capture-receipt.json"));
const eligible = ["json-exit-zero", "json-reports", "json2-exit-zero", "json2-reports"];
const commandFor = (suffix: string): string => receipt.cases.find((entry: any) => entry.name === "L06-" + suffix)
  .command.map((word: string) => /^[A-Za-z0-9_./:+,=-]+$/u.test(word) ? word : JSON.stringify(word)).join(" ");
const input = read("L06-json2-exit-zero.txt");
function observation(output = input, patch: Partial<Observation> = {}): Observation {
  return { source: "shell", command: commandFor("json2-exit-zero"), output,
    termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown", ...patch };
}
const run = (output = input, patch: Partial<Observation> = {}) => filter(observation(output, patch), { profiles: [pylintProfile] });
function exact(output = input, patch: Partial<Observation> = {}): void {
  const result = run(output, patch);
  assert.equal(result.status, "passthrough", result.reason + " " + JSON.stringify(patch));
  assert.equal("replacement" in result, false);
  assert.equal(result.inputBytes, result.outputBytes);
  assert.equal(result.inputBytes, Buffer.byteLength(output));
  assert.equal(pylintProfile.reduce(output, observation(output, patch)), undefined);
}
function compacted(output = input, patch: Partial<Observation> = {}): string {
  const result = run(output, patch);
  assert.equal(result.status, "reduced", result.reason);
  assert.ok("replacement" in result); assert.ok(result.inputBytes > result.outputBytes);
  return result.replacement;
}
const changed = (alter: (value: any) => void, suffix = "json2-exit-zero") => {
  const value = JSON.parse(read("L06-" + suffix + ".txt")); alter(value);
  return JSON.stringify(value, null, 4) + "\n";
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

test("L06 native canonical candidates match independent captured goldens", () => {
  let saved = 0;
  for (const suffix of eligible) {
    const raw = read("L06-" + suffix + ".txt"), golden = read("L06-" + suffix + ".candidate.txt");
    const result = run(raw, { command: commandFor(suffix) });
    assert.equal(result.status, "reduced", suffix + ": " + result.reason);
    assert.ok("replacement" in result); assert.equal(result.replacement, golden);
    assert.deepEqual(JSON.parse(golden), JSON.parse(raw));
    saved += result.inputBytes - result.outputBytes;
  }
  assert.equal(saved, 1894);
});

test("L06 manifest binds immutable native sources hashes metadata and dispositions", () => {
  const manifest = JSON.parse(read("cases.json"));
  assert.equal(manifest.schema, "hugr-lean/native-cases/1");
  assert.deepEqual(manifest.cases.map((entry: any) => entry.name), receipt.cases.map((entry: any) => entry.name));
  assert.equal(manifest.cases.length, 41);
  let saved = 0;
  for (const entry of manifest.cases) {
    const fact = receipt.cases.find((item: any) => item.name === entry.name), raw = read(entry.file);
    assert.equal(Object.hasOwn(entry, "output"), false);
    assert.equal(hash(raw), entry.provenance.sha256); assert.equal(hash(raw), fact.boundary.sha256);
    assert.equal(Buffer.byteLength(raw), fact.boundary.bytes);
    assert.equal(fact.boundary.readThroughEOF, true); assert.equal(raw.endsWith("\n"), fact.boundary.finalLF);
    assert.equal(Buffer.from(raw).subarray(-32).toString("hex"), fact.boundary.lastBytesHex);
    assert.deepEqual(entry.command, fact.command); assert.deepEqual(entry.termination, fact.termination);
    assert.equal(entry.version, fact.version); assert.equal(entry.platform, fact.platform);
    assert.equal(entry.completeness, fact.completeness); assert.equal(entry.presentation, fact.presentation);
    const patch = { command: commandFor(entry.name.slice(4)), termination: entry.termination };
    const result = run(raw, patch); assert.equal(result.status, entry.status, entry.name);
    if (entry.status === "reduced") {
      assert.ok("replacement" in result); assert.equal(result.replacement, read(entry.expectedFile));
      assert.equal(read(entry.expectedFile), read(entry.file.replace(".txt", ".candidate.txt")));
      saved += result.inputBytes - result.outputBytes;
    } else exact(raw, patch);
  }
  assert.equal(saved, 1894);
  assert.equal(hash(read("capture.py")), receipt.recipe.sha256);
  assert.equal(hash(read("install-report.json")), receipt.installation.sha256);
  assert.equal(hash(read(receipt.producerSource.licenseFile)), receipt.producerSource.sha256);
  for (const source of receipt.inputs) {
    assert.equal(hash(read(source.path)), source.sha256); assert.equal(Buffer.byteLength(read(source.path)), source.bytes);
  }
  assert.ok(manifest.archives.every((file: unknown) => typeof file === "string"));
});

test("L06 witnessed finite launchers and explicit formats reject argv drift", () => {
  const launchers = JSON.parse(read("launcher-receipt.json"));
  for (const record of launchers.records) {
    const raw = read(record.file), command = record.command.join(" ");
    assert.equal(hash(raw), record.boundary.sha256); assert.equal(Buffer.byteLength(raw), record.boundary.bytes);
    assert.equal(compacted(raw, { command }), read("L06-json-reports.candidate.txt"));
  }
  for (const command of ["pylint clean.py", "pylint --output-format=json", "pylint --output-format=json2",
    "pylint --output-format=text clean.py", "pylint --output-format=json,json2 clean.py",
    "pylint --output-format json2 clean.py", "pylint -f json2 clean.py", "pylint --output-format=json2 ''",
    "./pylint --output-format=json2 clean.py", "node pylint --output-format=json2 clean.py",
    "npx pylint --output-format=json2 clean.py", "env pylint --output-format=json2 clean.py",
    "MODE=json pylint --output-format=json2 clean.py", "python -m other --output-format=json2 clean.py",
    "python3.14 -m pylint --output-format=json2 clean.py", "pylint --output-format=json2 ../clean.py",
    "pylint --output-format=json2 'café.py'", "pylint --output-format=json2 clean.py && echo ok",
    "pylint --output-format=json2 clean.py; echo ok", "pylint --output-format=json2 $FILES",
    "pylint --output-format=json2 --output-format=json2 clean.py", "pylint --output-format=json2 clean.py --exit-zero",
    "pylint --output-format=json2 --jobs=2 clean.py", "pylint --output-format=json2 --verbose clean.py",
    "pylint --output-format=json2 --reports=no clean.py", "pylint --output-format=json2 --load-plugins=p clean.py",
    "pylint --output-format=json2 --evaluation=10 clean.py", "pylint --output-format=json2 --rcfile=../bad.rc clean.py",
    "pylint --output-format=json2 -- clean.py", "pylint --output-format=json2 clean.py clean.txt"]) exact(input, { command });
  exact(input, { command: commandFor("json-exit-zero") });
  exact(read("L06-json-exit-zero.txt")); // Array is not JSON2.
});

test("L06 closed distinct keys and types refuse unknown missing nested fields", () => {
  for (const suffix of ["json-exit-zero", "json2-exit-zero"]) {
    const raw = JSON.parse(read("L06-" + suffix + ".txt"));
    const paths: (string | number)[][] = suffix.startsWith("json2") ? [[], ["messages", 0], ["statistics"], ["statistics", "messageTypeCount"]] : [[0]];
    const at = (value: any, keys: (string | number)[]) => keys.reduce((current, key) => current[key], value);
    for (const path of paths) {
      for (const key of Object.keys(at(raw, path))) exact(changed(value => { delete at(value, path)[key]; }, suffix), { command: commandFor(suffix) });
      for (const key of ["plugin", "metrics", "__proto__", "constructor"]) {
        exact(changed(value => { Object.defineProperty(at(value, path), key, { value: 1, enumerable: true }); }, suffix), { command: commandFor(suffix) });
      }
    }
  }
  for (const invalid of [null, 0, "", {}, [null], [1]]) {
    exact(JSON.stringify(invalid, null, 4) + "\n");
    exact(changed(value => { value.messages = invalid; }));
    exact(changed(value => { value.statistics = invalid; }));
  }
  for (const key of ["type", "module", "obj", "message", "symbol", "path", "absolutePath", "confidence", "messageId"]) {
    for (const invalid of [null, 0, true, {}, [], ["HIGH"], "bad\u001bcontrol"]) {
      exact(changed(value => { value.messages[0][key] = invalid; }));
    }
  }
});

test("L06 diagnostic categories codes strings and source associations stay coherent", () => {
  for (const [key, values] of Object.entries({
    type: ["fatal", "other", "ERROR", ""], messageId: ["W0602", "E123", "E12345", "X0602", "E0602\n"],
    symbol: ["", "Upper-case", "bad_symbol", "bad--symbol"], module: ["", "two modules", "../bad"],
    obj: ["bad object", ".."], message: ["", "   ", "bad\ud800"],
    path: ["", "a//x.py", "../x.py", "a/./x.py", "a\nx.py", "C:\\x.py", "config.toml"],
    absolutePath: ["relative.py", "/elsewhere/wrong.py", "/a//errors.py", "/a/../errors.py"],
    confidence: ["UNKNOWN", "high", "", ["HIGH"]],
  })) for (const invalid of values) exact(changed(value => { value.messages[0][key] = invalid; }));
  exact(changed(value => { value.messages[2].module = "different"; }));
  exact(changed(value => { value.messages[2].absolutePath = "/different/warning_case.py"; }));
  exact(changed(value => { value.messages.push(value.messages[0]); value.statistics.messageTypeCount.error++; }));
  exact(changed(value => {
    value.messages.push(Object.fromEntries(Object.entries(value.messages[2]).reverse()));
    value.statistics.messageTypeCount.warning++;
  }));
  exact(changed(value => { value.messages = [value.messages[1], value.messages[0], value.messages[2]]; }));
});

test("L06 ranges require safe native start and paired ordered end positions", () => {
  for (const key of ["line", "column", "endLine", "endColumn"]) for (const invalid of [-1, 1.5, "1", true, 9007199254740992]) {
    exact(changed(value => { value.messages[0][key] = invalid; }));
  }
  for (const alter of [(value: any) => { value.messages[0].line = 0; },
    (value: any) => { value.messages[0].endLine = 5; },
    (value: any) => { value.messages[0].endColumn = 10; },
    (value: any) => { value.messages[0].endLine = null; },
    (value: any) => { value.messages[0].endColumn = null; }]) exact(changed(alter));
  const raw = changed(value => { value.messages[0].endLine = null; value.messages[0].endColumn = null; });
  assert.deepEqual(JSON.parse(compacted(raw)), JSON.parse(raw));
});

test("L06 JSON2 counts modules and feasible default score corroborate diagnostics", () => {
  for (const key of ["fatal", "error", "warning", "refactor", "convention", "info"]) {
    for (const invalid of [-1, 1.5, "0", null, true, 9007199254740992]) {
      exact(changed(value => { value.statistics.messageTypeCount[key] = invalid; }));
    }
    exact(changed(value => { value.statistics.messageTypeCount[key]++; }));
  }
  for (const invalid of [0, 1, -1, 1.5, "5", null, true, 9007199254740992]) {
    exact(changed(value => { value.statistics.modulesLinted = invalid; }));
  }
  for (const invalid of [-1, 11, "0", null, true, 9.12345, 10]) {
    exact(changed(value => { value.statistics.score = invalid; }));
  }
  exact(changed(value => { value.messages.pop(); }));
  exact(changed(value => { value.statistics.score = 9; }, "json2-clean"));
  assert.ok(compacted(changed(value => { value.statistics.score = 10; }, "json2-clean")));
});

test("L06 duplicate keys noncanonical escapes numbers and malformed JSON refuse", () => {
  for (const output of [input.replace('"messages": [', '"messages": [], "messages": ['),
    input.replace('"line": 6,', '"line": 6, "line": 6,'),
    input.replace('"error": 1,', '"error": 1, "error": 1,'),
    input.replace('"line": 6,', '"line": 6.0,'), input.replace('"line": 6,', '"line": 6e0,'),
    input.replace('"score": 0', '"score": -0'), input.replace('"score": 0', '"score": 1e999'),
    input.replace('"messages"', '"\\u006dessages"'), input.replace('"errors.py"', '"errors\\u002epy"'),
    input.replace('"path": "errors.py"', '"path": "errors\\/file.py"'),
    input.replace('"messages": [', '"messages": [,'), input.slice(0, -3), "", "null\n", "{}\n"])
    exact(output);
  exact(read("L06-json2-clean.txt")); // Native 10.0 is deliberately refused by frozen canonical helper.
  const raw = changed(value => { value.messages[0].message += " café 😀"; });
  exact(raw.replace("café", "caf\\u00e9")); exact(raw.replace("😀", "\\ud83d\\ude00"));
});

test("L06 metadata and mixed producer prefix suffix verbose reports stay exact", () => {
  for (const patch of [{ source: "other" }, { completeness: "unknown" }, { completeness: "truncated" },
    { presentation: "terminal-rendered" }, { termination: { kind: "unknown" } },
    { termination: { kind: "timed_out" } }, { termination: { kind: "exited", code: 1 } },
    { termination: { kind: "exited", code: 6 } }] as const) exact(input, patch);
  for (const output of [input + "plugin: finished\n", "config: ignored\n" + input, input + input,
    input + "[]\n", "[]\n" + input, input + '{"statistics":{}}\n', input.slice(0, input.indexOf('"statistics"'))]) exact(output);
  for (const suffix of ["reports-clean", "reports-exit-zero", "config-fail", "plugin-missing", "plugin-native", "json-config-fail", "json2-config-fail", "json-plugin", "json2-plugin"]) {
    exact(read("L06-" + suffix + ".txt"));
  }
});

test("L06 UTF16 token spans retain all diagnostics paths escapes metrics and exact EOF", () => {
  for (const suffix of ["json-exit-zero", "json2-exit-zero"]) {
    const raw = changed(value => {
      const messages = Array.isArray(value) ? value : value.messages;
      messages[0].path = "tree 漢字/café 😀.py";
      if (!Array.isArray(value)) messages[0].absolutePath = "/other/tree 漢字/café 😀.py";
      messages[0].module = "別名"; messages[0].obj = "別名.func"; messages[0].symbol = "other-error";
      messages[0].message = 'keep  spaces\tand\ncontext 😀 "quoted" \\ body';
      messages[0].line = 100; messages[0].column = 99; messages[0].endLine = 101; messages[0].endColumn = 1;
    }, suffix);
    const command = commandFor(suffix), result = compacted(raw, { command });
    const reduction = pylintProfile.reduce(raw, observation(raw, { command })); assert.ok(reduction);
    assert.deepEqual(reduction.pieces, reduction.required);
    const tokens = (value: string) => value.match(/"(?:\\.|[^"\\])*"|[^\s"{}\[\],:]+|[{}\[\],:]/gu);
    assert.deepEqual(tokens(result), tokens(raw));
    assert.equal(result, JSON.stringify(JSON.parse(raw)) + "\n");
    assert.ok(result.includes('context 😀 \\"quoted\\" \\\\ body'));
    let end = 0;
    for (const piece of reduction.required) {
      const [start, stop] = piece; assert.ok(start >= end && stop > start && stop <= raw.length);
      for (const offset of [start, stop]) {
        const left = raw.charCodeAt(offset - 1), right = raw.charCodeAt(offset);
        assert.ok(!(left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff));
      }
      end = stop;
    }
    assert.deepEqual(reduction.required.at(-1), [raw.length - 1, raw.length]);
    assert.ok(Buffer.byteLength(raw) > raw.length);
  }
  const raw = changed(value => {
    for (const [index, type, code] of [[0, "convention", "C1234"], [1, "refactor", "R1234"], [2, "info", "I1234"]] as const) {
      value.messages[index].type = type; value.messages[index].messageId = code;
    }
    value.statistics.messageTypeCount = { fatal: 0, error: 0, warning: 0, refactor: 1, convention: 1, info: 1 };
    value.statistics.score = 0;
  });
  assert.equal(compacted(raw), JSON.stringify(JSON.parse(raw)) + "\n");
});

test("L06 terminal whitespace source span prevents EOF deletion and fake savings", () => {
  for (const tail of ["\n", "\n\n", "\r\n", "\n \t\r\n"]) {
    const raw = input.trimEnd() + tail;
    assert.equal(compacted(raw), JSON.stringify(JSON.parse(raw)) + tail);
    const reduction = pylintProfile.reduce(raw, observation(raw)); assert.ok(reduction);
    assert.deepEqual(reduction.required.at(-1), [raw.length - tail.length, raw.length]);
  }
  exact(input.trimEnd()); exact(input + " ");
  exact(read("L06-json2-exit-zero.candidate.txt"));
  exact("[]\n", { command: commandFor("json-exit-zero") });
});
