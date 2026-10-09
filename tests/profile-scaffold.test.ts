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
test("routing closure: newly integrated lint families reach exact declared goldens", async () => {
  const entries = await readNativeCorpus(fileURLToPath(new URL("../fixtures/profiles", import.meta.url)));
  const newFamilies = new Set(["cargo-clippy", "eslint", "biome", "ruff"]);
  for (const entry of entries.filter((item) => newFamilies.has(item.family))) {
    const result = filter(entry.observation);
    assert.equal(result.status, entry.status, entry.name);
    assert.equal("replacement" in result ? result.replacement : entry.observation.output, entry.expected, entry.name);
    if (result.status === "reduced") assert.equal(result.profile, entry.family, entry.name);
  }
});
test("S00 delta Go routing is disjoint and closed", () => {
  const goMod = profiles.find(profile => profile.id === "go-mod");
  assert.ok(goMod);
  assert.ok(goMod.match(["go", "get", "example.com/pkg"]));
  assert.equal(goMod.match(["go", "test", "-v"]), false);
  assert.equal(goMode(["go", "test", "-v", "./..."]), "text");
  assert.equal(goMode(["go", "test", "-bench=BenchmarkThing", "."]), "bench");
  assert.equal(goMode(["go", "test", "-bench", "BenchmarkThing", "-json"]), "json");
  assert.equal(goMode(["go", "test", "-json", "-json=false"]), "text");
  for (const args of [["go", "test", "-unknown"], ["go", "test", "-bench"], ["go", "test", "-bench", "-json"]]) assert.equal(goMode(args), undefined);
});
test("routing closure: Go mod reaches nonempty native goldens", async () => {
  const entries = (await readNativeCorpus(fileURLToPath(new URL("../fixtures/profiles", import.meta.url))))
    .filter(entry => entry.family === "go-mod");
  assert.ok(entries.length > 0);
  assert.ok(entries.some(entry => entry.status === "reduced"));
  assert.ok(entries.some(entry => entry.status === "passthrough"));
  for (const entry of entries) {
    const result = filter(entry.observation);
    assert.equal(result.status, entry.status, entry.name);
    assert.equal("replacement" in result ? result.replacement : entry.observation.output, entry.expected, entry.name);
    if (result.status === "reduced") assert.equal(result.profile, entry.family, entry.name);
  }
});
test("S00 delta keeps exact-candidate manual workflow with no push or PR trigger", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const eventBlock = workflow.slice(workflow.indexOf("on:\n"), workflow.indexOf("concurrency:\n"));
  assert.equal(eventBlock, "on:\n  workflow_dispatch:\n    inputs:\n      candidate_sha:\n        description: Exact candidate commit (40 lowercase hexadecimal characters)\n        required: true\n        type: string\n");
  assert.ok(workflow.includes("ref: ${{ inputs.candidate_sha }}"));
  assert.ok(workflow.includes("run: node scripts/ci-candidate.mjs"));
});
test("routing closure: Pyright reaches nonempty native goldens", async () => {
  const entries = (await readNativeCorpus(fileURLToPath(new URL("../fixtures/profiles", import.meta.url))))
    .filter(entry => entry.family === "pyright");
  assert.ok(entries.length > 0);
  assert.ok(entries.some(entry => entry.status === "reduced"));
  assert.ok(entries.some(entry => entry.status === "passthrough"));
  for (const entry of entries) {
    const result = filter(entry.observation);
    assert.equal(result.status, entry.status, entry.name);
    assert.equal("replacement" in result ? result.replacement : entry.observation.output, entry.expected, entry.name);
    if (result.status === "reduced") assert.equal(result.profile, "pyright", entry.name);
  }
});
test("corpus closure: exact Cargo doc mypy ShellCheck preserve native bytes", async () => {
  const entries = await readNativeCorpus(fileURLToPath(new URL("../fixtures/profiles", import.meta.url)));
  for (const family of ["cargo-doc", "mypy", "shellcheck"]) {
    const captures = entries.filter(entry => entry.family === family);
    assert.ok(captures.length > 0, family);
    for (const entry of captures) {
      assert.equal(entry.status, "passthrough", entry.name);
      const result = filter(entry.observation);
      assert.equal(result.status, "passthrough", entry.name);
      assert.equal("replacement" in result, false, entry.name);
      assert.equal(entry.expected, entry.observation.output, entry.name);
    }
  }
});
test("routing closure: Pylint reaches nonempty native goldens", async () => {
  const entries = (await readNativeCorpus(fileURLToPath(new URL("../fixtures/profiles", import.meta.url))))
    .filter(entry => entry.family === "pylint");
  assert.ok(entries.length > 0);
  assert.ok(entries.some(entry => entry.status === "reduced"));
  assert.ok(entries.some(entry => entry.status === "passthrough"));
  for (const entry of entries) {
    const result = filter(entry.observation);
    assert.equal(result.status, entry.status, entry.name);
    assert.equal("replacement" in result ? result.replacement : entry.observation.output, entry.expected, entry.name);
    if (result.status === "reduced") assert.equal(result.profile, "pylint", entry.name);
  }
});
test("corpus closure: promoted campaign families preserve declared native results", async () => {
  const promoted = new Set(["bun-install", "bun-test", "cargo-bench", "cargo-fetch", "cargo-fmt", "cargo-nextest",
    "esbuild", "go-bench", "go-build", "golangci-lint", "jest", "markdownlint", "next", "npm-install",
    "pip-install", "playwright", "prettier", "pytest", "rollup", "stylelint", "uv-install", "vite", "vitest", "webpack", "yarn-install"]);
  const entries = await readNativeCorpus(fileURLToPath(new URL("../fixtures/profiles", import.meta.url)));
  for (const family of promoted) {
    const captures = entries.filter(entry => entry.family === family);
    assert.ok(captures.length > 0, family);
    for (const entry of captures) {
      const result = filter(entry.observation);
      assert.equal(result.status, entry.status, entry.name);
      assert.equal("replacement" in result ? result.replacement : entry.observation.output, entry.expected, entry.name);
      if (entry.status === "passthrough") assert.equal("replacement" in result, false, entry.name);
    }
  }
});
test("corpus closure: final native supplements stay exact at default boundary", async () => {
  const names = ["P01/peer-override-success", "P03/supplement-classic-dependency-deprecation",
    "P03/supplement-classic-cold-cache-offline-miss", "P03/supplement-berry-dependency-deprecation",
    "P03/supplement-berry-cold-cache-offline-miss", "P04/registry-blocked-default", "P04/registry-trusted-manifest",
    "P04/registry-trusted-flag", "P04/registry-offline-request", "G04/cross-linux-amd64-success",
    "C04/workspace-clean-all", "cargo-doc-actions-default-nooffline", "cargo-doc-actions-bins-checking",
    "cargo-doc-actions-cross-aarch64", "cargo-doc-actions-config-control", "cargo-doc-actions-user-config"];
  const entries = await readNativeCorpus(fileURLToPath(new URL("../fixtures/profiles", import.meta.url)));
  for (const name of names) {
    const entry = entries.find(item => item.name === `native/${name}`);
    assert.ok(entry, `Missing native supplement: ${name}`);
    assert.equal(entry.status, "passthrough", name);
    const result = filter(entry.observation);
    assert.equal(result.status, "passthrough", name);
    assert.equal("replacement" in result, false, name);
    assert.equal(result.outputBytes, Buffer.byteLength(entry.observation.output, "utf8"), name);
    assert.equal(entry.expected, entry.observation.output, name);
  }
});
