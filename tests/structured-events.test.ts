import assert from "node:assert/strict";
import test from "node:test";
import { filterStructured } from "../src/core/structured.js";
import type { StructuredObservation } from "../src/core/structured-types.js";
import { reduceEvents } from "../src/profiles/structured-events.js";

const observation = (output: string): StructuredObservation => ({
  format: "events", output, termination: { kind: "exited", code: 0 }, completeness: "complete",
});
const event = (time: string, details?: string, message = '"ready"', source = '"worker"', level = '"warning"') =>
  `{"time":${time},"level":${level},"source":${source},"message":${message}${details === undefined ? "" : `,"details":${details}`}}`;
const input = (rows: string[]) => `[\n  ${rows.join(",\n  ")}\n]`;

function view(output: string): string {
  const result = filterStructured(observation(output), { reducers: { events: reduceEvents } });
  assert.equal(result.status, "reduced");
  assert.ok("replacement" in result);
  assert.equal(result.inputBytes, Buffer.byteLength(output, "utf8"));
  assert.equal(result.outputBytes, Buffer.byteLength(result.replacement, "utf8"));
  return result.replacement;
}

/** Independent decoder keeps numeric/string lexemes instead of JSON.parse rounding them. */
function reconstruct(compact: string): string[] {
  const [header, ...lines] = compact.trimEnd().split("\n");
  const keys = header!.split("\t");
  const rows: string[] = [];
  for (const line of lines) {
    if (line === "=") {
      assert.ok(rows.length > 0);
      rows.push(rows[rows.length - 1]!);
    } else {
      const cells = line.split("\t");
      assert.equal(cells.length, keys.length);
      rows.push(`{${keys.map((key, index) => `${key}:${cells[index]}`).join(",")}}`);
    }
  }
  return rows;
}

test("events reconstruct ordered records and every contiguous warning/error occurrence", () => {
  const warning = event('"2026-10-09"', '{"stack":["a","b"],"payload":false}');
  const error = event('"2026-10-10"', '{"stack":["a","c"],"payload":null}', '"failed"', '"worker"', '"error"');
  const rows = [warning, warning, warning, error, error, warning];
  const compact = view(input(rows));
  assert.deepEqual(reconstruct(compact), rows);
  assert.equal(compact.split("\n").filter(line => line === "=").length, 3);
  assert.notEqual(compact.split("\n").at(-2), "=");
});

test("events keep differing payloads, timestamps, stacks, sources, escapes and huge integers distinct", () => {
  const rows = [
    event("9007199254740992", '{"n":9007199254740992}'),
    event("9007199254740993", '{"n":9007199254740992}'),
    event("9007199254740993", '{"n":9007199254740993}'),
    event("1", '{"stack":"a\\nb"}', '"😀 café\\t尾"'),
    event("1.0", '{"stack":"a\\nc"}', '"😀 café\\t尾"'),
    event("1.0", '{"stack":"a\\nc"}', '"😀 café\\t尾"', '"other"'),
    event("1.0", '{"stack":"a\\nc"}', '"\\ud83d\\ude00 café\\t尾"', '"other"'),
    event("-0", "null"), event("0", "null"),
    event('"x"', '"\\u0061"'), event('"x"', '"a"'),
  ];
  assert.deepEqual(reconstruct(view(input(rows))), rows);
});

test("events compact nested JSON whitespace only; lexical tuples still repeat", () => {
  const rows = [event("1", '{ "stack" : [ "😀", { "n" : 9007199254740993 } ] }'),
    event("1", '{"stack":["😀",{"n":9007199254740993}]}')];
  const compact = view(input(rows));
  assert.deepEqual(reconstruct(compact), [rows[1], rows[1]]);
  assert.equal(compact.split("\n").at(-2), "=");
});

test("events accept arbitrary JSON details and optional details absent uniformly", () => {
  for (const details of [undefined, "null", "true", "false", "[]", "{}", '"text"', "42", '[{},[],false,null]']) {
    const rows = [event('"t"', details), event('"u"', details)];
    assert.deepEqual(reconstruct(view(input(rows))), rows);
  }
});

test("normal row required spans contain original values and fixed formatting only", () => {
  const output = input([event('"😀"', '{"stack":["trace"],"payload":9007199254740993}')]);
  const reduction = reduceEvents(output, observation(output));
  assert.ok(reduction);
  const values = reduction.required.map(([start, end]) => output.slice(start, end));
  for (const value of ['"😀"', '"warning"', '"worker"', '"ready"', '"trace"', "9007199254740993"]) {
    assert.ok(values.includes(value), value);
  }
  for (const piece of reduction.pieces) {
    if (!Array.isArray(piece)) assert.ok(["\t", "\n", "=", "[", "]", "{", "}", ":", ","].includes((piece as { text: string }).text));
  }
});

test("events refuse unknown keys, nonuniform fields, bad order/types and malformed JSON", () => {
  const valid = event("1");
  for (const output of ["[]", "{}", "[", input([valid.slice(0, -1) + ',"extra":true}']),
    input([valid, event("2", "null")]), input([event("true")]), input([event("1e400")]),
    input([event("null")]), input([event("1", undefined, "false")]),
    input([event("1", undefined, '"m"', "[]")]),
    input([event("1", undefined, '"m"', '"s"', "3")]),
    input(['{"level":"info","time":1,"source":"s","message":"m"}']),
    input(['{"time":1,"time":2,"level":"info","source":"s","message":"m"}']),
    input([event("1", '{"x":1,"x":2}')]), input(['{"time":1,"level":"info","source":"s"}']),
  ]) {
    assert.equal(reduceEvents(output, observation(output)), undefined, output);
    assert.equal(filterStructured(observation(output), { reducers: { events: reduceEvents } }).status, "passthrough", output);
  }
});

test("events preserve failed and incomplete captures through facade", () => {
  const output = input([event("1"), event("1")]);
  for (const change of [{ termination: { kind: "exited" as const, code: 1 } },
    { completeness: "truncated" as const }, { completeness: "unknown" as const },
    { termination: { kind: "timed_out" as const } }]) {
    const result = filterStructured({ ...observation(output), ...change }, { reducers: { events: reduceEvents } });
    assert.equal(result.status, "passthrough");
    assert.ok(!("replacement" in result));
  }
});
