import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filter } from "../src/core/index.js";
import type { Observation } from "../src/types.js";
import { familyProfiles } from "../src/profiles/cargo-doc.js";

const root = new URL("../fixtures/profiles/cargo-doc/", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, root), "utf8");
const observation = (output: string, command = "cargo doc --offline"): Observation => ({
  output, command, source: "shell", termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown",
});
test("C05 default independent native golden positive", () => {
  const result = filter(observation(read("default/native.txt")), { profiles: familyProfiles });
  assert.equal(result.status, "reduced");
  assert.ok("replacement" in result);
  assert.equal(result.replacement, read("default/expected.txt"));
});
