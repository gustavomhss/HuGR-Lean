import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";

const load = (name: string) => import(new URL(`../scripts/real-world/${name}.mjs`, import.meta.url).href);
const { runRealBenchmark } = await load("run"), { caseWorkspace } = await load("case-workspace");
const { measureCapture } = await load("measure"), { verifiedCapture } = await load("integrity");
const { analyze } = await load("analyze"), { replay } = await load("replay");
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const marker = "BENCH_EXPECTED_FAILURE";
// Original MIT in-memory Go-shaped failure; no native command or historical corpus execution.
const output = `=== RUN   TestBenchExpectedFailure\n    bench_expected_failure_test.go:4: ${marker}\n--- FAIL: TestBenchExpectedFailure (0.00s)\nFAIL\nFAIL\texample.org/integration\t0.001s\n`;
const app = {
  filter: (obs: { output: string }) => ({ status: "passthrough", reason: "integration_control",
    inputBytes: Buffer.byteLength(obs.output), outputBytes: Buffer.byteLength(obs.output) }),
  createAfterHook: () => async () => {},
}; // Explicit plumbing filter: actual public runner, measure, archive, analysis and replay execute.

for (const fault of [false, true]) test(`integrated workspace/capture/policy pipeline: ${fault ? "guardian loss" : "complete control"}`, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-integration-")), source = path.join(root, "source");
  const outputDir = path.join(root, "output"), original = Buffer.from([0, 255, ...Buffer.from("source café🔥\n")]);
  await mkdir(source); await writeFile(path.join(source, "source.bin"), original);
  const workspace = caseWorkspace(source, [{ path: "source.bin", append: true, text: marker }]);
  const specs = [
    { id: "primary", project: "synthetic", category: "primary", command: "synthetic-empty", oracle: "exact",
      expectExit: "zero", allowEmpty: true, cwd: source, modifications: [] },
    { id: "control", project: "synthetic", category: "control", command: "go test -v ./...", oracle: "go",
      expectExit: "nonzero", marker, allowEmpty: false, modifications: [{ path: "source.bin", change: "retained copy" }],
      get cwd() { return workspace.cwd; }, get workspace() { return workspace.workspace; },
      prepare: () => workspace.prepare(), restore: () => workspace.restore() },
  ];
  const measured: string[] = [], captured: string[] = [];
  try {
    const running = runRealBenchmark({ outputDir }, {
      compile: async () => app,
      provisionProjects: async (directory: string) => {
        await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, "catalog.json"), JSON.stringify({ cases: specs }));
        return { cases: specs, env: {}, projects: [], versions: {} };
      },
      takeCapture: async (spec: (typeof specs)[number]) => {
        captured.push(spec.id);
        if (spec.id === "control") {
          assert.notEqual(spec.cwd, source);
          assert.deepEqual(await readFile(path.join(spec.cwd, "source.bin")), Buffer.concat([original, Buffer.from(marker)]));
          assert.deepEqual(await readFile(path.join(source, "source.bin")), original);
        }
        const raw = Buffer.from(spec.id === "control" ? output : "");
        return { command: spec.command, cwd: spec.cwd, output: raw.toString(), raw, stdout: raw, stderr: Buffer.alloc(0),
          exitCode: spec.id === "control" ? 1 : 0, signal: null, timedOut: false, durationMs: 1,
          complete: !(fault && spec.id === "control"),
          ...(fault && spec.id === "control" ? { killErrors: ["GUARDIAN_CHANNEL_LOST: integration control"] } : {}) };
      },
      measure: async (spec: (typeof specs)[number], capture: unknown, compiled: unknown) => {
        measured.push(spec.id); return measureCapture(spec, capture, compiled);
      },
    });
    if (fault || process.platform === "win32") await assert.rejects(running, /REAL_BENCHMARK_UNMEASURED_CASES/);
    else assert.equal((await running).state, "measured");
    const report = await json(path.join(outputDir, "report.json"));
    assert.equal(workspace.cwd, source);
    assert.deepEqual(await readFile(path.join(source, "source.bin")), original);
    assert.equal(report.planned[0].allowEmpty, true);
    assert.equal(report.planned[1].marker, marker);
    const directory = path.join(outputDir, "cases/control");
    if (process.platform === "win32") {
      assert.deepEqual(captured, ["primary"]); assert.deepEqual(measured, ["primary"]);
      assert.equal((await json(path.join(directory, "failure.json"))).code, "CASE_WORKSPACE_UNSUPPORTED");
      assert.equal(report.state, "failed"); return; // Actual unsupported backend path; no native POSIX claim.
    }
    assert.deepEqual(captured, ["primary", "control"]);
    const savedCapture = await json(path.join(directory, "capture.json"));
    assert.deepEqual(savedCapture.caseWorkspace, workspace.workspace);
    assert.equal(savedCapture.cwd, workspace.workspace.cwd);
    assert.deepEqual(gunzipSync(await readFile(path.join(directory, "original.txt.gz"))), Buffer.from(output));
    assert.deepEqual(await readFile(path.join(workspace.workspace.cwd, "source.bin")), Buffer.concat([original, Buffer.from(marker)]));
    if (fault) {
      assert.deepEqual(measured, ["primary"]); assert.equal(report.state, "failed");
      const failure = await json(path.join(directory, "failure.json"));
      assert.match(failure.message, /CAPTURE_EXECUTION_FAILED/);
      assert.deepEqual(failure.caseWorkspace, workspace.workspace);
      assert.deepEqual(savedCapture.killErrors, ["GUARDIAN_CHANNEL_LOST: integration control"]);
      await assert.rejects(readFile(path.join(directory, "result.json")), { code: "ENOENT" });
    } else {
      assert.deepEqual(measured, ["primary", "control"]);
      const row = report.cases[1]; assert.equal(row.marker, marker); assert.equal(row.allowEmpty, false);
      assert.deepEqual((await verifiedCapture(outputDir, row)).capture.raw, Buffer.from(output));
      assert.equal((await analyze(outputDir)).evidenceOK, true);
      const before = await readFile(path.join(directory, "capture.json"));
      const replayed = await replay(outputDir, { compile: async () => app });
      assert.equal(replayed.cases[1].evidence.ok, true);
      assert.deepEqual(replayed.cases[1].artifacts, row.artifacts);
      assert.deepEqual(await readFile(path.join(directory, "capture.json")), before);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
