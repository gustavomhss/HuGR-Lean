import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filter } from "../src/core/index.js";
import type { Observation } from "../src/types.js";
import { familyProfiles } from "../src/profiles/go-test-json.js";

const root = new URL("../fixtures/profiles/go-test-json/", import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, root), "utf8");
interface NativeCase {
  name: string; command: string; file: string; expectedFile: string;
  status: "reduced" | "passthrough";
  termination: { kind: "exited"; code: number };
  completeness: "complete"; presentation: "unknown";
}
const cases = (JSON.parse(read("cases.json")) as { cases: NativeCase[] }).cases;
function observe(output: string, command = cases[0]!.command): Observation {
  return { source: "shell", command, output, termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" };
}
for (const c of cases) {
  test(`${c.name}: native public-filter golden`, () => {
    const original = read(c.file), expected = read(c.expectedFile);
    const result = filter({ source: "shell", ...c, output: original }, { profiles: familyProfiles });
    assert.equal(result.status, c.status);
    assert.equal("replacement" in result ? result.replacement : original, expected);
    if (c.status === "reduced") {
      assert.equal(result.status, "reduced");
      if (result.status !== "reduced") assert.fail("native reduction missing");
      assert.equal(result.profile, "go-test-json");
      assert.equal(result.outputBytes, Buffer.byteLength(expected));
      assert.equal(result.inputBytes, Buffer.byteLength(original));
      const outputs = (s: string): string[] => s.split("\n").filter(Boolean).filter(line => Object.hasOwn(JSON.parse(line), "Output"));
      assert.deepEqual(outputs(expected), outputs(original));
    }
  });
}
