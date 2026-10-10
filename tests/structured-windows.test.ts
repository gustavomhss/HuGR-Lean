import assert from "node:assert/strict";
import test from "node:test";
import { filterStructured } from "../src/core/structured.js";
import type { StructuredObservation } from "../src/core/structured-types.js";
import { reduceWindows } from "../src/profiles/structured-windows.js";

const observation = (output: string): StructuredObservation => ({
  format: "windows", output, completeness: "complete", termination: { kind: "exited", code: 0 },
});
const filter = (output: string, patch: Partial<StructuredObservation> = {}) =>
  filterStructured({ ...observation(output), ...patch }, { reducers: { windows: reduceWindows } });
const row = { id: "w1", app: "Editor", title: "Notes", focused: false, bounds: [-12, 0, 800, 600] };
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const preserve = (input: string) => {
  assert.equal(reduceWindows(input, observation(input)), undefined);
  const result = filter(input);
  assert.equal(result.status, "passthrough");
  assert.equal(result.reason, "unsupported_output");
  assert.equal("replacement" in result, false);
  assert.equal(result.inputBytes, Buffer.byteLength(input, "utf8"));
  assert.equal(result.outputBytes, result.inputBytes);
};

test("windows retains every row, false focus, geometry, states and exact Unicode lexemes", () => {
  const input = String.raw`[
    { "\u0069d": "ref\u0031", "app": "", "title": "🦀\uD83D\uDE80\t\n\"", "focused": false,
      "bounds": [ -0, -1.25e2, 0, 6.00e2 ], "state": [ "minimized", "\u0068idden", "" ] },
    { "id": "ref2", "app": "café", "title": "", "focused": true,
      "bounds": [ -1920, 0, 1920, 1080 ], "state": [] }
  ]`;
  const expected = [
    String.raw`"\u0069d"` + '\t"app"\t"title"\t"focused"\t"bounds"\t"state"',
    [String.raw`"ref\u0031"`, '""', String.raw`"🦀\uD83D\uDE80\t\n\""`, "false",
      "[-0,-1.25e2,0,6.00e2]", String.raw`["minimized","\u0068idden",""]`].join("\t"),
    ['"ref2"', '"café"', '""', "true", "[-1920,0,1920,1080]", "[]"].join("\t"),
  ].join("\n");
  const result = filter(input);
  assert.equal(result.status, "reduced");
  assert.ok("replacement" in result);
  assert.equal(result.replacement, expected);
  assert.equal(result.inputBytes, Buffer.byteLength(input, "utf8"));
  assert.equal(result.outputBytes, Buffer.byteLength(expected, "utf8"));
  assert.ok(result.outputBytes < result.inputBytes);
  const cells = result.replacement.split("\n").map(line => line.split("\t").map(cell => JSON.parse(cell)));
  assert.deepEqual(cells[0], ["id", "app", "title", "focused", "bounds", "state"]);
  assert.deepEqual(cells.slice(1), JSON.parse(input).map((record: Record<string, unknown>) => Object.values(record)));
});

test("windows accepts uniform records without optional state and empty strings", () => {
  const input = pretty([{ ...row, id: "", app: "", title: "" }, row, { ...row, focused: true }]);
  const result = filter(input);
  assert.equal(result.status, "reduced");
  assert.ok("replacement" in result);
  assert.equal(result.replacement, [
    '"id"\t"app"\t"title"\t"focused"\t"bounds"',
    '""\t""\t""\tfalse\t[-12,0,800,600]',
    '"w1"\t"Editor"\t"Notes"\tfalse\t[-12,0,800,600]',
    '"w1"\t"Editor"\t"Notes"\ttrue\t[-12,0,800,600]',
  ].join("\n"));
});

test("windows refuses unknown fields, nonuniform fieldsets and reordered keys in any row", () => {
  for (const records of [
    [{ ...row, native: "macOS" }], [row, { ...row, state: [] }], [{ ...row, state: [] }, row],
    [{ app: "Editor", id: "w1", title: "Notes", focused: false, bounds: row.bounds }],
    [row, { ...row, extra: null }],
    [row, { id: "w2", app: "", focused: false, title: "", bounds: row.bounds }],
    [{ id: "w1", app: "", title: "", focused: false, state: [], bounds: row.bounds }],
  ]) preserve(pretty(records));
  for (const name of Object.keys(row)) {
    const missing: Record<string, unknown> = { ...row };
    delete missing[name];
    preserve(pretty([row, missing]));
  }
});

test("windows refuses wrong scalar types, bounds and state without partial reduction", () => {
  for (const [name, values] of Object.entries({
    id: [null, 1, false, []], app: [null, 1, {}], title: [null, false, []], focused: [0, "false", null],
    bounds: [null, {}, [], [0, 0, 0], [0, 0, 0, 0, 0], [0, 0, "0", 0], [0, null, 0, 0], [[], 0, 0, 0]],
    state: [null, "focused", [false], [0], [null], [[]]],
  })) {
    for (const value of values) {
      const first = name === "state" ? { ...row, state: [] } : row;
      preserve(pretty([first, { ...row, [name]: value }]));
    }
  }
  preserve('[{"id":"w","app":"","title":"","focused":false,"bounds":[0,0,1e400,0]}]');
});

test("windows preserves empty, malformed, truncated and duplicate-key JSON", () => {
  const valid = pretty([row]);
  for (const input of ["[]", " {} ", "null", "", "[null]", "[1]", valid.slice(0, -1), valid + "garbage",
    valid.replace('"focused": false', '"focused": false, "focused": true'),
    valid.replace('"id": "w1"', '"id": "w1", "\\u0069d": "w2"'),
    valid.replace('"bounds": [', '"bounds": [,'),
  ]) preserve(input);
});

test("windows preserves failed or incomplete observations before invoking injected reducer", () => {
  const input = pretty([row]);
  let calls = 0;
  for (const patch of [
    { completeness: "truncated" as const }, { completeness: "unknown" as const },
    { termination: { kind: "exited" as const, code: 1 } },
    { termination: { kind: "unknown" as const } }, { termination: { kind: "timed_out" as const } },
  ]) {
    const result = filterStructured({ ...observation(input), ...patch }, { reducers: {
      windows: (...args) => { calls++; return reduceWindows(...args); },
    } });
    assert.equal(result.status, "passthrough");
    assert.equal("replacement" in result, false);
  }
  assert.equal(calls, 0);
});
