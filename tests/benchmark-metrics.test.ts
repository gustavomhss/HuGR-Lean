import assert from "node:assert/strict";
import { test } from "node:test";

const benchmark = await import(new URL("../scripts/benchmark.mjs", import.meta.url).href);

test("benchmark silent native boundaries contribute finite zero savings", () => {
  assert.equal(benchmark.savingsPercent(1024, 512), 50, "Known nonzero savings control");
  assert.equal(benchmark.savingsPercent(1024, 1024), 0);
  assert.equal(benchmark.savingsPercent(0, 0), 0, "Empty exact output must not become NaN/null");
  for (const [input, output] of [[0, 1], [-1, 0], [10, 11], [0.5, 0], [Infinity, 0], [10, NaN]]) {
    assert.throws(() => benchmark.savingsPercent(input, output), /Invalid savings byte counts/);
  }
});
