import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const host = await import(new URL("../scripts/real-world/host.mjs", import.meta.url).href);
const fixtures = await import(new URL("./real-host-plumbing.mjs", import.meta.url).href);
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const EXPECTED = [
  ["git-status", "git status", 0],
  ["rg-source", "rg -n 'readonly' src", 0],
  ["git-diff", "git diff -- README.md", 0],
  ["cargo-native", "cargo test", 0],
  ["unknown-read", "cat README.md", 0],
  ["git-failed", "git show missing-HuGR-real-host-ref", 128],
  ["host-truncated", "git status --untracked-files=all", 0],
] as const;
const readJSON = async (file: string) => JSON.parse(await readFile(file, "utf8"));

test("public runner reaches seven actual compiled hook round trips as mock plumbing", async () => {
  const fixture = await fixtures.plumbingFixture(repoRoot);
  try {
    const outputDir = path.join(fixture.root, "output");
    const report = await host.runRealHost({ repoRoot: fixture.compiled, outputDir, dependencies: fixture.sdk, binary: "mock-opencode" }, fixture.execution);
    assert.equal(report.mode, "mock-plumbing");
    assert.equal(report.status, "mock_checked");
    assert.equal(report.version, "1.18.17");
    assert.deepEqual(report.failures, []);
    assert.deepEqual(report.scenarios.map((row: any) => [row.id, row.command, row.expectExit]), EXPECTED);
    assert.deepEqual(fixture.transports, EXPECTED.map(([id]) => id));
    assert.deepEqual(fixture.checks, [
      { binary: "mock-opencode", args: ["--version"], name: "REAL_HOST_MISSING_HOST" },
      ...["git", "rg", "cargo", "rustc", "tar", "cat", "npm"].map((binary) => ({ binary, args: binary === "cat" ? [] : ["--version"], name: `REAL_HOST_MISSING_TOOL_${binary.toUpperCase()}` })),
    ]);
    assert.deepEqual(fixture.resolutions, ["mock-opencode", "git", "rg", "cargo", "rustc", "tar", "cat", "npm"]);
    const compiledPaths = ["dist/index.js", "dist/opencode/index.js", "dist/core/engine.js", "dist/profiles/formats.js", "dist/profiles/runners.js"];
    assert.deepEqual(report.plugin.compiled.map((row: any) => row.path), compiledPaths);
    for (const row of report.plugin.compiled) assert.equal(row.sha256, sha(await readFile(path.join(fixture.compiled, row.path))));
    assert.equal(report.bootstrap.lockSha256, sha(await readFile(path.join(fixture.sdk, "package-lock.json"))));
    assert.equal((await readJSON(path.join(outputDir, "setup.json"))).scenarios.length, 0);
    assert.deepEqual(await readJSON(path.join(outputDir, "report.json")), JSON.parse(JSON.stringify(report)));
    assert.match(await readFile(path.join(outputDir, "README.md"), "utf8"), /Mock plumbing artifacts/);
    for (const [index, [id, command, exit]] of EXPECTED.entries()) {
      const row = report.scenarios[index], directory = path.join(outputDir, id);
      assert.equal(row.mode, "mock-plumbing");
      assert.equal(row.status, "mock_checked");
      assert.equal(row.evidenceOK, true);
      assert.equal(row.metadataExact, true);
      assert.equal(row.requests, 2);
      const result = await readJSON(path.join(directory, "host-result.json"));
      const observer = (await readFile(path.join(directory, "observer.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      assert.deepEqual(observer.map((item: any) => item.kind), ["loaded", "before", "after"]);
      assert.deepEqual(observer[0].options, { enabled: true, raw: false });
      assert.equal(observer[0].hookPresent, true);
      const before = observer[1], after = observer[2];
      const args = { command, description: "Local deterministic boundary probe", timeout: 30000 };
      for (const actual of [row.issuedArgs, row.observerArgsBefore, row.observerArgsAfter, row.nativeInput, before.input.args, after.input.args, result.tool.state.input]) assert.deepEqual(actual, args);
      assert.equal(result.requests, 2);
      assert.equal(result.code, 0);
      assert.equal(result.signal, null);
      assert.equal(result.tool.state.status, "completed");
      assert.equal(result.tool.callID, "hugr_call");
      assert.deepEqual(before.input, after.input);
      assert.equal(before.boundary.title, command);
      assert.equal(after.boundary.title, command);
      assert.equal(result.tool.state.title, command);
      const metadata = before.boundary.metadata;
      assert.equal(metadata.exit, exit);
      assert.equal(metadata.truncated, id === "host-truncated");
      assert.equal(metadata.output, id === "host-truncated" ? "...\n\nretained mock tail café 🔥\n" : before.boundary.output);
      assert.deepEqual(metadata.mockFuture, { nested: ["café", "🔥", { retained: true }] });
      for (const actual of [after.boundary.metadata, result.tool.state.metadata, row.metadataBefore, row.metadataAfter, row.nativeMetadata]) assert.deepEqual(actual, metadata);
      const original = await readFile(path.join(directory, "original.txt"), "utf8"), model = await readFile(path.join(directory, "model.txt"), "utf8");
      assert.equal(before.boundary.output, original);
      assert.equal(before.originalSha256, sha(original));
      assert.equal(after.boundary.output, model);
      assert.equal(result.modelResult.content, model);
      assert.equal(result.tool.state.output, model);
      assert.equal(row.rawBytes, Buffer.byteLength(original, "utf8"));
      assert.equal(row.modelBytes, Buffer.byteLength(model, "utf8"));
      assert.equal(row.savedBytes, Buffer.byteLength(original, "utf8") - Buffer.byteLength(model, "utf8"));
      assert.deepEqual(await readJSON(path.join(directory, "record.json")), JSON.parse(JSON.stringify(row)));
      assert.equal(await readFile(path.join(directory, "host.stdout.jsonl"), "utf8"), result.stdout);
      assert.equal(await readFile(path.join(directory, "host.stderr.txt"), "utf8"), "MOCK_PLUMBING_STDERR café 🔥\n");
      assert.ok((await stat(row.isolatedRoot)).isDirectory());
      const wrapper = await readFile(path.join(directory, "observer.mjs"), "utf8");
      assert.ok(wrapper.includes("/dist/index.js"));
      if (id === "git-status") { assert.equal(original, fixtures.GIT); assert.ok(row.savedBytes > 0); }
      if (id === "rg-source") { assert.equal(original, fixtures.RG); assert.ok(row.savedBytes > 0); }
      if (id === "unknown-read") assert.equal(model, fixtures.README);
      if (id === "git-failed") { assert.equal(original, fixtures.FAILURE); assert.equal(model, fixtures.FAILURE); }
      if (id === "host-truncated") {
        assert.equal(original, model);
        const full = await readFile(path.join(directory, "native-full.txt"));
        assert.equal(row.nativeFullBytes, full.length);
        assert.deepEqual(full, Buffer.from("host-stress-".repeat(5000) + "retained mock tail café 🔥\n"));
      }
    }
  } finally { await fixture.cleanup(); }
});

test("public runner retains rejected round trip and continues all seven scenarios", async () => {
  const fixture = await fixtures.plumbingFixture(repoRoot, "unknown-read");
  try {
    const outputDir = path.join(fixture.root, "output");
    await assert.rejects(host.runRealHost({ repoRoot: fixture.compiled, outputDir, dependencies: fixture.sdk, binary: "mock-opencode" }, fixture.execution), /REAL_HOST_SCENARIOS_FAILED/);
    const report = await readJSON(path.join(outputDir, "report.json"));
    assert.equal(report.mode, "mock-plumbing");
    assert.equal(report.status, "failed");
    assert.equal(report.failure.name, "REAL_HOST_SCENARIOS_FAILED");
    assert.deepEqual(report.scenarios.map((row: any) => row.id), EXPECTED.map(([id]) => id));
    assert.deepEqual(fixture.transports, EXPECTED.map(([id]) => id));
    assert.deepEqual(report.failures.map((row: any) => [row.id, row.name]), [["unknown-read", "REAL_HOST_NATIVE_COMPLETION_MISSING"]]);
    const directory = path.join(outputDir, "unknown-read"), row = report.scenarios[4];
    const failure = await readJSON(path.join(directory, "failure.json"));
    const captured = await readJSON(path.join(directory, "host-result.json"));
    assert.equal(row.status, "failed");
    assert.equal(failure.name, "REAL_HOST_NATIVE_COMPLETION_MISSING");
    assert.equal(failure.mode, "mock-plumbing");
    assert.equal(captured.status, "failed");
    assert.equal(captured.code, 0);
    assert.equal(captured.signal, null);
    assert.equal(captured.requests, 2);
    assert.equal(captured.toolResults, 1);
    assert.equal(captured.root, row.isolatedRoot);
    assert.deepEqual(captured, { status: "failed", ...failure.diagnostics });
    assert.equal(await readFile(path.join(directory, "host.stdout.jsonl"), "utf8"), "MOCK_PLUMBING_STDOUT café 🔥\n");
    assert.equal(await readFile(path.join(directory, "host.stderr.txt"), "utf8"), "MOCK_PLUMBING_STDERR café 🔥\n");
    assert.ok((await stat(captured.root)).isDirectory());
    const observer = (await readFile(path.join(directory, "observer.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(observer.map((item: any) => item.kind), ["loaded", "before", "after"]);
    assert.equal(observer[1].boundary.output, fixtures.README);
    assert.equal(observer[2].boundary.output, fixtures.README);
    assert.equal((await readJSON(path.join(outputDir, "git-failed", "record.json"))).nativeMetadata.exit, 128);
    assert.equal((await readJSON(path.join(outputDir, "host-truncated", "record.json"))).status, "mock_checked");
  } finally { await fixture.cleanup(); }
});

test("execution seam accepts only process, tool, project and transport functions", async () => {
  for (const execution of [null, [], { checked: false }, { verifyHostScenario: () => ({ evidenceOK: true }) }, { observerPlugin: () => "" }]) {
    await assert.rejects(host.runRealHost({}, execution), /REAL_HOST_DEPENDENCY_INVALID/);
  }
});
