import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";

// Reuse: HuGR-Lean (MIT), 2df2a7034b6e6f728d2d95e7450a4e313393863f,
// scripts/real-world/run.mjs: exact optional dependency seam and call substitutions only.
// No other D02 changes copied. These synthetic caller fixtures are original, not native benchmarks.
const { runRealBenchmark } = await import(new URL("../scripts/real-world/run.mjs", import.meta.url).href);
const { checkEvidence } = await import(new URL("../scripts/real-world/evidence.mjs", import.meta.url).href);
const guardianLoss = { complete: false, killErrors: ["GUARDIAN_CHANNEL_LOST: native exit observed before channel loss"],
  durationBoundary: "guardian-loss", nativeSpawned: true, nativeExitObserved: true };
const stdout = Buffer.from("native café🔥\r\n"), stderr = Buffer.from("original failure detail\n");
const raw = Buffer.concat([stdout, stderr]);
const baseCapture = { stdout, stderr, raw, output: raw.toString(), exitCode: 0, signal: null,
  complete: true, timedOut: false, durationMs: 1.25 };
type Spec = { id: string; category: string; expectExit: string; command: string; oracle: string };
const specs: Spec[] = [
  { id: "primary", category: "primary", expectExit: "zero", command: "synthetic-success", oracle: "exact" },
  { id: "control", category: "control", expectExit: "nonzero", command: "synthetic-failure", oracle: "exact" },
];
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));

async function exercise(patch: Record<string, unknown> = {}, failure?: string) {
  const outputDir = await mkdtemp(path.join(tmpdir(), "lean-run-execution-"));
  const calls = { compile: 0, provision: 0, capture: [] as string[], measure: [] as string[] };
  const app = {}, env = { SYNTHETIC: "yes" };
  const captures = specs.map((spec, i) => ({ ...baseCapture, command: spec.command,
    ...(i === 0 ? patch : { exitCode: 7, durationMs: 0, killErrors: [] }) }));
  const before = captures.map((capture) => structuredClone(capture));
  const dependencies = {
    compile: async () => { calls.compile++; return app; },
    provisionProjects: async () => { calls.provision++; return { cases: specs, env, projects: [], versions: {} }; },
    takeCapture: async (spec: Spec, receivedEnv: unknown, { logDir }: { logDir: string }) => {
      calls.capture.push(spec.id); assert.equal(receivedEnv, env);
      await mkdir(logDir, { recursive: true });
      for (const [name, bytes] of [["original", raw], ["stdout", stdout], ["stderr", stderr]] as const) {
        await writeFile(path.join(logDir, `${name}.live`), bytes);
      }
      return captures[specs.indexOf(spec)];
    },
    measure: async (spec: Spec, capture: typeof baseCapture, receivedApp: unknown) => {
      calls.measure.push(spec.id); assert.equal(receivedApp, app);
      assert.equal(capture, captures[specs.indexOf(spec)]);
      // Deliberately successful measurement: caller must reject bad execution before this seam.
      return { filtered: capture.output, record: { id: spec.id, category: spec.category, observedExit: capture.exitCode,
        captureMs: capture.durationMs, inputBytes: raw.length, outputBytes: raw.length, evidence: { ok: true, violations: [] },
        core: { wallMs: { p95: 0 } }, adapterRawOff: { wallMs: { p95: 0 } } } };
    },
  };
  try {
    const run = runRealBenchmark({ outputDir }, dependencies);
    if (failure) await assert.rejects(run, /REAL_BENCHMARK_UNMEASURED_CASES/);
    else assert.equal((await run).state, "measured");
    assert.deepEqual(calls, { compile: 1, provision: 1, capture: ["primary", "control"],
      measure: failure ? ["control"] : ["primary", "control"] });
    assert.deepEqual(captures.map((capture) => structuredClone(capture)), before, "Original capture facts changed");
    const reportPath = path.join(outputDir, "report.json"), reportBytes = await readFile(reportPath);
    const report = JSON.parse(reportBytes.toString());
    assert.equal(report.state, failure ? "failed" : "measured");
    assert.deepEqual(report.cases.map((row: { observedExit: number }) => row.observedExit), failure ? [7] : [0, 7]);
    if (failure) {
      assert.match(report.failure.message, /REAL_BENCHMARK_UNMEASURED_CASES/);
      assert.equal(report.failures.length, 1);
      const failed = await readJson(path.join(outputDir, "cases/primary/failure.json"));
      assert.match(failed.message, new RegExp(`^${failure}:`));
      assert.deepEqual(report.failures[0], { id: failed.id, message: failed.message, name: "NATIVE_CASE_FAILED" });
      assert.deepEqual(failed.diagnostics, {});
      assert.equal(failed.caseWorkspace, null);
    } else {
      assert.deepEqual(report.failures, []);
      assert.equal(report.primary.cases, 1); assert.equal(report.controls.cases, 1);
    }
    for (const [i, spec] of specs.entries()) {
      const directory = path.join(outputDir, "cases", spec.id), capture = captures[i]!;
      const { raw: _raw, stdout: _stdout, stderr: _stderr, ...facts } = capture;
      const { artifacts, caseWorkspace, ...savedFacts } = await readJson(path.join(directory, "capture.json"));
      assert.equal(caseWorkspace, null);
      assert.deepEqual(savedFacts, JSON.parse(JSON.stringify(facts)));
      for (const [name, bytes] of [["original", raw], ["stdout", stdout], ["stderr", stderr]] as const) {
        assert.deepEqual(gunzipSync(await readFile(path.join(directory, artifacts[name].file))), bytes);
        assert.deepEqual(await readFile(path.join(directory, `${name}.live`)), bytes);
        assert.equal(artifacts[name].bytes, bytes.length);
        assert.equal(artifacts[name].sha256, createHash("sha256").update(bytes).digest("hex"));
      }
      const names = await readdir(directory);
      assert.equal(names.includes("result.json"), !failure || i === 1);
      assert.equal(names.includes("filtered.txt.gz"), !failure || i === 1);
      assert.equal(names.includes("failure.json"), Boolean(failure) && i === 0);
    }
    await assert.rejects(runRealBenchmark({ outputDir }, dependencies), /REAL_BENCHMARK_OUTPUT_NOT_EMPTY/);
    assert.deepEqual(await readFile(reportPath), reportBytes, "Rerun overwrote original report");
    assert.equal(calls.compile, 1);
  } finally { await rm(outputDir, { recursive: true, force: true }); }
}

test("public caller admits complete exit 0 and expected exit 7, including zero duration", () => exercise());
test("guardian loss preserves evidence but cannot become measured execution", async () => {
  const capture = { ...baseCapture, ...guardianLoss };
  const result = { status: "passthrough", reason: "synthetic", inputBytes: raw.length, outputBytes: raw.length };
  const evidence = checkEvidence(specs[0], capture, result);
  assert.equal(evidence.ok, false); // Integrated C also rejects incomplete native evidence.
  assert.ok(evidence.violations.some((value: string) => value.includes(": native_completeness:")));
  assert.ok(!evidence.violations.some((value: string) => value.includes(": no_replacement:")));
  const corrupted = checkEvidence(specs[0], capture, { ...result, outputBytes: 0 });
  assert.ok(corrupted.violations.some((value: string) => value.includes(": output_bytes:")));
  await exercise(guardianLoss, "CAPTURE_EXECUTION_FAILED");
});

const faults: [string, Record<string, unknown>, string?][] = [
  ["cleanup error despite complete true", { killErrors: ["SIGKILL: EPERM: original cleanup failure"] }],
  ["incomplete", { complete: false }], ["missing completeness", { complete: undefined }],
  ["timeout after observed zero", { timedOut: true, nativeExitObserved: true }],
  ["missing timeout", { timedOut: undefined }],
  ["null exit", { exitCode: null }], ["missing exit", { exitCode: undefined }],
  ["fractional exit", { exitCode: 0.5 }], ["negative exit", { exitCode: -1 }],
  ["signal", { signal: "SIGTERM" }], ["missing signal", { signal: undefined }],
  ["unknown native duration", { durationMs: null }], ["missing duration", { durationMs: undefined }],
  ["NaN duration", { durationMs: NaN }], ["infinite duration", { durationMs: Infinity }],
  ["negative duration", { durationMs: -1 }], ["string duration", { durationMs: "0" }],
  ["launch error", { launchError: "ENOENT: original launch failure" }, "CAPTURE_UNUSABLE"],
  ["encoding error", { encodingError: "original decoding failure" }, "CAPTURE_UNUSABLE"],
];
for (const [name, patch, failure = "CAPTURE_EXECUTION_FAILED"] of faults) {
  test(`public caller rejects ${name} and retains original artifacts`, () => exercise(patch, failure));
}
