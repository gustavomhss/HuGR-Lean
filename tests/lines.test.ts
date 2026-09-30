import assert from "node:assert/strict";
import { test } from "node:test";
import { iterateLines, lines } from "../src/core/lines.js";

test("line spans retain exact multibyte text, CRLF and unterminated final line", () => {
  const input = "🔥 café\r\n\nlast";
  const parsed = lines(input);
  assert.deepEqual(Array.from(iterateLines(input)), parsed);
  assert.deepEqual(parsed.map((line) => line.text), ["🔥 café", "", "last"]);
  assert.equal(parsed.map((line) => input.slice(...line.span)).join(""), input);
  assert.deepEqual(parsed.map((line) => line.span), [[0, 9], [9, 10], [10, 14]]);
});

test("empty input has no fabricated line", () => {
  assert.deepEqual(lines(""), []);
  assert.deepEqual(Array.from(iterateLines("")), []);
});

test("iterative and array helpers combine exact Unicode and raw line endings", () => {
  for (const input of ["🔥\n𐐀漢字\r\ncafé", "\r\n\n", "last\r", "e\u0301\ud800\r\n\udfff"]) {
    const iterative = [...iterateLines(input)];
    assert.deepEqual(iterative, lines(input));
    assert.equal(iterative.map((line) => input.slice(...line.span)).join(""), input);
    assert.equal(iterative.at(-1)?.span[1], input.length);
  }
  assert.deepEqual([...iterateLines("🔥\n𐐀漢字\r\ncafé")], [
    { text: "🔥", span: [0, 3] }, { text: "𐐀漢字", span: [3, 9] }, { text: "café", span: [9, 13] },
  ]);
});

test("generator scans only the first requested line of a huge input", (t) => {
  const input = "🔥 café\r\n" + "unrequested row\n".repeat(100_000);
  const indexOf = String.prototype.indexOf, slice = String.prototype.slice, split = String.prototype.split;
  const searches: number[] = [], slices: [number | undefined, number | undefined][] = [];
  t.mock.method(String.prototype, "indexOf", function (this: string, search: string, start?: number) {
    if (this === input) {
      assert.equal(search, "\n");
      assert.equal(start, 0, "must not search later lines before another next()");
      searches.push(start);
    }
    return indexOf.call(this, search, start);
  });
  t.mock.method(String.prototype, "slice", function (this: string, start?: number, end?: number) {
    if (this === input) {
      assert.equal(start, 0);
      assert.equal(end, 7, "must not slice the unrequested tail");
      slices.push([start, end]);
    }
    return slice.call(this, start, end);
  });
  t.mock.method(String.prototype, "split", function (this: string, separator: string | RegExp, limit?: number) {
    assert.notEqual(this, input, "must not eagerly split the whole input");
    return Reflect.apply(split, this, [separator, limit]);
  });
  const iterator = iterateLines(input);
  assert.deepEqual(searches, []);
  assert.deepEqual(slices, []);
  assert.deepEqual(iterator.next(), { done: false, value: { text: "🔥 café", span: [0, 9] } });
  assert.deepEqual(searches, [0]);
  assert.deepEqual(slices, [[0, 7]]);
  assert.deepEqual(iterator.return(), { done: true, value: undefined });
  assert.deepEqual(searches, [0]);
});
