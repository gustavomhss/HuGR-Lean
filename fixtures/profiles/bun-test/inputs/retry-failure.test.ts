import { expect, test } from "bun:test";
let attempts = 0;
test("retry exhausted", () => {
  console.log(`exhausted attempt ${++attempts}`);
  expect(false).toBe(true);
});
