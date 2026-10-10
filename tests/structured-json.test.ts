import assert from "node:assert/strict";
import test from "node:test";
import { filterStructured } from "../src/core/structured.js";
import type { StructuredObservation } from "../src/core/structured-types.js";
import { reduceJson } from "../src/profiles/structured-json.js";

const observation = (output: string): StructuredObservation => ({
  format: "json", output, completeness: "complete", termination: { kind: "exited", code: 0 },
});
const filter = (output: string) => filterStructured(observation(output), { reducers: { json: reduceJson } });
function compact(input: string, expected: string): void {
  const result = filter(input);
  assert.equal(result.status, "reduced");
  assert.ok("replacement" in result);
  assert.equal(result.replacement, expected);
  assert.equal(result.inputBytes, Buffer.byteLength(input, "utf8"));
  assert.equal(result.outputBytes, Buffer.byteLength(expected, "utf8"));
}
function preserved(input: string, reason = "unsupported_output"): void {
  const result = filter(input);
  assert.equal(result.status, "passthrough");
  assert.equal(result.reason, reason);
  assert.equal("replacement" in result, false);
  assert.equal(result.outputBytes, Buffer.byteLength(input, "utf8"));
}

test("json compacts exact number lexemes without round-trip serialization", () => {
  compact(' \n[ 9007199254740993123456789, -0, 1e400, -2.300E-007, 0.000, 1e+02 ]\r\t',
    '[9007199254740993123456789,-0,1e400,-2.300E-007,0.000,1e+02]');
});

test("json preserves escaped strings, Unicode, key order and every value", () => {
  const expected = String.raw`{"z":" space \t \n ","café🦀":"🦀é","\u0061":"\uD83E\uDD80","2":"quote\" slash\\ \/","1":[true,false,null,{"unknown":"\u0000"}]}`;
  const input = expected.replaceAll('","', '",\n\t"').replace('[true,false,null,', '[ true, false, null, ');
  compact(` \r\n${input}\t `, expected);
});

test("json compacts scalar roots and empty containers with source evidence", () => {
  for (const value of ['900719925474099312345', '-0', '1e400', '"🦀 \\t"', 'true', 'false', 'null']) {
    compact(` \t${value}\r\n `, value);
  }
  for (const [input, expected] of [
    [' { \n } ', '{}'], [' [ \t ] ', '[]'],
    [' [ { }, [ ], { "nested": [ ] } ] ', '[{},[],{"nested":[]}]'],
    [' { "a": { }, "b": [ ] } ', '{"a":{},"b":[]}'],
  ]) compact(input!, expected!);
});

test("json required evidence includes all keys, scalars and empty punctuation", () => {
  const input = ' { "key🦀" : [ { }, "value", null ], "empty" : [ ] } ';
  const reduction = reduceJson(input, observation(input));
  assert.ok(reduction);
  assert.deepEqual(reduction.required.map(span => input.slice(...span)),
    ['"key🦀"', '{', '}', '"value"', 'null', '"empty"', '[', ']']);
  // Removing any declared evidence must be rejected by the facade.
  for (const span of reduction.required) {
    const pieces = reduction.pieces.filter(piece => piece !== span);
    const result = filterStructured(observation(input), { reducers: { json: () => ({ ...reduction, pieces }) } });
    assert.equal(result.status, "failed_open");
    assert.equal("replacement" in result, false);
  }
});

test("json preserves duplicate keys including escaped aliases and nested duplicates", () => {
  for (const input of [
    ' { "a": 1, "a": 2 } ', String.raw` { "a": 1, "\u0061": 2 } `,
    ' [ { "nested": null, "nested": false } ] ',
  ]) preserved(input);
  compact(' [ { "a": 1 }, { "a": 2 } ] ', '[{"a":1},{"a":2}]');
});

test("json preserves malformed and truncated grammar", () => {
  for (const input of [
    '', ' \t\n', ' { "a": ', '[ 1, ]', '{ "a": 1, }', '[ , 1 ]',
    '{ "a" 1 }', '{ a: 1 }', ' [ 01 ] ', ' [ +1 ] ', ' [ 1. ] ', ' [ 1e ] ',
    ' [ NaN ] ', ' [ Infinity ] ', ' true false ', ' {} trailing ',
    ' "unterminated ', ' "raw\nnewline" ', String.raw` "bad\x20" `,
    '\u00a0{} ', ' /* comment */ {} ',
  ]) preserved(input);
});

test("json preserves depth and node limit violations and admits boundaries", () => {
  compact(' ' + '['.repeat(64) + '0' + ']'.repeat(64) + ' ', '['.repeat(64) + '0' + ']'.repeat(64));
  preserved(' ' + '['.repeat(65) + '0' + ']'.repeat(65) + ' ');
  const array = (count: number) => '[ ' + Array(count).fill('0').join(', ') + ' ]';
  compact(array(24999), '[' + Array(24999).fill('0').join(',') + ']');
  preserved(array(25000));
});

test("json preserves already compact output, failed and incomplete observations", () => {
  for (const input of ['{}', '[]', '{"a":1}', 'null', '"🦀"']) preserved(input, 'not_smaller');
  const output = ' { "a": 1 } ';
  for (const patch of [
    { completeness: "truncated" }, { completeness: "unknown" },
    { termination: { kind: "exited", code: 1 } },
    { termination: { kind: "unknown" } }, { termination: { kind: "timed_out" } },
  ]) {
    const result = filterStructured({ ...observation(output), ...patch } as StructuredObservation,
      { reducers: { json: reduceJson } });
    assert.equal(result.status, "passthrough");
    assert.equal("replacement" in result, false);
  }
});
