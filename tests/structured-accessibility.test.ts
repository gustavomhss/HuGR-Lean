import assert from "node:assert/strict";
import test from "node:test";
import { filterStructured } from "../src/core/structured.js";
import type { StructuredObservation } from "../src/core/structured-types.js";
import { reduceAccessibility } from "../src/profiles/structured-accessibility.js";

const node = (ref: string, parent: string | null, extra: Record<string, unknown> = {}) => ({ ref, parent, role: "generic", name: "", ...extra });
const tree = (nodes: unknown[], root = "r") => ({ schema: "hugr-lean/a11y-v1", root, nodes });
const observation = (output: string): StructuredObservation => ({ format: "accessibility", output, completeness: "complete", termination: { kind: "exited", code: 0 } });
const run = (output: string) => filterStructured(observation(output), { reducers: { accessibility: reduceAccessibility } });
function view(input: unknown): string {
  const result = run(typeof input === "string" ? input : JSON.stringify(input, null, 2));
  assert.equal(result.status, "reduced");
  assert.ok("replacement" in result);
  return result.replacement;
}
function refuse(input: unknown): void {
  const text = typeof input === "string" ? input : JSON.stringify(input, null, 2);
  assert.equal(reduceAccessibility(text, observation(text)), undefined);
  const result = run(text);
  assert.equal(result.status, "passthrough");
  assert.equal(result.reason, "unsupported_output");
  assert.equal("replacement" in result, false);
}

test("accessibility retains all actionable and wrapper rows, states, values and parent relations", () => {
  const output = view(tree([
    node("r", null, { states: [], actions: [], value: null, bounds: [0, -1, 100, 20], description: "" }),
    node("wrapper", "r"),
    node("button", "wrapper", { role: "button", name: "Save", states: ["focused", "enabled"], actions: ["press"], value: false, description: "Save changes" }),
    node("zero", "wrapper", { value: 0 }),
    node("empty", "wrapper", { value: "" }),
  ]));
  assert.equal(output, [
    '"schema"\t"hugr-lean/a11y-v1"', '"root"\t"r"', '"nodes"',
    '"ref"\t"parent"\t"role"\t"name"\t"states"\t"actions"\t"value"\t"bounds"\t"description"',
    '"r"\tnull\t"generic"\t""\t[]\t[]\tnull\t[0,-1,100,20]\t""',
    '"wrapper"\t"r"\t"generic"\t""\t-\t-\t-\t-\t-',
    '"button"\t"wrapper"\t"button"\t"Save"\t["focused","enabled"]\t["press"]\tfalse\t-\t"Save changes"',
    '"zero"\t"wrapper"\t"generic"\t""\t-\t-\t0\t-\t-',
    '"empty"\t"wrapper"\t"generic"\t""\t-\t-\t""\t-\t-',
  ].join("\n"));
});

test("accessibility preserves Unicode, escaped key/value lexemes and source node order", () => {
  const input = ` {
    "nodes": [
      {"value": -0, "actions": ["press"], "name": "名\\t🦀", "role": "button", "parent": "根🦀", "r\\u0065f": "子\\u0061"},
      {"ref": "根🦀", "parent": null, "role": "generic", "name": "", "bounds": [0e0, 1.0, 2, 3], "states": ["modal"]}
    ], "r\\u006fot": "根🦀", "schema": "hugr-lean/a11y-v1"
  } `;
  const output = view(input);
  assert.equal(output, [
    '"schema"\t"hugr-lean/a11y-v1"', '"r\\u006fot"\t"根🦀"', '"nodes"',
    '"r\\u0065f"\t"parent"\t"role"\t"name"\t"states"\t"actions"\t"value"\t"bounds"',
    '"子\\u0061"\t"根🦀"\t"button"\t"名\\t🦀"\t-\t["press"]\t-0\t-',
    '"根🦀"\tnull\t"generic"\t""\t["modal"]\t-\t-\t[0e0,1.0,2,3]',
  ].join("\n"));
  const result = run(input);
  assert.equal(result.outputBytes, Buffer.byteLength(output, "utf8"));
});

test("accessibility refuses unknown fields, missing fields and invalid optional types", () => {
  refuse({ ...tree([node("r", null)]), extra: true });
  refuse({ ...tree([node("r", null)]), schema: "native-a11y" });
  refuse({ ...tree([node("r", null)]), root: null });
  refuse({ schema: "hugr-lean/a11y-v1", nodes: [] });
  refuse(tree([]));
  refuse(tree([node("r", null), node("c", "r", { unknown: "evidence" })]));
  for (const key of ["ref", "parent", "role", "name"]) {
    const bad: Record<string, unknown> = node("r", null);
    delete bad[key];
    refuse(tree([bad]));
  }
  for (const extra of [
    { ref: 1 }, { parent: false }, { role: null }, { name: [] },
    { states: [1] }, { states: null }, { actions: [false] }, { actions: "press" },
    { value: {} }, { value: [] }, { bounds: [0, 1, 2] }, { bounds: [0, 1, 2, "3"] },
    { bounds: [0, 1, 2, 3, 4] }, { bounds: null }, { description: false },
  ]) refuse(tree([node("r", null, extra)]));
  refuse(JSON.stringify(tree([node("r", null, { bounds: [0, 1, 2, 3] })])).replace('[0,1,2,3]', '[0,1,2,1e400]'));
  refuse(JSON.stringify(tree([node("r", null, { value: 7 })])).replace('"value":7', '"value":1e400'));
});

test("accessibility validates entire graph including disconnected cycles and late invalid nodes", () => {
  for (const nodes of [
    [node("r", "c"), node("c", "r")],
    [node("r", null), node("c", null)],
    [node("r", null), node("c", "missing")],
    [node("r", null), node("r", "r")],
    [node("r", null), node("c", "c")],
    [node("r", null), node("c", "d"), node("d", "c")],
  ]) refuse(tree(nodes));
  refuse(tree([node("r", null)], "missing"));
  refuse(tree([node("r", null), node("c", "r"), node("d", "c", { actions: [null] })]));
});

test("accessibility handles deep flat trees iteratively and refuses parser admission overflow", () => {
  const nodes = Array.from({ length: 2000 }, (_, index) => node(index ? `n${index}` : "r", index ? (index === 1 ? "r" : `n${index - 1}`) : null));
  const output = view(tree(nodes));
  const rows = output.split("\n").slice(4).map(row => row.split("\t").map(cell => JSON.parse(cell) as unknown));
  assert.deepEqual(rows, nodes.map(({ ref, parent, role, name }) => [ref, parent, role, name]));
  refuse(tree(Array.from({ length: 4000 }, (_, index) => node(index ? `n${index}` : "r", index ? "r" : null))));
});

test("accessibility refuses malformed and duplicate JSON; failed or incomplete captures stay exact", () => {
  for (const input of ["{", '{"schema":"hugr-lean/a11y-v1","root":"r","nodes":[',
    JSON.stringify(tree([node("r", null)])).replace('"ref":"r"', '"ref":"r","r\\u0065f":"other"')]) refuse(input);
  const output = JSON.stringify(tree([node("r", null)]), null, 2);
  for (const patch of [{ completeness: "truncated" as const }, { completeness: "unknown" as const }, { termination: { kind: "exited" as const, code: 1 } }]) {
    const result = filterStructured({ ...observation(output), ...patch }, { reducers: { accessibility: reduceAccessibility } });
    assert.equal(result.status, "passthrough");
    assert.equal("replacement" in result, false);
  }
});
