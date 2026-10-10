import assert from "node:assert/strict";
import test from "node:test";
import { filterStructured } from "../src/core/structured.js";
import type { StructuredObservation } from "../src/core/structured-types.js";
import { reduceTable } from "../src/profiles/structured-table.js";

const observation = (output: string): StructuredObservation => ({
  format: "table", output, completeness: "complete", termination: { kind: "exited", code: 0 },
});
const filter = (output: string) => filterStructured(observation(output), { reducers: { table: reduceTable } });
const reduced = (input: string, expected: string) => {
  const result = filter(input);
  assert.equal(result.status, "reduced");
  assert.ok("replacement" in result);
  assert.equal(result.replacement, expected);
  assert.equal(result.inputBytes, Buffer.byteLength(input, "utf8"));
  assert.equal(result.outputBytes, Buffer.byteLength(expected, "utf8"));
};

test("table preserves source lexemes, Unicode and escaped cell delimiters", () => {
  const input = ' { "columns": ["café🦀", "escaped", "nil", "flag", "zero", "huge"], "rows": [\n'
    + ' ["雪😀", "a\\tb\\nc\\r\\\"d\\\\e\\u0061", null, false, 0, 900719925474099312345],\n'
    + ' ["\\uD83D\\uDE00", "", null, true, -0, 1e400]\n ] } ';
  reduced(input, '"café🦀"\t"escaped"\t"nil"\t"flag"\t"zero"\t"huge"\n'
    + '"雪😀"\t"a\\tb\\nc\\r\\\"d\\\\e\\u0061"\tnull\tfalse\t0\t900719925474099312345\n'
    + '"\\uD83D\\uDE00"\t""\tnull\ttrue\t-0\t1e400\n');
});

test("table accepts reordered fields and escaped original column tokens", () => {
  reduced(' { "rows": [[1.2300e+02, "x"]], "columns": ["\\u0061", "b\\t\\n"] } ',
    '"\\u0061"\t"b\\t\\n"\n1.2300e+02\t"x"\n');
  reduced('{"columns":["one"],"rows":[]}', '"one"\n');
});

test("table retains all rows without truncation or deduplication", () => {
  const rows = Array.from({ length: 300 }, (_, index) => [index, "same"]);
  const input = JSON.stringify({ columns: ["id", "value"], rows });
  reduced(input, '"id"\t"value"\n' + rows.map(([id]) => `${id}\t"same"\n`).join(""));
  reduced('{"columns":["v"],"rows":[[false],[false],[null],[0]]}', '"v"\nfalse\nfalse\nnull\n0\n');
});

test("table refuses malformed, unknown, duplicate and inconsistent input intact", () => {
  const inputs = [
    'column\tvalue\n1\t2\n', 'null', '[]',
    '{"columns":["a"],"rows":[[1]]',
    '{"columns":["a"],"rows":[[1]],}',
    '{"columns":["a"],"rows":[[1]]} trailing',
    '{"columns":["a"],"rows":[[1]],"extra":true}',
    '{"columns":["a"],"columns":["b"],"rows":[[1]]}',
    '{"columns":["a"],"\\u0063olumns":["b"],"rows":[[1]]}',
    '{"columns":["a","\\u0061"],"rows":[[1,2]]}',
    '{"columns":[],"rows":[]}', '{"columns":[""],"rows":[[1]]}',
    '{"columns":[1],"rows":[[1]]}', '{"columns":[null],"rows":[]}',
    '{"columns":"a","rows":[[1]]}', '{"rows":[[1]]}', '{"columns":["a"]}',
    '{"columns":["a"],"rows":{}}', '{"columns":["a"],"rows":[1]}',
    '{"columns":["a"],"rows":[[1],[]]}',
    '{"columns":["a"],"rows":[[1],[2,3]]}',
    '{"columns":["a"],"rows":[[{}]]}', '{"columns":["a"],"rows":[[[]]]}',
  ];
  for (const input of inputs) {
    assert.equal(reduceTable(input, observation(input)), undefined, input);
    const result = filter(input);
    assert.equal(result.status, "passthrough", input);
    assert.equal(result.reason, "unsupported_output", input);
    assert.equal("replacement" in result, false, input);
    assert.equal("replacement" in result ? result.replacement : input, input);
    assert.equal(result.outputBytes, Buffer.byteLength(input, "utf8"));
  }
});

test("table preserves failed and incomplete observations before reduction", () => {
  const input = ' {"columns":["a"],"rows":[[1]]} ';
  for (const patch of [
    { completeness: "truncated" as const }, { completeness: "unknown" as const },
    { termination: { kind: "exited" as const, code: 1 } },
    { termination: { kind: "unknown" as const } }, { termination: { kind: "timed_out" as const } },
  ]) {
    const result = filterStructured({ ...observation(input), ...patch }, { reducers: { table: reduceTable } });
    assert.equal(result.status, "passthrough");
    assert.equal("replacement" in result, false);
    assert.equal(result.outputBytes, Buffer.byteLength(input, "utf8"));
  }
});
