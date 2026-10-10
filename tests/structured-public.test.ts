import assert from "node:assert/strict";
import test from "node:test";
import { filterStructured, structuredFormats, type StructuredFormat, type StructuredObservation } from "../src/core/index.js";

// Synthetic examples of the frozen interchange contracts, not native tool captures.
// No reducer injection: these tests require the integrated default registry.
const pretty = (value: unknown): string => JSON.stringify(value, null, 4) + "\n";
const tree = {
  schema: "hugr-lean/a11y-v1", root: "root🦀", nodes: [
    { ref: "root🦀", parent: null, role: "window", name: "Café", states: [], actions: [], value: 0, description: "" },
    { ref: "chosen", parent: "root🦀", role: "group", name: "Selected", value: false },
    { ref: "child", parent: "chosen", role: "button", name: "Save\\draft", states: ["enabled"], actions: ["click"], value: "", bounds: [1, 2, 30, 40], description: "Keep me" },
    { ref: "outside", parent: "root🦀", role: "group", name: "Other panel" },
    { ref: "focus", parent: "outside", role: "textbox", name: "Search", states: ["focused"], value: "needle" },
    { ref: "modal", parent: "outside", role: "dialog", name: "Confirm", states: ["modal"], actions: ["dismiss"] },
    { ref: "unrelated", parent: "root🦀", role: "label", name: "Outside selection" },
  ],
};
const progress = {
  schema: "hugr-lean/progress-v1", events: [
    { kind: "progress", current: 0, total: 2, unit: "files" },
    { kind: "warning", message: "Café🦀 warning" },
    { kind: "progress", current: 1, total: 2, unit: "files" },
    { kind: "diagnostic", message: "path\\draft\tline\nnext" },
    { kind: "progress", current: 2, total: 2, unit: "files" },
    { kind: "result", message: "done" },
  ],
};
const table = { columns: ["path", "count", "ready", "optional"], rows: [["Café🦀\tfile", 0, false, null], ["line\nbreak", -2.5, true, ""]] };
const processes = [{ pid: 42, ppid: 0, state: "S", command: "Café🦀 worker" }, { pid: 43, ppid: 42, state: "R+", command: "task\tchild" }];
const files = [{ path: "Café🦀/link", type: "symlink", size: 0, modified: "2026-01-01", target: "../target\nfile" }, { path: "other", type: "file", size: 42, modified: "2026-01-02", target: "" }];
const windows = [{ id: "w🦀", app: "Editor", title: "Café\tbuffer", focused: false, bounds: [0, -2, 800, 600], state: ["visible", "normal"] }];
const event = { time: "2026-01-01", level: "warning", source: "Café🦀", message: "Keep\tthis\nmessage", details: { ref: "node-7", ok: false, value: 0 } };
const events = [event, event, { ...event, details: { ...event.details, ref: "node-8" } }, { ...event, time: "2026-01-02" }];

function cells(values: readonly unknown[]): string {
  return values.map(value => JSON.stringify(value)).join("\t");
}
function recordView(records: readonly Record<string, unknown>[]): string {
  return [cells(Object.keys(records[0]!)), ...records.map(row => cells(Object.values(row)))].join("\n");
}
function assertRows(actual: string, expected: string): void {
  // A final LF is formatting; exact JSON cell lexemes and row order are evidence.
  const expanded: string[] = [];
  for (const line of actual.replace(/\n$/, "").split("\n")) {
    if (line === "=") { assert.ok(expanded.length > 1); expanded.push(expanded.at(-1)!); }
    else expanded.push(line);
  }
  assert.equal(expanded.join("\n"), expected);
}
function leaves(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap(leaves) : [JSON.stringify(value)];
}
function assertNodeRows(actual: string): void {
  for (const node of tree.nodes) {
    const tokens = Object.values(node).flatMap(leaves);
    // Column order is not frozen for this view. Require each node's evidence
    // together, including repeated values; refs cannot substitute for parents.
    const row = actual.split("\n").find(line => tokens.every(token =>
      line.split(token).length - 1 >= tokens.filter(value => value === token).length));
    assert.ok(row, `missing node evidence row ${node.ref}`);
  }
}
const cases: Record<StructuredFormat, { output: string; check: (replacement: string) => void }> = {
  json: {
    output: ' { "Café🦀": "a\\tb", "huge": 900719925474099312345, "negative": -0, "exponent": 1e+03, "escaped": "\\uD83E\\uDD80" } \n',
    check: output => assert.equal(output, '{"Café🦀":"a\\tb","huge":900719925474099312345,"negative":-0,"exponent":1e+03,"escaped":"\\uD83E\\uDD80"}'),
  },
  table: { output: pretty(table), check: output => assertRows(output, [cells(table.columns), ...table.rows.map(cells)].join("\n")) },
  progress: { output: pretty(progress), check: output => assert.deepEqual(JSON.parse(output), { ...progress, events: progress.events.filter(item => item.kind !== "progress" || item.current === 2) }) },
  processes: { output: pretty(processes), check: output => assertRows(output, recordView(processes)) },
  files: { output: pretty(files), check: output => assertRows(output, recordView(files)) },
  windows: { output: pretty(windows), check: output => assertRows(output, recordView(windows)) },
  events: { output: pretty(events), check: output => assertRows(output, recordView(events)) },
  accessibility: { output: pretty(tree), check: assertNodeRows },
  "accessibility-properties": {
    output: pretty(tree),
    check: output => assert.deepEqual(JSON.parse(output), { ...tree, nodes: tree.nodes.map(node => node.ref === tree.root ? { ref: node.ref, parent: node.parent, role: node.role, name: node.name, value: node.value } : node) }),
  },
  "accessibility-scope": {
    output: pretty(tree),
    check: output => assert.deepEqual(JSON.parse(output), { ...tree, scope: "chosen", nodes: tree.nodes.filter(node => node.ref !== "unrelated") }),
  },
};
function observation(format: StructuredFormat, output = cases[format].output): StructuredObservation {
  return { format, output, termination: { kind: "exited", code: 0 }, completeness: "complete", ...(format === "accessibility-scope" ? { scopeRef: "chosen" } : {}) };
}
function assertPreserved(input: StructuredObservation, reason?: string): void {
  const original = input.output;
  const result = filterStructured(input);
  assert.equal(result.status, "passthrough");
  if (reason !== undefined) assert.equal(result.reason, reason);
  assert.equal("replacement" in result, false);
  assert.equal(result.inputBytes, Buffer.byteLength(original, "utf8"));
  assert.equal(result.outputBytes, result.inputBytes);
  assert.equal(input.output, original);
}

test("public structured format list matches the frozen ten-format contract", () => {
  assert.deepEqual([...structuredFormats], Object.keys(cases));
});
for (const format of structuredFormats) {
  test(`public default registry reduces ${format} and preserves meaningful evidence`, () => {
    const input = observation(format);
    const result = filterStructured(input);
    assert.equal(result.status, "reduced", `${format}: ${result.reason}; integration must wire the default registry`);
    assert.ok("replacement" in result);
    assert.equal(result.profile, `structured-${format}`);
    assert.equal(result.reason, "structured_reduction");
    assert.equal(result.inputBytes, Buffer.byteLength(input.output, "utf8"));
    assert.equal(result.outputBytes, Buffer.byteLength(result.replacement, "utf8"));
    assert.ok(result.outputBytes < result.inputBytes);
    cases[format].check(result.replacement);
  });
  test(`public ${format} refuses failed or incomplete metadata without replacement`, () => {
    for (const completeness of ["truncated", "unknown"] as const) assertPreserved({ ...observation(format), completeness }, "incomplete_observation");
    for (const kind of ["unknown", "timed_out"] as const) assertPreserved({ ...observation(format), termination: { kind } }, "incomplete_observation");
    assertPreserved({ ...observation(format), termination: { kind: "exited", code: 1 } }, "nonzero_exit");
  });
  test(`public ${format} refuses malformed and duplicate-key JSON`, () => {
    for (const output of [' { "broken": ', '{"duplicate":1,"duplicate":2}']) assertPreserved(observation(format, output), "unsupported_output");
  });
}

test("public semantic projections refuse unknown fields", () => {
  const invalid: Partial<Record<StructuredFormat, unknown>> = {
    table: { ...table, extra: true }, progress: { ...progress, extra: true },
    processes: processes.map(row => ({ ...row, extra: true })), files: files.map(row => ({ ...row, extra: true })),
    windows: windows.map(row => ({ ...row, extra: true })), events: events.map(row => ({ ...row, extra: true })),
    accessibility: { ...tree, extra: true }, "accessibility-properties": { ...tree, extra: true }, "accessibility-scope": { ...tree, extra: true },
  };
  for (const [format, value] of Object.entries(invalid)) assertPreserved(observation(format as StructuredFormat, pretty(value)), "unsupported_output");
});
test("public scope requires an explicit live ref and refuses scope on other formats", () => {
  const { scopeRef: _scopeRef, ...missing } = observation("accessibility-scope");
  assertPreserved(missing, "invalid_scope");
  assertPreserved({ ...observation("accessibility-scope"), scopeRef: "stale" }, "unsupported_output");
  for (const format of structuredFormats.filter(format => format !== "accessibility-scope")) assertPreserved({ ...observation(format), scopeRef: "chosen" }, "invalid_scope");
});
test("public tree views refuse broken stable references", () => {
  for (const format of ["accessibility", "accessibility-properties", "accessibility-scope"] as const) {
    for (const patch of [{ ref: "root🦀" }, { parent: "missing" }, { parent: "child" }]) {
      const nodes = tree.nodes.map(node => node.ref === "chosen" ? { ...node, ...patch } : node);
      assertPreserved(observation(format, pretty({ ...tree, nodes })), "unsupported_output");
    }
  }
});
test("public progress refuses partial completion and missing result", () => {
  for (const events of [progress.events.filter(item => item.kind !== "progress" || item.current !== 2), progress.events.filter(item => item.kind !== "result")]) {
    assertPreserved(observation("progress", pretty({ ...progress, events })), "unsupported_output");
  }
});
test("public lossless JSON preserves already compact output", () => {
  assertPreserved(observation("json", '{"Café🦀":false,"value":0}'), "not_smaller");
});
