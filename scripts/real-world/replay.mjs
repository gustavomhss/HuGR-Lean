import assert from "node:assert/strict";
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { compiled } from "../benchmark.mjs";
import { measureCapture, aggregate } from "./measure.mjs";
import { checkCatalog, verifiedCapture } from "./integrity.mjs";

/** Retiming actual immutable native captures; does not execute any project command again. */
export async function replay(outputDir) {
  const original = JSON.parse(await readFile(path.join(outputDir, "report.json"), "utf8"));
  const catalog = JSON.parse(await readFile(path.join(original.setup.root, "catalog.json"), "utf8"));
  assert.ok(original.cases.length === original.planned.length && original.cases.length > 0, "INCOMPLETE_REPLAY_CORPUS");
  checkCatalog(original.planned, original.cases, catalog.cases);
  const app = await compiled(), cases = [];
  const loadBefore = os.loadavg();
  for (const previous of original.cases) {
    const { capture, filtered } = await verifiedCapture(outputDir, previous);
    const spec = catalog.cases.find((entry) => entry.id === previous.id);
    assert.ok(spec, `UNKNOWN_NATIVE_CASE: ${previous.id}`);
    const measured = await measureCapture(spec, capture, app);
    assert.deepEqual(Buffer.from(measured.filtered, "utf8"), filtered, `${previous.id}: RETIMING_CHANGED_FILTERED_BYTES`);
    for (const key of ["decision", "reason", "profile", "inputBytes", "outputBytes", "savedBytes", "captureMs", "observedExit", "signal", "complete", "timedOut"]) {
      assert.equal(measured.record[key], previous[key], `${previous.id}: RETIMING_CHANGED_${key}`);
    }
    cases.push({ ...measured.record, originalTimings: { core: previous.core, adapterRawOff: previous.adapterRawOff } });
  }
  const report = { schema: "hugr-lean/real-world-replay/1", recordedAt: new Date().toISOString(),
    method: "Native captures unchanged. Fresh result construction plus awaited hook; immutable existing host metadata reused. No large metadata cloning inside timer. Assertions/disk outside timers. 20 warmups/100 samples.",
    environment: { ...original.environment, loadBefore, loadAfter: os.loadavg(), isolatedCPU: false }, primary: aggregate(cases, "primary"), controls: aggregate(cases, "control"), cases };
  await writeFile(path.join(outputDir, "replay.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

if (process.argv[1] && await realpath(process.argv[1]).catch(() => null) === await realpath(fileURLToPath(import.meta.url))) {
  const report = await replay(path.resolve(process.argv[2]));
  console.log(JSON.stringify({ primary: report.primary, controls: report.controls, cases: report.cases.map(({ id, core, adapterRawOff, evidence }) =>
    ({ id, coreP95Ms: core.wallMs.p95, adapterP95Ms: adapterRawOff.wallMs.p95, evidenceOK: evidence.ok })) }, null, 2));
  if (!report.cases.every((row) => row.evidence.ok)) process.exitCode = 1;
}
