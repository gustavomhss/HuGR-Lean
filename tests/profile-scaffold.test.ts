import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { profiles } from "../src/profiles/index.js";
import { runnerProfiles } from "../src/profiles/runners.js";
import { formatProfiles } from "../src/profiles/formats.js";
import { nodeTestProfile } from "../src/profiles/node-test.js";
import { goMode } from "../src/profiles/go-mode.js";
import { filter } from "../src/core/engine.js";
import { readNativeCorpus } from "../scripts/native-corpus.mjs";
import { fileURLToPath } from "node:url";

test("S00 delta scaffold retains untouched profiles and original native evidence", () => {
  for (const original of [...runnerProfiles, ...formatProfiles, nodeTestProfile]) {
    if (!["cargo-test", "cargo-build", "go-test-verbose", "tsc"].includes(original.id)) assert.ok(profiles.includes(original));
  }
  const goldens = JSON.parse(readFileSync(new URL("../fixtures/installed-goldens.json", import.meta.url), "utf8")) as { outputs: Record<string, string> };
  for (const [fixture, command] of [["runners/cargo_test_success.txt", "cargo test --color never"], ["runners/cargo_build_success.txt", "cargo build --color never"], ["runners/go_test_success.txt", "go test -v"]]) {
    const output = readFileSync(new URL(`../fixtures/${fixture}`, import.meta.url), "utf8");
    const result = filter({ source: "shell", command: command!, output, termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" });
    assert.ok("replacement" in result);
    const expected = output.includes("\r\n") ? goldens.outputs[fixture!]!.replaceAll("\n", "\r\n") : goldens.outputs[fixture!]!;
    assert.equal(result.replacement, expected);
  }
  assert.equal(new Set(profiles.map((profile) => profile.id)).size, profiles.length);
});
test("S00 every delta corpus case reaches its declared default-profile result", async () => {
  const cases = await readNativeCorpus(fileURLToPath(new URL("../fixtures/profiles", import.meta.url)));
  for (const entry of cases) {
    const result = filter(entry.observation);
    assert.equal(result.status, entry.status, entry.name);
    assert.equal("replacement" in result ? result.replacement : entry.observation.output, entry.expected, entry.name);
    if (result.status === "reduced") assert.equal(result.profile, entry.family, entry.name);
  }
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
