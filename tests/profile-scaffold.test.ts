import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { profiles } from "../src/profiles/index.js";
import { runnerProfiles } from "../src/profiles/runners.js";
import { formatProfiles } from "../src/profiles/formats.js";
import { nodeTestProfile } from "../src/profiles/node-test.js";
import { goMode } from "../src/profiles/go-mode.js";

test("S00 delta scaffold retains all original profile objects and order", () => {
  assert.deepEqual(profiles, [...runnerProfiles, ...formatProfiles, nodeTestProfile]);
  assert.equal(new Set(profiles.map((profile) => profile.id)).size, profiles.length);
});
test("S00 delta Go routing is disjoint and closed", () => {
  assert.equal(goMode(["go", "test", "-v", "./..."]), "text");
  assert.equal(goMode(["go", "test", "-bench=BenchmarkThing", "."]), "bench");
  assert.equal(goMode(["go", "test", "-bench", "BenchmarkThing", "-json"]), "json");
  assert.equal(goMode(["go", "test", "-json", "-json=false"]), "text");
  for (const args of [["go", "test", "-unknown"], ["go", "test", "-bench"], ["go", "test", "-bench", "-json"]]) assert.equal(goMode(args), undefined);
});
test("S00 delta keeps exact-candidate manual workflow with no push or PR trigger", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const eventBlock = workflow.slice(workflow.indexOf("on:\n"), workflow.indexOf("concurrency:\n"));
  assert.equal(eventBlock, "on:\n  workflow_dispatch:\n    inputs:\n      candidate_sha:\n        description: Exact candidate commit (40 lowercase hexadecimal characters)\n        required: true\n        type: string\n");
  assert.ok(workflow.includes("ref: ${{ inputs.candidate_sha }}"));
  assert.ok(workflow.includes("run: node scripts/ci-candidate.mjs"));
});
