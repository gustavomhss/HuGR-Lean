import { expect, test } from "bun:test";
test("opaque user logs", () => {
  console.log("user stdout α: preserve both occurrences");
  console.log("user stdout α: preserve both occurrences");
  console.error("user stderr β: preserve order at merged boundary");
  expect(true).toBe(true);
});
