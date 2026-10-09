import assert from "node:assert/strict";
import test from "node:test";
import { jsonLayout } from "../src/profiles/json-layout.js";

test("JSON layout keeps exact diagnostic string whitespace, escapes and Unicode spans", () => {
  const input = ' [\n  { "message": "line café 🔥\\n  keep  spaces", "path": "a\\\\b", "line": 2 }\n ]\n';
  const result = jsonLayout(input, value => Array.isArray(value) && value.length === 1);
  assert.ok(result);
  const expected = '[{"message":"line café 🔥\\n  keep  spaces","path":"a\\\\b","line":2}]';
  assert.equal(result.pieces.map(piece => "text" in piece ? piece.text : input.slice(...piece)).join(""), expected);
  assert.deepEqual(result.required, result.pieces);
  assert.ok(result.required.some(([start, end]) => input.slice(start, end).includes("café 🔥")));
});

test("JSON layout refuses duplicate keys, invalid syntax, unknown schema and alternate token spellings", () => {
  for (const input of [' {"x":1,"x":2} ', ' {"x":1,} ', ' {"x":"\\u0061"} ', ' {"x":1.0} ', ' {"x":true}\nextra']) {
    assert.equal(jsonLayout(input, () => true), undefined, input);
  }
  assert.equal(jsonLayout(' {"unexpected":1} ', () => false), undefined);
  assert.equal(jsonLayout('{"x":1}', () => true), undefined);
});
