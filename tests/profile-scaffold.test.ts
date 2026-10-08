import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filter } from "../src/core/engine.js";
import { profiles } from "../src/profiles/index.js";
import { goMode } from "../src/profiles/go-mode.js";

test("S00 registry keeps existing native fixture reductions and evidence", () => {
  const goldens = JSON.parse(readFileSync(new URL("../fixtures/installed-goldens.json", import.meta.url), "utf8")) as { outputs: Record<string, string> };
  for (const [id, path, command] of [
    ["cargo-test", "runners/cargo_test_success.txt", "cargo test --color never"],
    ["cargo-build", "runners/cargo_build_success.txt", "cargo build --color never"],
    ["go-test-verbose", "runners/go_test_success.txt", "go test -v"],
  ]) {
    const output = readFileSync(new URL(`../fixtures/${path}`, import.meta.url), "utf8");
    const expected = output.includes("\r\n") ? goldens.outputs[path!]!.replaceAll("\n", "\r\n") : goldens.outputs[path!]!;
    const result = filter({ source: "shell", command: command!, output, termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" });
    assert.equal(result.status, "reduced");
    assert.ok("replacement" in result);
    assert.equal(result.profile, id);
    assert.equal(result.replacement, expected);
  }
  assert.equal(new Set(profiles.map((profile) => profile.id)).size, profiles.length);
});

test("S00 Go modes route JSON+bench without overlap and reject unknown flags", () => {
  assert.equal(goMode(["go", "test", "-v", "./..."]), "text");
  assert.equal(goMode(["go", "test", "-bench=BenchmarkThing", "."]), "bench");
  assert.equal(goMode(["go", "test", "-bench", "BenchmarkThing", "-json"]), "json");
  assert.equal(goMode(["go", "test", "-unknown"]), undefined);
  assert.equal(goMode(["go", "test", "-bench"]), undefined);
  assert.equal(goMode(["go", "test", "-bench", "-json"]), undefined);
  assert.equal(goMode(["go", "test", "-json", "-json=false"]), "text");
  assert.equal(goMode(["echo", "go", "test"]), undefined);
});

test("S00 workflow preserves push and PR triggers but excludes only campaign branches", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  // Closed, literal YAML fragment; changes require updating this surgical routing witness.
  assert.ok(workflow.includes("  push:\n    branches-ignore:\n      - 'campaign/**'\n"));
  assert.ok(workflow.includes("  pull_request:\n    branches-ignore:\n      - 'campaign/**'\n"));
  assert.ok(!"main".startsWith("campaign/"));
  assert.ok("campaign/native/C01".startsWith("campaign/"));
  assert.ok(workflow.includes("      - run: npm run check\n"));
  assert.ok(workflow.includes("      - run: npm run smoke\n"));
});
