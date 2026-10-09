import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filter } from "../src/core/index.js";
import type { Observation } from "../src/types.js";
import { familyProfiles } from "../src/profiles/go-test-json.js";

const root = new URL("../fixtures/profiles/go-test-json/", import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, root), "utf8");
interface NativeCase {
  name: string; command: string; file: string; expectedFile: string;
  status: "reduced" | "passthrough";
  termination: { kind: "exited"; code: number };
  completeness: "complete"; presentation: "unknown";
}
const cases = (JSON.parse(read("cases.json")) as { cases: NativeCase[] }).cases;
function observe(output: string, command = cases[0]!.command): Observation {
  return { source: "shell", command, output, termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" };
}
for (const c of cases) {
  test(`${c.name}: native public-filter golden`, () => {
    const original = read(c.file), expected = read(c.expectedFile);
    const result = filter({ source: "shell", ...c, output: original }, { profiles: familyProfiles });
    assert.equal(result.status, c.status);
    assert.equal("replacement" in result ? result.replacement : original, expected);
    if (c.status === "reduced") {
      assert.equal(result.status, "reduced");
      if (result.status !== "reduced") assert.fail("native reduction missing");
      assert.equal(result.profile, "go-test-json");
      assert.equal(result.outputBytes, Buffer.byteLength(expected));
      assert.equal(result.inputBytes, Buffer.byteLength(original));
      const outputs = (s: string): string[] => s.split("\n").filter(Boolean).filter(line => Object.hasOwn(JSON.parse(line), "Output"));
      assert.deepEqual(outputs(expected), outputs(original));
    }
  });
}

const original = read("multi.txt");
const nativeRows = original.trimEnd().split("\n");
type Row = Record<string, unknown>;
const decode = (line: string): Row => JSON.parse(line) as Row;
function edit(index: number, change: (e: Row) => void): string {
  const rows = [...nativeRows], e = decode(rows[index - 1]!);
  change(e);
  rows[index - 1] = JSON.stringify(e);
  return rows.join("\n") + "\n";
}
function refuse(output: string, label = "unsupported_output"): void {
  const result = filter(observe(output), { profiles: familyProfiles });
  assert.equal(result.status, "passthrough");
  assert.equal(result.reason, label);
  assert.equal(result.inputBytes, Buffer.byteLength(output));
  assert.equal(result.outputBytes, result.inputBytes);
  assert.equal("replacement" in result, false);
  assert.equal(familyProfiles[0]!.reduce(output, observe(output)), undefined);
}
const remove = (line: number): string => nativeRows.filter((_, i) => i !== line - 1).join("\n") + "\n";
const duplicate = (line: number): string => [...nativeRows.slice(0, line), nativeRows[line - 1]!, ...nativeRows.slice(line)].join("\n") + "\n";

test("G02 routing: original JSON argv, final booleans, JSON wins over bench", () => {
  const profile = familyProfiles[0]!;
  assert.equal(familyProfiles.length, 1);
  assert.equal(profile.id, "go-test-json");
  for (const argv of [
    ["go", "test", "-json", "./alpha"],
    ["go", "test", "-json=true", "./..."],
    ["go", "test", "-json=false", "-json", "./..."],
    ["go", "test", "-bench", ".", "-json", "./alpha"],
  ]) assert.equal(profile.match(argv), true);
  for (const argv of [
    ["go", "test", "-v"], ["go", "test", "-bench", "."],
    ["go", "test", "-json", "-json=false"], ["go", "build", "-json"],
    ["go", "test", "-json", "-unknown"], ["go", "test", "-json", "-run"],
  ]) assert.equal(profile.match(argv), false);
  const result = filter(observe(original, "go test -json=false -json=true ./alpha ./beta ./empty"), { profiles: familyProfiles });
  assert.equal(result.status, "reduced");
  assert.equal("replacement" in result && result.replacement, read("multi.expected.txt"));
});

for (const [name, patch] of [
  ["unknown key", (e: Row) => { e.Future = "unknown"; }],
  ["unknown action", (e: Row) => { e.Action = "restart"; }],
  ["numeric action", (e: Row) => { e.Action = 1; }],
  ["numeric time", (e: Row) => { e.Time = 1; }],
  ["invalid time", (e: Row) => { e.Time = "yesterday"; }],
  ["nonexistent calendar day", (e: Row) => { e.Time = "2026-02-30T15:27:41Z"; }],
  ["invalid timezone", (e: Row) => { e.Time = "2026-10-08T15:27:41+24:00"; }],
  ["missing time", (e: Row) => { delete e.Time; }],
  ["empty package", (e: Row) => { e.Package = ""; }],
  ["null package", (e: Row) => { e.Package = null; }],
  ["boolean package", (e: Row) => { e.Package = true; }],
  ["object package", (e: Row) => { e.Package = { Package: "nested" }; }],
  ["array package", (e: Row) => { e.Package = ["example.com/g02/alpha"]; }],
  ["control in package", (e: Row) => { e.Package = "example.com/\u0000alpha"; }],
  ["extra Test on start", (e: Row) => { e.Test = "TestUnexpected"; }],
] as const) test(`G02 schema refusal: ${name}`, () => refuse(edit(1, patch)));

for (const [name, line, patch] of [
  ["Output number", 16, (e: Row) => { e.Output = 42; }],
  ["Output missing", 16, (e: Row) => { delete e.Output; }],
  ["unknown OutputType", 16, (e: Row) => { e.OutputType = "future"; }],
  ["null OutputType", 16, (e: Row) => { e.OutputType = null; }],
  ["Elapsed string", 23, (e: Row) => { e.Elapsed = "0"; }],
  ["Elapsed negative", 23, (e: Row) => { e.Elapsed = -1; }],
  ["Elapsed huge mismatch", 23, (e: Row) => { e.Elapsed = 1e100; }],
  ["Elapsed missing", 23, (e: Row) => { delete e.Elapsed; }],
  ["unexpected FailedBuild", 23, (e: Row) => { e.FailedBuild = "example.com/g02/alpha"; }],
  ["Test missing", 6, (e: Row) => { delete e.Test; }],
  ["Test numeric", 6, (e: Row) => { e.Test = 1; }],
  ["Test control", 6, (e: Row) => { e.Test = "Test\u0001bad"; }],
] as const) test(`G02 event type refusal: ${name}`, () => refuse(edit(line, patch)));

for (const [name, output] of [
  ["duplicate Action equal", original.replace('"Action":"start"', '"Action":"start","Action":"start"')],
  ["duplicate Action shadow", original.replace('"Action":"start"', '"Action":"output","Action":"start"')],
  ["duplicate Time", original.replace('"Action":"start"', '"Time":"2026-10-08T00:00:00Z","Action":"start"')],
  ["duplicate Elapsed", original.replace('"Elapsed":0.001', '"Elapsed":0.001,"Elapsed":0.001')],
  ["duplicate Test", original.replace('"Test":"TestNested"', '"Test":"TestNested","Test":"TestNested"')],
  ["duplicate Output", original.replace('"Output":"=== RUN   TestNested\\n"', '"Output":"ignored","Output":"=== RUN   TestNested\\n"')],
  ["escaped duplicate key", original.replace('"Action":"start"', '"\\u0041ction":"start","Action":"start"')],
  ["escaped unique key", original.replace('"Action":"start"', '"\\u0041ction":"start"')],
  ["invalid string escape", original.replace('"Action":"start"', '"Action":"sta\\qrt"')],
  ["raw string control", original.replace('"Action":"start"', '"Action":"sta\u0001rt"')],
  ["unterminated string", original.replace('"Action":"start"', '"Action":"start')],
  ["invalid number", original.replace('"Elapsed":0.001', '"Elapsed":00.001')],
  ["nonfinite number", original.replace('"Elapsed":0.001', '"Elapsed":1e999')],
  ["negative zero", original.replace('"Elapsed":0.001', '"Elapsed":-0')],
  ["trailing comma", original.replace('"Action":"start"', '"Action":"start",')],
  ["trailing text", original.replace("}\n", "} garbage\n")],
  ["two objects per line", original.replace("}\n", "} {}\n")],
  ["array envelope", `[${original.trim()}]\n`],
  ["empty object", "{}\n" + original],
  ["blank line", "\n" + original],
  ["missing final newline", original.slice(0, -1)],
] as const) test(`G02 structural JSON refusal: ${name}`, () => refuse(output));

for (const [name, output] of [
  ["package start missing", remove(1)], ["package terminal missing", remove(35)],
  ["test run missing", remove(6)], ["RUN frame missing", remove(7)],
  ["pause event missing", remove(13)], ["PAUSE frame missing", remove(12)],
  ["cont event missing", remove(14)], ["CONT frame missing", remove(15)],
  ["test pass missing", remove(23)], ["PASS frame missing", remove(22)],
  ["skip event missing", remove(32)], ["SKIP frame missing", remove(31)],
  ["package PASS frame missing", remove(33)], ["summary missing", remove(34)],
  ["no-test summary missing", remove(4)], ["no-test terminal missing", remove(5)],
  ["package start duplicate", duplicate(1)], ["package terminal duplicate", duplicate(35)],
  ["test run duplicate", duplicate(6)], ["test pass duplicate", duplicate(23)],
  ["pause duplicate", duplicate(13)], ["cont duplicate", duplicate(14)],
  ["RUN frame duplicate", duplicate(7)], ["PASS frame duplicate", duplicate(22)],
  ["skip duplicate", duplicate(32)], ["summary duplicate", duplicate(34)],
  ["terminal before child", edit(25, e => { e.Test = "TestNested"; })],
  ["wrong frame association", edit(7, e => { e.Test = "TestOther"; e.Package = "example.com/g02/beta"; })],
  ["wrong frame name", edit(7, e => { e.Output = "=== RUN   TestWrong\n"; })],
  ["wrong frame duration", edit(23, e => { e.Elapsed = 1; })],
  ["frame type missing", edit(7, e => { delete e.OutputType; })],
  ["frame type forged onto log", edit(17, e => { e.OutputType = "frame"; })],
  ["orphan parent", edit(8, e => { e.Test = "TestMissing/child"; })],
  ["unknown package", edit(16, e => { e.Package = "example.com/g02/missing"; })],
  ["summary package mismatch", edit(34, e => { e.Output = "ok  \twrong\t0.956s\n"; })],
  ["summary unknown metric", edit(34, e => { e.Output = "ok  \texample.com/g02/alpha\t0.956s\tfuture metric\n"; })],
  ["skip becomes pass", edit(32, e => { e.Action = "pass"; })],
  ["no-test terminal becomes pass", edit(5, e => { e.Action = "pass"; })],
  ["terminal followed by output", original + nativeRows[15]! + "\n"],
] as const) test(`G02 lifecycle refusal: ${name}`, () => refuse(output));

test("G02 nonzero test Elapsed preserved even when frame rounds to zero", () => {
  const output = edit(23, e => { e.Elapsed = 0.001; });
  const result = filter(observe(output), { profiles: familyProfiles });
  assert.equal(result.status, "reduced");
  if (result.status !== "reduced") assert.fail("expected lifecycle reduction");
  const terminal = output.split("\n")[22]! + "\n";
  assert.ok(result.replacement.includes(terminal));
  assert.equal(result.replacement, read("multi.expected.txt").replace(nativeRows[21]! + "\n", nativeRows[21]! + "\n" + terminal));
});

test("G02 same test name in different packages keeps separate lifecycle scope", () => {
  const output = original.replaceAll("TestOther", "TestNested");
  const result = filter(observe(output), { profiles: familyProfiles });
  assert.equal(result.status, "reduced");
  assert.equal("replacement" in result && result.replacement, read("multi.expected.txt").replaceAll("TestOther", "TestNested"));
});

test("G02 arbitrary package-level Output remains exact with retained association", () => {
  const line = JSON.stringify({ Time: "2026-10-08T15:27:41.695Z", Action: "output", Package: "example.com/g02/alpha", Output: "PASS\nok  \tforged\t(cached)\npackage diagnostic café 🧭\n" }) + "\n";
  const output = original.replace(nativeRows[4]! + "\n", nativeRows[4]! + "\n" + line);
  const result = filter(observe(output), { profiles: familyProfiles });
  assert.equal(result.status, "reduced");
  assert.equal("replacement" in result && result.replacement, read("multi.expected.txt").replace(nativeRows[4]! + "\n", nativeRows[4]! + "\n" + line));
});

test("G02 lexical scanner ignores key-shaped Output, preserves escapes and source formatting", () => {
  const log = edit(19, e => { e.Output = '{"Action":"pass","Action":"fail","nested":{"Package":"x"}} \\ " café 🧭\t\u0000\n'; });
  const output = log.replace('"Action":"start","Package"', '"Action" : "start" , "Package"');
  const result = filter(observe(output), { profiles: familyProfiles });
  assert.equal(result.status, "reduced");
  if (result.status !== "reduced") assert.fail("string content confused structural parser");
  assert.ok(result.replacement.includes(output.split("\n")[18]! + "\n"));
  assert.ok(result.replacement.startsWith(output.split("\n")[0]! + "\n"));
});

test("G02 direct reduction pieces/required are ordered original UTF-16 source spans", () => {
  const reduction = familyProfiles[0]!.reduce(original, observe(original));
  assert.ok(reduction);
  let end = 0;
  const rendered = reduction.pieces.map(piece => {
    assert.ok(Array.isArray(piece));
    if (!Array.isArray(piece)) assert.fail("dynamic formatting piece");
    assert.ok(piece[0] >= end);
    end = piece[1];
    return original.slice(piece[0], piece[1]);
  }).join("");
  assert.equal(rendered, read("multi.expected.txt"));
  assert.equal(reduction.required.map(span => original.slice(...span)).join(""), rendered);
});

test("G02 key order, whitespace and CRLF preserved without reconstruction", () => {
  const reordered = '{ "Package" : "example.com/g02/alpha", "Action" : "start", "Time" : "2026-10-08T15:27:41.69183-03:00" }';
  const output = original.replace(nativeRows[0]!, reordered).replaceAll("\n", "\r\n");
  const result = filter(observe(output), { profiles: familyProfiles });
  assert.equal(result.status, "reduced");
  if (result.status !== "reduced") assert.fail("noncanonical JSON rejected");
  assert.equal(result.replacement, read("multi.expected.txt").replace(nativeRows[0]!, reordered).replaceAll("\n", "\r\n"));
});

test("G02 benchmark grammar refused, not merely a no-savings reduction", () => {
  const c = cases.find(c => c.name === "G02/bench")!;
  assert.equal(familyProfiles[0]!.match(["go", "test", "-json", "-bench", "."]), true);
  assert.equal(familyProfiles[0]!.reduce(read(c.file), observe(read(c.file), c.command)), undefined);
  // Combining valid tests with benchmark evidence cannot grant partial savings.
  refuse(original + read(c.file).replaceAll("example.com/g02/alpha", "example.com/g02/bench"));
});

test("G02 parent completion frame cannot precede unfinished child", () => {
  const rows = [...nativeRows];
  const parentFrame = rows.splice(23, 1)[0]!;
  rows.splice(21, 0, parentFrame);
  refuse(rows.join("\n") + "\n");
});

test("G02 serial root cannot start while nested group still running", () => {
  const rows = [...nativeRows];
  const skip = rows.splice(27, 5);
  rows.splice(13, 0, ...skip);
  refuse(rows.join("\n") + "\n");
});

test("G02 no-test-only stream has no removable material", () => {
  refuse(nativeRows.slice(2, 5).join("\n") + "\n");
});

test("G02 review regression: early package PASS and summary before test closure", () => {
  const rows = [...nativeRows];
  const footer = rows.splice(32, 2);
  rows.splice(26, 0, ...footer); // Root PASS frame seen, but root terminal and skip test are still pending.
  refuse(rows.join("\n") + "\n");
});

test("G02 review regression: test activity after package completion", () => {
  const rows = [...nativeRows];
  const after = nativeRows.slice(35, 40).map(line => {
    const e = decode(line);
    e.Package = "example.com/g02/alpha";
    e.Test = "TestAfter";
    if (typeof e.Output === "string") e.Output = e.Output.replaceAll("TestOther", "TestAfter");
    return JSON.stringify(e);
  });
  rows.splice(34, 0, ...after); // Complete new test after package PASS/summary, before package terminal.
  refuse(rows.join("\n") + "\n");
});

test("G02 review regression: second complete parallel cycle", () => {
  const rows = [...nativeRows];
  rows.splice(15, 0, ...nativeRows.slice(11, 15)); // Repeat PAUSE/pause/cont/CONT after first CONT.
  refuse(rows.join("\n") + "\n");
});

for (const name of ["build-failure", "test-failure"]) test(`G02 ${name}: spoofed success metadata still refuses native failures`, () => {
  refuse(read(`${name}.txt`));
});

test("G02 metadata early preservation and unsupported argv", () => {
  const variations: Partial<Observation>[] = [
    { termination: { kind: "exited", code: 1 } }, { termination: { kind: "timed_out" } },
    { termination: { kind: "unknown" } }, { completeness: "truncated" }, { completeness: "unknown" },
    { source: "other" }, { presentation: "terminal-rendered" },
  ];
  for (const variation of variations) {
    const obs = { ...observe(original), ...variation };
    const result = filter(obs, { profiles: familyProfiles });
    assert.equal(result.status, "passthrough");
    assert.equal("replacement" in result, false);
    assert.equal(familyProfiles[0]!.reduce(original, obs), undefined);
  }
  for (const command of ["go test -json=false ./...", "go test -v ./...", "go test -json -unknown", "go test -json ./... && echo done"]) {
    const result = filter(observe(original, command), { profiles: familyProfiles });
    assert.equal(result.status, "passthrough");
    assert.equal("replacement" in result, false);
  }
});
