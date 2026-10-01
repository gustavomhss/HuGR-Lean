import assert from "node:assert/strict";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { compiled } from "../benchmark.mjs";
import { measureCapture, aggregate } from "./measure.mjs";
import { checkCatalog, nativePolicy, verifiedCapture } from "./integrity.mjs";

const timingFacts = ({ wallMs, cpuMs, ...facts }) => facts;
const nonTiming = ({ core, adapterRawOff, evidence, ...facts }) => ({ ...facts,
  core: timingFacts(core), adapterRawOff: timingFacts(adapterRawOff) });

/** Retiming actual immutable native captures; does not execute any project command again. */
export async function replay(outputDir, { compile = compiled, measure = measureCapture } = {}) {
  const original = JSON.parse(await readFile(path.join(outputDir, "report.json"), "utf8"));
  assert.equal(original.schema, "hugr-lean/real-world/1", "INVALID_REPLAY_SCHEMA");
  const catalog = JSON.parse(await readFile(path.join(original.setup.root, "catalog.json"), "utf8"));
  assert.ok(original.cases.length === original.planned.length && original.cases.length > 0, "INCOMPLETE_REPLAY_CORPUS");
  checkCatalog(original.planned, original.cases, catalog.cases);
  const captures = await Promise.all(original.cases.map((row) => verifiedCapture(outputDir, row)));
  const app = await compile(), cases = [], cpus = os.cpus();
  assert.ok(cpus.length, "REPLAY_CPU_INFO_UNAVAILABLE");
  const environment = { node: process.version, v8: process.versions.v8, platform: process.platform, arch: process.arch,
    os: { type: os.type(), release: os.release(), version: os.version() }, cpu: cpus[0].model,
    logicalCpus: cpus.length, memoryBytes: os.totalmem(), loadBefore: os.loadavg(), isolatedCPU: false };
  for (const [index, previous] of original.cases.entries()) {
    const { capture, filtered } = captures[index];
    const spec = catalog.cases.find((entry) => entry.id === previous.id);
    assert.ok(spec, `UNKNOWN_NATIVE_CASE: ${previous.id}`);
    const measured = await measure(spec, capture, app);
    assert.deepEqual(Buffer.from(measured.filtered, "utf8"), filtered, `${previous.id}: RETIMING_CHANGED_FILTERED_BYTES`);
    const record = { ...nativePolicy(spec), artifacts: previous.artifacts, ...measured.record };
    assert.deepEqual(nonTiming(record), nonTiming({ ...nativePolicy(spec), ...previous }), `${previous.id}: RETIMING_CHANGED_NON_TIMING_RECORD`);
    cases.push({ ...record, originalEvidence: previous.evidence, originalTimings: { core: previous.core, adapterRawOff: previous.adapterRawOff } });
  }
  environment.loadAfter = os.loadavg();
  const report = { schema: "hugr-lean/real-world-replay/1", recordedAt: new Date().toISOString(),
    method: "Native captures unchanged. Fresh result construction plus awaited hook; immutable existing host metadata reused. Current timing environment separate from capture environment. No large metadata cloning inside timer. Assertions/disk outside timers. 20 warmups/100 samples.",
    environment, captureEnvironment: original.environment, primary: aggregate(cases, "primary"), controls: aggregate(cases, "control"), cases };
  await writeFile(path.join(outputDir, "replay.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

if (process.argv[1] && await realpath(process.argv[1]).catch(() => null) === await realpath(fileURLToPath(import.meta.url))) {
  const report = await replay(path.resolve(process.argv[2]));
  console.log(JSON.stringify({ primary: report.primary, controls: report.controls, cases: report.cases.map(({ id, core, adapterRawOff, evidence }) =>
    ({ id, coreP95Ms: core.wallMs.p95, adapterP95Ms: adapterRawOff.wallMs.p95, evidenceOK: evidence.ok })) }, null, 2));
  if (!report.cases.every((row) => row.evidence.ok)) process.exitCode = 1;
}
