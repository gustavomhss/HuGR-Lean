import assert from "node:assert/strict";
import { test } from "node:test";
const oracle = await import(new URL("../scripts/automatic-json-oracle.mjs", import.meta.url).href);

// Synthetic native/view pairs calibrate the oracle's teeth; the real host artifacts are the executable proof.
const NATIVE = `{
  "accessibility": { "nodes": [
    { "nodeId": "1", "ignored": false, "name": { "value": "東京" }, "childIds": ["2"], "n": 12345678901234567891 },
    { "nodeId": "2", "ignored": true, "parentId": "1", "childIds": [], "n": 0.10000000000000000001, "value": null }
  ] },
  "ok": 1.0
}`;
const COLUMNS = '["nodeId","ignored","name","parentId","childIds","n","value"]';
const ROW1 = '[["1"],[false],[{"value":"東京"}],[],[["2"]],[12345678901234567891],[]]';
const ROW2 = '[["2"],[true],[],["1"],[[]],[0.10000000000000000001],[null]]';
const table = (columns = COLUMNS, rows = `[${ROW1},${ROW2}]`, tail = ',"cellEncoding":"optional"') => `{"columns":${columns},"rows":${rows}${tail}}`;
const view = (nodes = table(), ok = "1.0") => `{"accessibility":{"nodes":${nodes}},"ok":${ok}}`;
const WRAP = ["### Result\n", "\n### Ran Playwright code\n```js\nreturn x;\n```"] as const;
const wrapped = (payload: string) => WRAP[0] + payload + WRAP[1];
const rejects = (native: string, replacement: string, message: RegExp) =>
  assert.throws(() => oracle.assertJsonEquivalent(native, replacement), (error: Error) => error instanceof assert.AssertionError && message.test(error.message));

test("positive controls: bare and wrapped optional-cell table views are equivalent", () => {
  oracle.assertJsonEquivalent(NATIVE, view());
  oracle.assertJsonEquivalent(wrapped(NATIVE), wrapped(view()));
  oracle.assertJsonEquivalent('{"a":[1,{"b":"\\u6771"}]}', '{ "a" : [ 1 , { "b" : "東" } ] }');
});

test("table shape violations are rejected", () => {
  const LOST = /JSON lost full source values\/refs/;
  rejects(NATIVE, view(table(COLUMNS, `[${ROW1.replace(/]$/, ',["extra"]]')},${ROW2}]`)), /row length differs/);
  rejects(NATIVE, view(table(COLUMNS, `[${ROW1.replace(',[]]', "]")},${ROW2}]`)), /row length differs/);
  rejects(NATIVE, view(table(COLUMNS, `[${ROW1},${ROW2}]`, ',"cellEncoding":"optional","scope":"x"')), LOST);
  rejects(NATIVE, view(table(COLUMNS, `[${ROW1},${ROW2}]`, "")), LOST);
  rejects(NATIVE, view(table(COLUMNS, `[${ROW1},${ROW2}]`, ',"cellEncoding":"dense"')), /Unknown table cell encoding/);
  rejects(NATIVE, view(table(COLUMNS.replace('"value"', '"n"'))), /Duplicate table column/);
  rejects(NATIVE, view(table(COLUMNS, `[${ROW1},${ROW2.replace("[null]", "[null,null]")}]`)), /Malformed optional table cell/);
  rejects(NATIVE, view(table(COLUMNS.replace('"nodeId","ignored"', "1,2"))), /columns must be strings/);
});

test("value, presence, order and precision changes are rejected", () => {
  const LOST = /JSON lost full source values\/refs/;
  rejects(NATIVE, view(table(COLUMNS, `[${ROW1}]`)), LOST); // dropped node
  rejects(NATIVE, view(table(COLUMNS, `[${ROW1.replace('[{"value":"東京"}]', "[]")},${ROW2}]`)), LOST); // dropped field
  rejects(NATIVE, view(table(COLUMNS, `[${ROW1},${ROW2.replace("[null]", "[]")}]`)), LOST); // null -> absent
  rejects(NATIVE, view(table(COLUMNS, `[${ROW1.replace(',[],[["2"]]', ',[null],[["2"]]')},${ROW2}]`)), LOST); // absent -> null
  rejects(NATIVE, view(table(COLUMNS, `[${ROW1},${ROW2.replace("[[]]", "[]")}]`)), LOST); // [] -> absent
  rejects(NATIVE, view(table(COLUMNS, `[${ROW1.replace('["1"]', '["2"]')},${ROW2.replace('["2"]', '["1"]')}]`)), LOST); // swapped values
  rejects(NATIVE, view(table(COLUMNS, `[${ROW1.replace("12345678901234567891", "12345678901234567000")},${ROW2}]`)), LOST);
  rejects(NATIVE, view(table(COLUMNS, `[${ROW1},${ROW2.replace("0.10000000000000000001", "0.1")}]`)), LOST);
  rejects(NATIVE, view(table(), "1"), LOST); // number lexeme 1.0 -> 1
  const swapped = `[${ROW1.replace('[["1"],[false],', '[[false],["1"],')},${ROW2.replace('[["2"],[true],', '[[true],["2"],')}]`;
  rejects(NATIVE, view(table(COLUMNS.replace('"nodeId","ignored"', '"ignored","nodeId"'), swapped)), LOST); // key order
  rejects('{"a":1,"b":2}', '{"b":2,"a":1}', LOST);
});

test("duplicate keys, trailing data and wrapper changes are rejected", () => {
  rejects('{"a":1}', '{"a":1,"a":1}', /duplicate key/);
  rejects('{"a":1,"a":2}', '{"a":2}', /duplicate key/);
  rejects(NATIVE, view() + " junk", /trailing data/);
  rejects(wrapped(NATIVE), wrapped(view() + "}"), /trailing data/);
  rejects(wrapped(NATIVE), "### Result \n" + view() + WRAP[1], /wrapper prefix changed/);
  rejects(wrapped(NATIVE), WRAP[0] + view() + WRAP[1] + "\n", /wrapper suffix changed/);
  rejects(wrapped(NATIVE), view(), /wrapper prefix changed/);
});
