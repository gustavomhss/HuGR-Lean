import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
const { replay } = await import(new URL("../scripts/real-world/replay.mjs", import.meta.url).href);
const { runRealBenchmark } = await import(new URL("../scripts/real-world/run.mjs", import.meta.url).href);
const { archiveCapture } = await import(new URL("../scripts/real-world/capture.mjs", import.meta.url).href);
const timing = { wallMs: { p50: 1, p95: 2, mean: 1.5 }, cpuMs: { p50: 0, p95: 0, mean: 0 }, warmups: 20, samples: 100 };
const freshTiming = { ...timing, wallMs: { p50: 0.1, p95: 0.2, mean: 0.15 } };

async function fixture(root: string) {
  const nativeRoot = path.join(root, "synthetic-producer"); await mkdir(nativeRoot);
  const cases = [], specs = [];
  for (const category of ["primary", "control"]) {
    const spec = { id: category, project: "synthetic", category, command: "fixture command", oracle: "exact", expectExit: "zero",
      cwd: nativeRoot, allowEmpty: category === "control", ...(category === "primary" ? { marker: "fixture marker" } : {}) };
    const raw = Buffer.from("fixture marker café 🔥\n"), directory = path.join(root, "cases", spec.id);
    const capture = { command: spec.command, cwd: spec.cwd, output: raw.toString(), exitCode: 0, signal: null, complete: true, timedOut: false,
      durationMs: 17, captureDefinition: "synthetic producer bytes; no command execution", raw, stdout: raw, stderr: Buffer.alloc(0) };
    const artifacts = await archiveCapture(directory, capture, capture.output);
    const { allowEmpty, marker, cwd, ...identity } = spec;
    const row = { ...identity, observedExit: 0, signal: null, complete: true, timedOut: false, captureMs: 17,
      inputBytes: raw.length, outputBytes: raw.length, savedBytes: 0, reductionPercent: 0, linesBefore: 2, linesAfter: 2,
      decision: "passthrough", reason: "unknown_command", profile: null, material: false,
      evidence: { ok: false, violations: ["historical oracle finding"], signals: [] }, core: timing, adapterRawOff: timing,
      modifications: [{ path: "producer.txt", change: "synthetic fixture history" }], cache: "cold", artifacts };
    const { raw: ignoredRaw, stdout, stderr, ...facts } = capture;
    await writeFile(path.join(directory, "capture.json"), JSON.stringify({ ...facts, artifacts }));
    await writeFile(path.join(directory, "result.json"), JSON.stringify(row));
    cases.push(row); specs.push(spec);
  }
  const report = { schema: "hugr-lean/real-world/1", version: "0.2.0", state: "failed", setup: { root: nativeRoot },
    startedAt: "historical-start", finishedAt: "historical-end", cases, planned: cases.map(({ artifacts, ...row }) => row),
    environment: { node: "archived Node", v8: "archived V8", platform: "archived platform", arch: "archived arch", release: "archived OS",
      cpu: "archived CPU", logicalCpus: -1, memoryBytes: -1, loadBefore: [-1, -1, -1], loadAfter: [-2, -2, -2], archivedExtra: "capture only" } };
  await writeFile(path.join(nativeRoot, "catalog.json"), JSON.stringify({ cases: specs }));
  await writeFile(path.join(root, "report.json"), JSON.stringify(report));
  return { report, specs };
}

function plumbing(rows: Record<string, any>[], change = (_record: Record<string, any>) => {}) {
  const calls = { compile: 0, measure: 0 };
  const app = Object.freeze({ mockTimingPlumbing: true });
  return { calls, compile: async () => { calls.compile++; return app; },
    measure: async (spec: Record<string, any>, capture: Record<string, any>, actualApp: unknown) => {
      calls.measure++; assert.equal(actualApp, app); assert.equal(capture.cwd, spec.cwd);
      assert.deepEqual(capture.raw, Buffer.from(capture.output));
      const { artifacts, ...record } = structuredClone(rows.find((row) => row.id === spec.id)!);
      record.core = freshTiming; record.adapterRawOff = freshTiming;
      record.evidence = { ok: true, violations: [], signals: ["calibrated fixture evidence"] };
      change(record);
      return { filtered: capture.output, record };
    } };
}

async function snapshot(root: string, nativeRoot: string) {
  const files = ["report.json", path.relative(root, path.join(nativeRoot, "catalog.json"))];
  for (const id of ["primary", "control"]) for (const file of ["capture.json", "result.json", "original.txt.gz", "filtered.txt.gz", "stdout.txt.gz", "stderr.txt.gz"]) {
    files.push(path.join("cases", id, file));
  }
  return Promise.all(files.map(async (file) => [file, await readFile(path.join(root, file))]));
}

test("replay attributes fresh environment; retains capture history, policy and input bytes", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lean-replay-environment-"));
  try {
    const { report, specs } = await fixture(root), before = await snapshot(root, report.setup.root);
    let loadReads = 0;
    t.mock.method(os, "loadavg", () => ++loadReads === 1 ? [1, 2, 3] : [4, 5, 6]);
    const deps = plumbing(report.cases), result = await replay(root, deps);
    assert.deepEqual(deps.calls, { compile: 1, measure: 2 });
    assert.deepEqual(result.captureEnvironment, report.environment);
    assert.equal(result.environment.node, process.version); assert.equal(result.environment.v8, process.versions.v8);
    assert.equal(result.environment.platform, process.platform); assert.equal(result.environment.arch, process.arch);
    assert.deepEqual(result.environment.os, { type: os.type(), release: os.release(), version: os.version() });
    assert.equal(result.environment.cpu, os.cpus()[0]!.model); assert.equal(result.environment.logicalCpus, os.cpus().length);
    assert.equal(result.environment.memoryBytes, os.totalmem()); assert.equal(result.environment.isolatedCPU, false);
    assert.deepEqual(result.environment.loadBefore, [1, 2, 3]); assert.deepEqual(result.environment.loadAfter, [4, 5, 6]);
    assert.equal(loadReads, 2); assert.equal(Object.hasOwn(result.environment, "archivedExtra"), false);
    for (const previous of report.cases) {
      const row = result.cases.find((entry: Record<string, any>) => entry.id === previous.id), spec = specs.find((entry) => entry.id === previous.id)!;
      for (const [key, value] of Object.entries(previous)) {
        if (!["core", "adapterRawOff", "evidence"].includes(key)) assert.deepEqual(row[key], value, key);
      }
      assert.equal(row.allowEmpty, spec.allowEmpty); assert.equal(row.marker, spec.marker);
      assert.deepEqual(row.originalTimings, { core: previous.core, adapterRawOff: previous.adapterRawOff });
      assert.deepEqual(row.originalEvidence, previous.evidence); assert.deepEqual(row.core, freshTiming);
      assert.equal(row.evidence.ok, true);
    }
    assert.deepEqual(await snapshot(root, report.setup.root), before);
    assert.deepEqual(JSON.parse(await readFile(path.join(root, "replay.json"), "utf8")), result);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("replay rejects every non-timing field drift, added fields and omitted fields", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lean-replay-identity-"));
  try {
    const { report } = await fixture(root);
    const changes: Record<string, unknown> = { id: "other", project: "other", category: "control", command: "other", oracle: "node", expectExit: "nonzero",
      observedExit: 1, signal: "SIGTERM", complete: false, timedOut: true, captureMs: 18, inputBytes: 999, outputBytes: 999, savedBytes: 999,
      reductionPercent: 99, linesBefore: 9, linesAfter: 9, decision: "failed_open", reason: "forged", profile: "forged", material: true,
      modifications: [], cache: "warm", artifacts: {}, allowEmpty: true, marker: "forged", unexpectedFact: "forged" };
    const file = path.join(root, "replay.json"); await writeFile(file, "prior replay retained\n");
    for (const [key, value] of Object.entries(changes)) {
      await t.test(key, async () => {
        const deps = plumbing(report.cases, (record) => { if (record.category === "primary") record[key] = value; });
        await assert.rejects(replay(root, deps), /RETIMING_CHANGED_NON_TIMING_RECORD/);
        assert.equal(await readFile(file, "utf8"), "prior replay retained\n");
      });
    }
    await t.test("omitted cache", async () => {
      await assert.rejects(replay(root, plumbing(report.cases, (record) => { delete record.cache; })), /RETIMING_CHANGED_NON_TIMING_RECORD/);
    });
    for (const scope of ["core", "adapterRawOff"]) for (const key of ["warmups", "samples", "extraTimingFact"]) {
      await t.test(`${scope}.${key}`, async () => {
        const deps = plumbing(report.cases, (record) => { record[scope] = { ...record[scope], [key]: 999 }; });
        await assert.rejects(replay(root, deps), /RETIMING_CHANGED_NON_TIMING_RECORD/);
      });
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("replay verifies every persisted row before compiling or measuring any case", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lean-replay-preflight-"));
  try {
    const { report } = await fixture(root), deps = plumbing(report.cases);
    await t.test("schema", async () => {
      await writeFile(path.join(root, "report.json"), JSON.stringify({ ...report, schema: "forged schema" }));
      await assert.rejects(replay(root, deps), /INVALID_REPLAY_SCHEMA/);
      assert.deepEqual(deps.calls, { compile: 0, measure: 0 });
    });
    const changed = { ...report, cases: [report.cases[0], { ...report.cases[1], reason: "report-only forgery" }] };
    await writeFile(path.join(root, "report.json"), JSON.stringify(changed));
    await assert.rejects(replay(root, deps), /PERSISTED_RESULT_MISMATCH/);
    assert.deepEqual(deps.calls, { compile: 0, measure: 0 });
    await assert.rejects(readFile(path.join(root, "replay.json")), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("replay fails by name when current CPU metadata is unavailable", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lean-replay-cpu-"));
  try {
    const { report } = await fixture(root), deps = plumbing(report.cases);
    t.mock.method(os, "cpus", () => []);
    await assert.rejects(replay(root, deps), /REPLAY_CPU_INFO_UNAVAILABLE/);
    assert.deepEqual(deps.calls, { compile: 1, measure: 0 });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("replay rejects changed filtered bytes with mocked timing plumbing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lean-replay-filtered-"));
  try {
    const { report } = await fixture(root), deps = plumbing(report.cases);
    await assert.rejects(replay(root, { ...deps, measure: async (...args: Parameters<typeof deps.measure>) => {
      const result = await deps.measure(...args), filtered = result.filtered.replace("fixture", "forged!");
      assert.equal(Buffer.byteLength(filtered), Buffer.byteLength(result.filtered));
      return { ...result, filtered };
    } }), /RETIMING_CHANGED_FILTERED_BYTES/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("future runner persists explicit native marker and allowEmpty policy", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lean-run-policy-"));
  try {
    const source = path.join(root, "source"); await mkdir(source);
    const { report: fixtureReport, specs } = await fixture(source), outputDir = path.join(root, "new-run");
    const deps = plumbing(fixtureReport.cases);
    const report = await runRealBenchmark({ outputDir }, { ...deps,
      provisionProjects: async () => ({ cases: specs, projects: [], versions: {}, env: {} }),
      takeCapture: async (spec: Record<string, any>) => {
        const capture = JSON.parse(await readFile(path.join(source, "cases", spec.id, "capture.json"), "utf8"));
        const raw = Buffer.from(capture.output); return { ...capture, raw, stdout: raw, stderr: Buffer.alloc(0) };
      } });
    assert.equal(report.state, "measured"); assert.deepEqual(deps.calls, { compile: 1, measure: 2 });
    for (const spec of specs) {
      const planned = report.planned.find((row: Record<string, any>) => row.id === spec.id), row = report.cases.find((entry: Record<string, any>) => entry.id === spec.id);
      assert.equal(planned.allowEmpty, spec.allowEmpty); assert.equal(row.allowEmpty, spec.allowEmpty);
      assert.equal(planned.marker, spec.marker); assert.equal(row.marker, spec.marker);
      assert.deepEqual(JSON.parse(await readFile(path.join(outputDir, "cases", spec.id, "result.json"), "utf8")), row);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
