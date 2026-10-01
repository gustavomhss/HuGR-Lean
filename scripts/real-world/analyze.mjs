import assert from "node:assert/strict";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkEvidence } from "./evidence.mjs";
import { aggregate } from "./measure.mjs";
import { checkCatalog, verifiedCapture } from "./integrity.mjs";

/** Reinspect immutable native captures after oracle fixes; never rerun or replace native output. */
export async function analyze(outputDir) {
  const report = JSON.parse(await readFile(path.join(outputDir, "report.json"), "utf8"));
  assert.equal(report.schema, "hugr-lean/real-world/1");
  assert.ok(report.planned.length > 0 && report.cases.length === report.planned.length, "INCOMPLETE_NATIVE_CORPUS");
  const catalog = JSON.parse(await readFile(path.join(report.setup.root, "catalog.json"), "utf8"));
  checkCatalog(report.planned, report.cases, catalog.cases);
  const rows = [];
  for (const row of report.cases) {
    const { capture, filtered } = await verifiedCapture(outputDir, row);
    const spec = report.planned.find((entry) => entry.id === row.id);
    const nativeSpec = catalog.cases.find((entry) => entry.id === row.id);
    assert.ok(nativeSpec, `${row.id}: NATIVE_SPEC_MISSING`);
    const result = { status: row.decision, reason: row.reason, inputBytes: row.inputBytes, outputBytes: row.outputBytes,
      ...(row.decision === "reduced" || row.decision === "normalized" ? { replacement: filtered.toString("utf8"), profile: row.profile } : {}) };
    const evidence = checkEvidence({ ...nativeSpec, ...spec }, capture, result);
    rows.push({ ...row, evidence, originalEvidence: row.evidence });
  }
  const verdict = { schema: "hugr-lean/real-world-analysis/1", inspectedAt: new Date().toISOString(), version: report.version,
    captureStartedAt: report.startedAt, captureFinishedAt: report.finishedAt, captureReportState: report.state,
    originalFailures: report.failures, interruptions: report.interruptions ?? [], environment: report.environment,
    versions: report.versions, projects: report.projects, primary: aggregate(rows, "primary"), controls: aggregate(rows, "control"),
    cases: rows, evidenceOK: rows.every((row) => row.evidence.ok), rawArtifactsRehashed: true,
    note: "Oracle-only reanalysis of immutable captured bytes and measured timings; original report/failures remain retained." };
  await writeFile(path.join(outputDir, "analysis.json"), JSON.stringify(verdict, null, 2) + "\n");
  return verdict;
}

if (process.argv[1] && await realpath(process.argv[1]).catch(() => null) === await realpath(fileURLToPath(import.meta.url))) {
  const report = await analyze(path.resolve(process.argv[2]));
  console.log(JSON.stringify({ primary: report.primary, controls: report.controls, evidenceOK: report.evidenceOK,
    cases: report.cases.map(({ id, command, decision, reason, inputBytes, outputBytes, reductionPercent, evidence, core, adapterRawOff }) =>
      ({ id, command, decision, reason, inputBytes, outputBytes, reductionPercent, evidenceOK: evidence.ok, violations: evidence.violations,
        coreP95Ms: core.wallMs.p95, adapterP95Ms: adapterRawOff.wallMs.p95 })) }, null, 2));
  if (!report.evidenceOK) process.exitCode = 1;
}
