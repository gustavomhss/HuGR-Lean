import { expect, test } from "bun:test";
let attempts = 0;
test("flaky succeeds second attempt", () => {
  attempts++;
  console.log(`retry attempt ${attempts}`);
  expect(attempts).toBeGreaterThanOrEqual(2);
});
