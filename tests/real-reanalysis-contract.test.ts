import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
const { analyze } = await import(new URL("../scripts/real-world/analyze.mjs", import.meta.url).href);
const { verifiedCapture } = await import(new URL("../scripts/real-world/integrity.mjs", import.meta.url).href);
const { archiveCapture } = await import(new URL("../scripts/real-world/capture.mjs", import.meta.url).href);

async function fixture(root: string, { empty = false, allowEmpty = false } = {}) {
  const setupRoot = path.join(root, "native-projects"); await mkdir(setupRoot);
  const timing = { wallMs: { p50: 1, p95: 2, mean: 1.5 }, cpuMs: { p50: 0, p95: 0, mean: 0 }, warmups: 20, samples: 100 };
  const planned = [], cases = [], native = [];
  for (const category of ["primary", "control"]) {
    const spec = { id: category, category, project: "synthetic", command: "unrecognized tool", oracle: "exact", expectExit: "zero" };
    const raw = Buffer.from(empty ? "" : "native café 🔥\n"), directory = path.join(root, "cases", spec.id);
    const capture = { command: spec.command, cwd: setupRoot, output: raw.toString(), exitCode: 0, signal: null, complete: true, timedOut: false, durationMs: 17 };
    const artifacts = await archiveCapture(directory, { ...capture, raw, stdout: raw, stderr: Buffer.alloc(0) }, capture.output);
    const row = { ...spec, artifacts, observedExit: 0, signal: null, complete: true, timedOut: false, captureMs: 17,
      inputBytes: raw.length, outputBytes: raw.length, savedBytes: 0, reductionPercent: 0, material: false,
      linesBefore: capture.output.split("\n").length, linesAfter: capture.output.split("\n").length,
      decision: "passthrough", reason: "unknown_command", profile: null, evidence: { ok: true, violations: [], signals: [] },
      core: timing, adapterRawOff: timing, modifications: [], cache: null };
    await writeFile(path.join(directory, "capture.json"), JSON.stringify({ ...capture, artifacts }));
    await writeFile(path.join(directory, "result.json"), JSON.stringify(row));
    planned.push(spec); cases.push(row); native.push({ ...spec, allowEmpty });
  }
  const report = { schema: "hugr-lean/real-world/1", version: "0.2.0", state: "measured", setup: { root: setupRoot },
    planned, cases, failures: [], startedAt: "historical-start", finishedAt: "historical-end", environment: { node: "archived-node" } };
  await writeFile(path.join(setupRoot, "catalog.json"), JSON.stringify({ cases: native }));
  await writeFile(path.join(root, "report.json"), JSON.stringify(report));
  return { report, native };
}

test("analysis inherits native empty policy and rejects planned/measured overrides", async () => {
  for (const allowEmpty of [false, true]) {
    const root = await mkdtemp(path.join(tmpdir(), "lean-analysis-policy-"));
    try {
      const { report } = await fixture(root, { empty: true, allowEmpty });
      const clean = await analyze(root);
      assert.equal(clean.evidenceOK, allowEmpty);
      if (!allowEmpty) assert.match(clean.cases[0].evidence.violations.join("\n"), /empty_capture/);
      for (const list of [report.planned, report.cases]) {
        Object.assign(list[0]!, { allowEmpty: !allowEmpty });
        await writeFile(path.join(root, "report.json"), JSON.stringify(report));
        await assert.rejects(analyze(root), /NATIVE_POLICY_MISMATCH: allowEmpty/);
        Reflect.deleteProperty(list[0]!, "allowEmpty");
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("analysis binds every report field to persisted results before writing verdict", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-analysis-result-"));
  try {
    const { report } = await fixture(root), row = report.cases[0]!;
    assert.equal((await analyze(root)).evidenceOK, true);
    const published = await readFile(path.join(root, "analysis.json"));
    for (const change of [{ reason: "forged reason" }, { profile: "forged profile" }, { decision: "failed_open" }, { savedBytes: 123 },
      { reductionPercent: 10 }, { material: true }, { linesBefore: 999 }, { evidence: { ok: false, violations: ["forged"], signals: [] } }]) {
      await t.test(Object.keys(change)[0]!, async () => {
        const changed = { ...report, cases: [{ ...row, ...change }, ...report.cases.slice(1)] };
        await writeFile(path.join(root, "report.json"), JSON.stringify(changed));
        await assert.rejects(analyze(root), /PERSISTED_RESULT_MISMATCH/);
        assert.deepEqual(await readFile(path.join(root, "analysis.json")), published);
      });
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("persisted metrics must satisfy decoded bytes, savings, percent, material and lines", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-analysis-equations-"));
  try {
    const { report } = await fixture(root), row = report.cases[0]!, file = path.join(root, "cases", row.id, "result.json");
    await verifiedCapture(root, row);
    for (const key of ["inputBytes", "outputBytes", "savedBytes", "reductionPercent", "material", "linesBefore", "linesAfter"] as const) {
      await t.test(key, async () => {
        const forged = { ...row, [key]: key === "material" ? true : 999 };
        await writeFile(file, JSON.stringify(forged));
        await assert.rejects(verifiedCapture(root, forged), new RegExp(`DERIVED_METRIC_MISMATCH: ${key}`));
      });
    }
    await writeFile(file, JSON.stringify(row));
    await verifiedCapture(root, row);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("material requires both 1024 saved bytes and ten percent, including boundaries", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lean-material-boundaries-"));
  try {
    const { report } = await fixture(root), base = report.cases[0]!, directory = path.join(root, "cases", base.id);
    for (const [inputBytes, savedBytes, material] of [[10230, 1023, false], [20480, 1024, false], [10240, 1024, true], [20480, 2048, true], [3072, 1024, true]] as const) {
      const raw = Buffer.alloc(inputBytes, 0x78), filtered = raw.subarray(0, inputBytes - savedBytes);
      const capture = { output: raw.toString(), command: base.command, exitCode: 0, signal: null, complete: true, timedOut: false, durationMs: 17 };
      const artifacts = await archiveCapture(directory, { ...capture, raw, stdout: raw, stderr: Buffer.alloc(0) }, filtered.toString());
      const row = { ...base, artifacts, decision: "reduced", profile: "synthetic", inputBytes, outputBytes: inputBytes - savedBytes,
        savedBytes, material, reductionPercent: savedBytes / inputBytes * 100, linesBefore: 1, linesAfter: 1 };
      await writeFile(path.join(directory, "capture.json"), JSON.stringify(capture));
      await writeFile(path.join(directory, "result.json"), JSON.stringify(row));
      await verifiedCapture(root, row);
      const forged = { ...row, material: !material };
      await writeFile(path.join(directory, "result.json"), JSON.stringify(forged));
      await assert.rejects(verifiedCapture(root, forged), /DERIVED_METRIC_MISMATCH: material/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
