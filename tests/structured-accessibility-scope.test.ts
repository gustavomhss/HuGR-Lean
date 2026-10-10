import assert from "node:assert/strict";
import test from "node:test";
import { filterStructured } from "../src/core/structured.js";
import type { StructuredObservation } from "../src/core/structured-types.js";
import { reduceAccessibilityScope } from "../src/profiles/structured-accessibility-scope.js";

const node = (ref: string, parent: string | null, extra: Record<string, unknown> = {}) =>
  ({ ref, parent, role: "widget", name: `Name ${ref} 😀`, ...extra });
const tree = () => ({ schema: "hugr-lean/a11y-v1", root: "root", nodes: [
  node("hidden", "root"), node("child", "selected", { value: false }),
  node("root", null, { actions: ["activate"], description: "Full root details" }),
  node("selected", "ancestor", { states: [], actions: [], description: "", value: "" }),
  node("ancestor", "root", { value: 0, bounds: [1, 2, 3, 4], description: "Full ancestor details" }),
  node("focus", "focus-parent", { states: ["focused"], value: null }),
  node("focus-parent", "root", { description: "Focus ancestry", actions: ["open"] }),
  node("modal", "modal-parent", { states: ["modal"] }),
  node("modal-parent", "root", { description: "Modal ancestry", bounds: [-1, 0, 3.5, 4] }),
  node("modal-nested-child", "modal-child", { value: "Confirm 😀", actions: ["activate", "inspect"] }),
  node("modal-child", "modal", { states: ["modal"], value: 0, actions: ["open"] }),
  node("hidden-child", "hidden", { value: "Unrelated", actions: ["activate"] }),
  node("focus-child", "focus", { value: "Not selected", actions: ["activate"] }),
] });
function observation(output: string, scopeRef: string | undefined = "selected"): StructuredObservation {
  return { format: "accessibility-scope", output, scopeRef, termination: { kind: "exited", code: 0 }, completeness: "complete" };
}
function filter(output: string, scopeRef: string | undefined = "selected") {
  return filterStructured(observation(output, scopeRef), { reducers: { "accessibility-scope": reduceAccessibilityScope } });
}
function projected(input: ReturnType<typeof tree>, scope = "selected") {
  const output = JSON.stringify(input, null, 2), result = filter(output, scope);
  assert.equal(result.status, "reduced");
  if (result.status !== "reduced") throw new Error(result.reason);
  const view = JSON.parse(result.replacement) as ReturnType<typeof tree> & { scope: string };
  assert.equal(view.schema, input.schema); assert.equal(view.root, input.root); assert.equal(view.scope, scope);
  const refs = new Set(view.nodes.map(item => item.ref));
  assert.ok(refs.has(view.root));
  for (const item of view.nodes) {
    assert.deepEqual(item, input.nodes.find(original => original.ref === item.ref));
    assert.ok(item.parent === null || refs.has(item.parent));
  }
  const raw = reduceAccessibilityScope(output, observation(output, scope))!;
  const sourceNodes = new Map(raw.required.filter(([start]) => output[start] === "{")
    .map(span => [JSON.parse(output.slice(...span)).ref as string, span]));
  for (const item of view.nodes) {
    const span = sourceNodes.get(item.ref);
    assert.ok(span, `raw source span for ${item.ref}`);
    assert.ok(result.replacement.includes(output.slice(...span)));
  }
  return view;
}

test("selected subtree and full ancestor nodes retain original order and details", () => {
  const view = projected(tree());
  assert.deepEqual(view.nodes.map(item => item.ref), ["child", "root", "selected", "ancestor", "focus", "focus-parent", "modal", "modal-parent", "modal-nested-child", "modal-child"]);
});
test("off-scope focused/modal nodes and full ancestry survive", () => {
  const view = projected(tree());
  for (const ref of ["focus", "focus-parent", "modal", "modal-parent"]) assert.ok(view.nodes.some(item => item.ref === ref), ref);
  assert.ok(!view.nodes.some(item => item.ref === "focus-child"));
});
test("off-scope modal complete subtree retains actionable descendants unchanged", () => {
  const input = tree(), view = projected(input);
  for (const ref of ["modal-child", "modal-nested-child"]) {
    assert.deepEqual(view.nodes.find(item => item.ref === ref), input.nodes.find(item => item.ref === ref), ref);
  }
  assert.deepEqual(view.nodes, input.nodes.filter(item => !["hidden", "hidden-child", "focus-child"].includes(item.ref)));
  // An ordinary child must survive solely because its modal ancestor is retained.
  const ordinary = tree(); Object.assign(ordinary.nodes.find(item => item.ref === "modal-child")!, { states: [] });
  assert.deepEqual(projected(ordinary).nodes, ordinary.nodes.filter(item => !["hidden", "hidden-child", "focus-child"].includes(item.ref)));
});
test("scope source lexeme and Unicode stay exact; root scope keeps all nodes", () => {
  const input = tree(), output = JSON.stringify(input, null, 2).replace('"ref": "selected"', '"ref": "sel\\u0065cted"');
  const result = filter(output);
  assert.equal(result.status, "reduced");
  if (result.status === "reduced") assert.ok(result.replacement.includes('"scope":"sel\\u0065cted"'));
  assert.deepEqual(projected(input, "root").nodes, input.nodes);
});
test("missing, empty and stale scope references refuse", () => {
  const output = JSON.stringify(tree(), null, 2);
  const { scopeRef: _scope, ...withoutScope } = observation(output);
  for (const scopeRef of [undefined, "", "stale"]) {
    const obs = { ...withoutScope, ...(scopeRef === undefined ? {} : { scopeRef }) };
    assert.equal(reduceAccessibilityScope(output, obs), undefined);
    assert.notEqual(filterStructured(obs, { reducers: { "accessibility-scope": reduceAccessibilityScope } }).status, "reduced");
  }
});
test("unknown fields and invalid types anywhere refuse whole tree", () => {
  const badProperties = [
    { unknown: true }, { states: "focused" }, { states: [1] }, { states: { focused: true } },
    { actions: [false] }, { value: {} }, { value: [] }, { description: null },
    { bounds: [1, 2, 3] }, { bounds: [1, 2, 3, "4"] }, { role: null }, { name: 1 }, { ref: 1 }, { parent: 1 },
  ];
  for (const props of badProperties) {
    const input = tree(); Object.assign(input.nodes[0]!, props);
    const output = JSON.stringify(input, null, 2);
    assert.equal(reduceAccessibilityScope(output, observation(output)), undefined, JSON.stringify(props));
    assert.equal(filter(output).status, "passthrough");
  }
  for (const input of [{ ...tree(), extra: 1 }, { ...tree(), schema: "other" }, { ...tree(), root: 1 }, { ...tree(), nodes: [] }]) {
    const output = JSON.stringify(input); assert.equal(reduceAccessibilityScope(output, observation(output)), undefined);
  }
});
test("invalid off-scope graphs, duplicate keys and malformed JSON refuse", () => {
  const variants = [
    [node("root", null), node("selected", "root"), node("orphan", "missing")],
    [node("root", null), node("selected", "root"), node("a", "b"), node("b", "a")],
    [node("root", null), node("selected", "root"), node("self", "self")],
    [node("root", null), node("selected", "root"), node("other", null)],
    [node("root", "selected"), node("selected", "root")],
    [node("root", null), node("selected", "root"), node("selected", "root")],
  ];
  for (const nodes of variants) {
    const output = JSON.stringify({ ...tree(), nodes }, null, 2);
    assert.equal(reduceAccessibilityScope(output, observation(output)), undefined);
  }
  const output = JSON.stringify(tree());
  for (const bad of [output.slice(0, -1), output.replace('"role":"widget"', '"role":"widget","role":"widget"'),
    output.replace('"value":false', '"value":1e999'), output.replace('"bounds":[1,2,3,4]', '"bounds":[1,2,3,1e999]')]) {
    assert.equal(reduceAccessibilityScope(bad, observation(bad)), undefined);
  }
});
test("deep flat tree uses bounded iterative traversal", () => {
  const nodes = Array.from({ length: 1500 }, (_, index) => node(`n${index}`, index ? `n${index - 1}` : null));
  nodes.push(node("discard", "n0"));
  const input = { schema: "hugr-lean/a11y-v1", root: "n0", nodes };
  assert.equal(projected(input, "n1400").nodes.length, 1500);
});
test("failed and incomplete observations preserve output", () => {
  const output = JSON.stringify(tree(), null, 2);
  for (const overrides of [{ termination: { kind: "exited" as const, code: 1 } }, { completeness: "truncated" as const }]) {
    const result = filterStructured({ ...observation(output), ...overrides }, { reducers: { "accessibility-scope": reduceAccessibilityScope } });
    assert.equal(result.status, "passthrough"); assert.ok(!("replacement" in result));
  }
});
