import assert from "node:assert/strict";
import test from "node:test";
import { filterStructured } from "../src/core/structured.js";
import type { StructuredObservation } from "../src/core/structured-types.js";
import { reduceProgress } from "../src/profiles/structured-progress.js";

const observation = (output: string): StructuredObservation => ({
  format: "progress", output, completeness: "complete", termination: { kind: "exited", code: 0 },
});
const filter = (output: string, patch: Partial<StructuredObservation> = {}) =>
  filterStructured({ ...observation(output), ...patch }, { reducers: { progress: reduceProgress } });
const progress = (current: number, total = 3, unit = "files") => ({ kind: "progress", current, total, unit });
const result = { kind: "result", message: "done" };
const capture = (events: unknown[]) => JSON.stringify({ schema: "hugr-lean/progress-v1", events }, null, 2);
const refused = (input: string) => {
  assert.equal(reduceProgress(input, observation(input)), undefined);
  const filtered = filter(input);
  assert.equal(filtered.status, "passthrough");
  assert.equal(filtered.reason, "unsupported_output");
  assert.equal("replacement" in filtered, false);
};

test("preserves every warning, diagnostic, result and final progress as ordered source slices", () => {
  const before = '{ "kind" : "warning", "message" : "avant café🦀" }';
  const diagnosticBefore = '{"message":"診断\\ud83e\\udd80", "kind":"diagnostic"}';
  const middle = '{ "kind":"diagnostic", "message":"between\\nsteps" }';
  const warningMiddle = '{"kind":"warning","message":"middle\\t⚠"}';
  const earlyResult = '{"kind":"result", "message":"early evidence"}';
  const final = '{ "unit":"files🦀", "total":3e0, "current":3, "kind":"progress" }';
  const after = '{"kind":"warning", "message":"after 🦀"}';
  const diagnosticAfter = '{"kind":"diagnostic","message":"after diagnostic"}';
  const done = '{ "kind":"result", "message":"résultat\\u0021" }';
  const prefix = ' \n{ "schema" : "hugr-lean/progress-v1", "events" : [';
  const suffix = '] }\r\n';
  const retained = [before, diagnosticBefore, middle, warningMiddle, earlyResult, final, after, diagnosticAfter, done];
  const input = prefix + [before, diagnosticBefore, JSON.stringify(progress(0, 3, "files🦀")),
    middle, warningMiddle, JSON.stringify(progress(2, 3, "files🦀")), earlyResult,
    final, after, diagnosticAfter, done].join(",\n  ") + suffix;
  const filtered = filter(input);
  assert.equal(filtered.status, "reduced");
  assert.ok("replacement" in filtered);
  assert.equal(filtered.replacement, prefix + retained.join(",") + suffix);
  assert.deepEqual(JSON.parse(filtered.replacement).events, retained.map(event => JSON.parse(event)));
  assert.equal(filtered.inputBytes, Buffer.byteLength(input, "utf8"));
  assert.equal(filtered.outputBytes, Buffer.byteLength(filtered.replacement, "utf8"));
  const reduction = reduceProgress(input, observation(input));
  assert.ok(reduction);
  assert.deepEqual(reduction.required.map(span => input.slice(...span)), [prefix, suffix, ...retained]);
});

test("keeps reversed envelope order and escaped keys intact", () => {
  const final = '{"kind":"progress","current":1,"total":1,"unit":""}';
  const done = '{"kind":"result","message":""}';
  const prefix = '{ "ev\\u0065nts" : [';
  const suffix = '], "sch\\u0065ma" : "hugr-lean/progress-v1" }';
  const input = prefix + JSON.stringify(progress(0, 1, "")) + "," + final + "," + done + suffix;
  const filtered = filter(input);
  assert.ok("replacement" in filtered);
  assert.equal(filtered.replacement, prefix + final + "," + done + suffix);
});

test("accepts equal currents, repeated completed progress and safe integer boundary", () => {
  const limit = Number.MAX_SAFE_INTEGER;
  const events = [progress(0, limit), progress(0, limit), progress(limit, limit), result,
    progress(limit, limit), { kind: "result", message: "second" }];
  const filtered = filter(capture(events));
  assert.ok("replacement" in filtered);
  assert.deepEqual(JSON.parse(filtered.replacement).events, [result, events[4], events[5]]);
});

test("refuses contradictory, non-monotonic, incomplete or result-free series", () => {
  for (const events of [[], [result], [progress(0), result], [progress(3)],
    [progress(2), progress(1), progress(3), result],
    [progress(0), progress(4, 4), result], [progress(0), progress(3, 3, "bytes"), result],
    [progress(3), progress(2), result]]) refused(capture(events));
});

test("refuses unsupported fields, kinds, missing fields and invalid scalar types", () => {
  const invalid: unknown[] = [
    { ...progress(3), extra: true }, { ...progress(3), message: "extra" },
    { kind: "progress", current: 3, total: 3 }, { kind: "progress", total: 3, unit: "files" },
    { kind: "progress", current: 3, unit: "files" }, { ...progress(3), unit: null },
    { ...progress(3), current: "3" }, { ...progress(3), current: true },
    progress(-1), progress(4), progress(1.5), progress(0, 0), progress(0, -1),
    progress(0, 3.5), progress(0, Number.MAX_SAFE_INTEGER + 1),
    progress(Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1),
    { kind: "error", message: "unknown" }, { kind: "result" },
    { kind: "warning", message: 1 }, { kind: "diagnostic", message: null },
    { kind: "result", message: "done", current: 3 }, { message: "missing kind" }, null, [], "event",
  ];
  for (const event of invalid) refused(capture([progress(0), event, progress(3), result]));
  for (const envelope of [
    { schema: "other", events: [progress(3), result] },
    { schema: "hugr-lean/progress-v1", events: [progress(3), result], extra: 1 },
    { events: [progress(3), result] }, { schema: "hugr-lean/progress-v1" },
    { schema: "hugr-lean/progress-v1", events: {} }, [], null,
  ]) refused(JSON.stringify(envelope));
});

test("refuses malformed JSON, duplicate keys and non-finite or rounded unsafe numbers", () => {
  const input = capture([progress(0), progress(3), result]);
  for (const broken of [input.slice(0, -1), input + " trailing", input.replace('"current": 0', '"current": 0, "current": 1'),
    input.replace('"schema":', '"schema":"hugr-lean/progress-v1", "schema":'),
    input.replace('"total": 3', '"total": 1e400'),
    input.replace('"current": 0', '"current": 9007199254740993')]) refused(broken);
});

test("preserves failed and incomplete captures and already minimal valid output", () => {
  const input = capture([progress(0), progress(3), result]);
  for (const patch of [
    { completeness: "truncated" as const }, { completeness: "unknown" as const },
    { termination: { kind: "exited" as const, code: 1 } },
    { termination: { kind: "timed_out" as const } }, { termination: { kind: "unknown" as const } },
  ]) {
    const filtered = filter(input, patch);
    assert.equal(filtered.status, "passthrough");
    assert.equal("replacement" in filtered, false);
  }
  const minimal = JSON.stringify({ schema: "hugr-lean/progress-v1", events: [progress(3), result] });
  const filtered = filter(minimal);
  assert.equal(filtered.status, "passthrough");
  assert.equal(filtered.reason, "not_smaller");
});
