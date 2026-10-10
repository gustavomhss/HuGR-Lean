import assert from "node:assert/strict";
import test from "node:test";
import { filterStructured } from "../src/core/structured.js";
import { jsonReduction, parseJson } from "../src/core/structured-json.js";
import type { StructuredObservation, StructuredReducer } from "../src/core/structured-types.js";

const observation = (output: string): StructuredObservation => ({ format: "json", output, completeness: "complete", termination: { kind: "exited", code: 0 } });
const compact: StructuredReducer = output => { const node = parseJson(output); return node ? jsonReduction(node) : undefined; };
test("structured core preserves exact lexemes and Unicode with real byte accounting", () => {
  const input = ' { "café🦀": "a\\tb", "huge": 900719925474099312345, "negative": -0 } \n';
  const result = filterStructured(observation(input), { reducers: { json: compact } });
  assert.equal(result.status, "reduced");
  assert.ok("replacement" in result);
  assert.equal(result.replacement, '{"café🦀":"a\\tb","huge":900719925474099312345,"negative":-0}');
  assert.equal(result.inputBytes, Buffer.byteLength(input));
  assert.equal(result.outputBytes, Buffer.byteLength(result.replacement));
});
test("structured core refuses incomplete and failed inputs before reducer", () => {
  let calls = 0;
  const reducer: StructuredReducer = () => { calls++; throw new Error("must not run"); };
  for (const patch of [{ completeness: "truncated" }, { completeness: "unknown" }, { termination: { kind: "exited", code: 1 } }, { termination: { kind: "unknown" } }, { termination: { kind: "timed_out" } }]) {
    const input = { ...observation(" original "), ...patch } as StructuredObservation;
    const result = filterStructured(input, { reducers: { json: reducer } });
    assert.equal(result.status, "passthrough");
    assert.equal("replacement" in result, false);
  }
  assert.equal(calls, 0);
});
test("structured core rejects missing required evidence and surrogate splits", () => {
  const input = "a🦀b   ";
  for (const reduction of [{ pieces: [[0, 1]], required: [[1, 3]] }, { pieces: [[1, 2]], required: [[1, 2]] }, { pieces: [[0, 1], { text: "fabricated" }], required: [[0, 1]] }]) {
    const result = filterStructured(observation(input), { reducers: { json: () => reduction as never } });
    assert.equal(result.status, "failed_open");
    assert.equal("replacement" in result, false);
  }
});
test("structured parser rejects duplicate keys, malformed input and bounded depth", () => {
  assert.ok(parseJson('{"valid":["🦀",null,true,1e400]}'));
  for (const input of ['{"duplicate":1,"duplicate":2}', '{"a":', '[1,]', "[".repeat(65) + "0" + "]".repeat(65)]) assert.equal(parseJson(input), undefined);
});
test("structured scope must be explicit and scoped formats do not leak to generic views", () => {
  const reducer: StructuredReducer = compact;
  assert.equal(filterStructured({ ...observation(' {"a":1} '), scopeRef: "r1" }, { reducers: { json: reducer } }).status, "passthrough");
  assert.equal(filterStructured({ ...observation(' {"a":1} '), format: "accessibility-scope" }, { reducers: { "accessibility-scope": reducer } }).status, "passthrough");
});
