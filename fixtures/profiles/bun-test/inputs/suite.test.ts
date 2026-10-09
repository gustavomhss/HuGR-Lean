import { describe, expect, test } from "bun:test";
import { classify } from "./subject";

describe("outer suite α", () => {
  test("passing leaf", () => expect(classify(2)).toBe("positive"));
  describe("nested suite", () => {
    test("nested passing leaf", () => expect(classify(0)).toBe("zero"));
    test.skip("skip: platform feature unavailable", () => {});
    test.todo("todo: implement negative branch");
  });
});
