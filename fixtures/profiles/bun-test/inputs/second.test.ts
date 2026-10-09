import { expect, test } from "bun:test";
import { classify } from "./subject";
test("second file identity β", () => expect(classify(-1)).toBe("negative"));
test.skip("skip: external service unavailable", () => {});
