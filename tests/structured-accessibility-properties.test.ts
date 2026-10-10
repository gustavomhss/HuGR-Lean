import assert from "node:assert/strict";
import test from "node:test";
import { filterStructured } from "../src/core/structured.js";
import { reduceAccessibilityProperties } from "../src/profiles/structured-accessibility-properties.js";
import type { StructuredObservation } from "../src/core/structured-types.js";

const observation = (output: string): StructuredObservation => ({
  format: "accessibility-properties", output, termination: { kind: "exited", code: 0 }, completeness: "complete",
});
const filter = (output: string) => filterStructured(observation(output), {
  reducers: { "accessibility-properties": reduceAccessibilityProperties },
});
const node = (ref: string, parent: string | null) => ({ ref, parent, role: "button", name: "" });
const tree = () => ({ schema: "hugr-lean/a11y-v1", root: "root", nodes: [node("root", null), node("child", "root")] });
const json = (value: unknown) => JSON.stringify(value, null, 2);
function replacement(input: string): string {
  const result = filter(input);
  assert.equal(result.status, "reduced");
  assert.ok("replacement" in result);
  return result.replacement;
}
function normalized(value: string) {
  const parsed = JSON.parse(value);
  for (const item of parsed.nodes) {
    item.actions ??= [];
    item.states ??= [];
    item.description ??= "";
  }
  return parsed;
}
function refused(value: unknown) {
  const input = typeof value === "string" ? value : json(value);
  assert.equal(reduceAccessibilityProperties(input, observation(input)), undefined);
  const result = filter(input);
  assert.equal(result.status, "passthrough");
  assert.equal(result.reason, "unsupported_output");
  assert.equal(result.outputBytes, Buffer.byteLength(input));
}

test("omits only declared empty optional defaults with normalized JSON equivalence", () => {
  const input = json({ ...tree(), nodes: [
    { ...node("root", null), actions: [], states: [], description: "" },
    { ...node("child", "root"), states: ["focused"], actions: ["press"], description: "help" },
  ] });
  const output = replacement(input);
  assert.deepEqual(normalized(output), normalized(input));
  assert.deepEqual(Object.keys(JSON.parse(output).nodes[0]), ["ref", "parent", "role", "name"]);
  assert.deepEqual(JSON.parse(output).nodes[1], JSON.parse(input).nodes[1]);
});

test("preserves empty value, false, zero, null, bounds and required empty name", () => {
  const input = json({ ...tree(), nodes: [
    { ...node("root", null), value: "", bounds: [0, -1, 0, 2] },
    { ...node("child", "root"), value: false },
    { ...node("zero", "child"), value: 0 },
    { ...node("null", "root"), value: null },
  ] });
  assert.deepEqual(JSON.parse(replacement(input)), JSON.parse(input));
});

test("preserves field order, scalar lexemes, Unicode refs and UTF-16 source spans", () => {
  const input = String.raw`{
    "nodes": [
      {"name":"", "ref":"根😀", "role":"wind\u006fw", "parent":null, "states":[], "value":-0, "bounds":[0.00,1e2,-2.50,4], "description":""},
      {"parent":"根😀", "actions":["pr\u0065ss"], "name":"café\n😀", "role":"button", "ref":"子\u0061", "value":false},
      {"ref":"v", "parent":"子\u0061", "role":"text", "name":"", "value":"", "description":"説明😀"}
    ], "r\u006fot":"根😀", "schema":"hugr-lean/a11y-v1"
  }`;
  const output = replacement(input);
  assert.deepEqual(normalized(output), normalized(input));
  for (const lexeme of [String.raw`"r\u006fot"`, String.raw`"wind\u006fw"`, String.raw`"pr\u0065ss"`, String.raw`"子\u0061"`, "-0", "0.00", "1e2", "-2.50", "根😀", "説明😀"]) {
    assert.ok(output.includes(lexeme), lexeme);
  }
  assert.deepEqual(Object.keys(JSON.parse(output)), ["nodes", "root", "schema"]);
  assert.deepEqual(Object.keys(JSON.parse(output).nodes[0]), ["name", "ref", "role", "parent", "value", "bounds"]);
});

test("refuses unknown fields, duplicate keys and malformed JSON", () => {
  refused({ ...tree(), extra: true });
  refused({ ...tree(), nodes: [{ ...node("root", null), extra: [] }] });
  refused(json(tree()).replace('"root": "root"', '"root": "root", "r\\u006fot": "root"'));
  refused(json(tree()).replace('"name": ""', '"name": "", "name": ""'));
  refused(json(tree()).slice(0, -1));
  refused("null");
});

test("validates every field including late nodes before projection", () => {
  for (const invalid of [
    { ref: 1 }, { parent: false }, { role: null }, { name: [] }, { states: [false] },
    { actions: "press" }, { description: null }, { value: {} }, { value: [] },
    { bounds: [0, 0, 0] }, { bounds: [0, 0, 0, "1"] }, { bounds: null },
  ]) refused({ ...tree(), nodes: [node("root", null), { ...node("child", "root"), ...invalid }] });
  for (const key of ["ref", "parent", "role", "name"]) {
    const missing: Record<string, unknown> = { ...node("root", null) };
    delete missing[key];
    refused({ ...tree(), nodes: [missing] });
  }
  refused({ ...tree(), schema: "other" });
  refused({ ...tree(), root: null });
  refused({ ...tree(), nodes: {} });
  for (const key of ["schema", "root", "nodes"]) {
    const missing: Record<string, unknown> = tree();
    delete missing[key];
    refused(missing);
  }
  refused(json({ ...tree(), nodes: [{ ...node("root", null), value: 1 }] }).replace('"value": 1', '"value": 1e400'));
  refused(json({ ...tree(), nodes: [{ ...node("root", null), bounds: [1, 0, 0, 0] }] }).replace("1,", "1e400,"));
});

test("refuses duplicate refs, dangling parents, wrong roots, cycles and disconnected nodes", () => {
  const invalid = [
    [], [node("root", null), node("root", "root")],
    [node("root", null), node("child", "missing")],
    [node("root", null), node("other", null)],
    [node("root", "child"), node("child", "root")],
    [node("root", null), node("child", "child")],
    [node("root", null), node("a", "b"), node("b", "a")],
  ];
  for (const nodes of invalid) refused({ ...tree(), nodes });
  refused({ ...tree(), root: "missing" });
  refused({ ...tree(), root: "child" });
});

test("admits out-of-order deep flat trees iteratively and rejects parser budget overflow", () => {
  const nodes = Array.from({ length: 1000 }, (_, i) => node(String(i), i ? String(i - 1) : null)).reverse();
  const input = json({ ...tree(), root: "0", nodes });
  assert.deepEqual(JSON.parse(replacement(input)), JSON.parse(input));
  refused({ ...tree(), root: "0", nodes: Array.from({ length: 3000 }, (_, i) => node(String(i), i ? String(i - 1) : null)) });
});

test("failed and incomplete observations preserve original output", () => {
  const output = json(tree());
  for (const metadata of [
    { termination: { kind: "exited" as const, code: 1 } },
    { completeness: "truncated" as const }, { completeness: "unknown" as const },
    { termination: { kind: "timed_out" as const } },
  ]) {
    const result = filterStructured({ ...observation(output), ...metadata }, {
      reducers: { "accessibility-properties": reduceAccessibilityProperties },
    });
    assert.equal(result.status, "passthrough");
    assert.equal(result.outputBytes, Buffer.byteLength(output));
  }
});
