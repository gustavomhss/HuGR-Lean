import { describe, expect, test } from "bun:test";
describe("failure suite", () => {
  test("failed value α", () => expect({ value: 1 }).toEqual({ value: 2 }));
});
