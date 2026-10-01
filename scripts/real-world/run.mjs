#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, readdir, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compiled } from "../benchmark.mjs";
import { provision } from "./workloads.mjs";
import { captureCommand, archiveCapture } from "./capture.mjs";
import { measureCapture, aggregate } from "./measure.mjs";
import { nativePolicy } from "./integrity.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const json = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + "\n");
export async function archiveCaseFailure(directory, spec, error) {
  await mkdir(directory, { recursive: true });
  const diagnostics = {};
  for (const stream of ["stdout", "stderr"]) {
    if (!Buffer.isBuffer(error[stream])) continue;
    diagnostics[stream] = `workspace-helper.${stream}`;
    await writeFile(path.join(directory, diagnostics[stream]), error[stream]);
  }
  await json(path.join(directory, "failure.json"), { id: spec.id, message: error.message, code: error.code,
    caseWorkspace: spec.workspace ?? error.workspace ?? null, diagnostics });
}
export async function runRealBenchmark({ outputDir, preparedRoot, repoRoot = ROOT } = {},
  { compile = compiled, provisionProjects = provision, takeCapture = captureCommand, measure = measureCapture } = {}) {
  assert.ok(outputDir, "REAL_BENCHMARK_OUTPUT_DIR_REQUIRED");
  outputDir = path.resolve(outputDir); await mkdir(outputDir, { recursive: true });
  assert.equal((await readdir(outputDir)).length, 0, "REAL_BENCHMARK_OUTPUT_NOT_EMPTY: interrupted captures remain immutable; start a fresh isolated run");
  const app = await compile(repoRoot), report = { schema: "hugr-lean/real-world/1", state: "running", version: "0.2.0",
    startedAt: new Date().toISOString(), cases: [], failures: [], outputDir,
    methodology: { primary: "native commands in pinned real projects; zero savings retained", controls: "marked native failure/worktree controls, excluded from primary aggregate",
      capture: "one execution per case; stdout/stderr arrival order", performance: "same captured observation replay; 20 warmups and 100 samples; no command runtime p95", tokenizer: null },
    environment: { node: process.version, v8: process.versions.v8, platform: process.platform, arch: process.arch, release: os.release(), cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length, memoryBytes: os.totalmem(), loadBefore: os.loadavg(), isolatedCPU: false } };
  try {
    let prepared;
    assert.equal(preparedRoot, undefined, "PREPARED_REUSE_DISABLED: fresh isolated projects required; immutable completed captures can be analyzed/replayed");
    preparedRoot = path.join(outputDir, "provision");
    const started = performance.now(); prepared = await provisionProjects(preparedRoot, { repoRoot });
    report.setup = { mode: "fresh provision", root: preparedRoot, elapsedMs: performance.now() - started };
    report.projects = prepared.projects; report.versions = prepared.versions;
    report.planned = prepared.cases.map((spec) => {
      const { id, project, category, command, expectExit, oracle, cache, modifications } = spec;
      return { id, project, category, command, expectExit, oracle, cache, modifications, ...nativePolicy(spec) };
    });
    assert.ok(prepared.cases.length, "REAL_BENCHMARK_EMPTY_CASES");
    assert.equal(new Set(prepared.cases.map((row) => row.id)).size, prepared.cases.length, "REAL_BENCHMARK_DUPLICATE_CASE");
    await json(path.join(outputDir, "report.json"), report);
    for (const spec of prepared.cases) {
      assert.match(spec.id, /^[a-z0-9-]+$/);
      const directory = path.join(outputDir, "cases", spec.id);
      let capture, measurement;
      console.error(`Native capture: ${spec.id}: ${spec.command}`);
      try {
        await spec.prepare?.();
        capture = await takeCapture(spec, prepared.env, { logDir: directory });
        const artifacts = await archiveCapture(directory, capture);
        const { raw, stdout, stderr, ...facts } = capture;
        await json(path.join(directory, "capture.json"), { ...facts, artifacts, caseWorkspace: spec.workspace ?? null });
        if (capture.launchError || capture.encodingError) throw new Error(`CAPTURE_UNUSABLE: ${capture.launchError ?? capture.encodingError}`);
        if (capture.killErrors?.length || capture.complete !== true || capture.timedOut !== false ||
            !Number.isSafeInteger(capture.exitCode) || capture.exitCode < 0 || capture.signal !== null ||
            !Number.isFinite(capture.durationMs) || capture.durationMs < 0) {
          throw new Error(`CAPTURE_EXECUTION_FAILED: ${spec.id}; see capture.json for original execution facts`);
        }
        measurement = await measure(spec, capture, app);
        Object.assign(measurement.record, nativePolicy(spec));
        measurement.record.artifacts = await archiveCapture(directory, capture, measurement.filtered);
        report.cases.push(measurement.record);
        if (!measurement.record.evidence.ok) report.failures.push({ id: spec.id, name: "EVIDENCE_OR_EXECUTION_FAILED", violations: measurement.record.evidence.violations });
        await json(path.join(directory, "result.json"), measurement.record);
      } catch (error) {
        report.failures.push({ id: spec.id, name: "NATIVE_CASE_FAILED", message: error.message });
        await archiveCaseFailure(directory, spec, error);
      } finally {
        try { await spec.restore?.(); }
        catch (error) { report.failures.push({ id: spec.id, name: "RESTORE_FAILED", message: error.message }); }
        await json(path.join(outputDir, "report.json"), report);
      }
    }
    assert.equal(report.cases.length, prepared.cases.length, "REAL_BENCHMARK_UNMEASURED_CASES");
    report.primary = aggregate(report.cases, "primary"); report.controls = aggregate(report.cases, "control");
    report.environment.loadAfter = os.loadavg(); report.finishedAt = new Date().toISOString();
    report.state = report.failures.length ? "failed" : "measured";
    await json(path.join(outputDir, "report.json"), report);
    return report;
  } catch (error) {
    report.state = "failed"; report.failure = { message: error.message }; await json(path.join(outputDir, "report.json"), report); throw error;
  }
}

if (process.argv[1] && await realpath(process.argv[1]).catch(() => null) === await realpath(fileURLToPath(import.meta.url))) {
  try {
    assert.equal(process.argv.length, 3, "Usage: node scripts/real-world/run.mjs NEW_OUTPUT_DIR");
    const report = await runRealBenchmark({ outputDir: process.argv[2] });
    console.log(JSON.stringify({ state: report.state, outputDir: report.outputDir, primary: report.primary, controls: report.controls, failures: report.failures }, null, 2));
    if (report.state !== "measured") process.exitCode = 1;
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
