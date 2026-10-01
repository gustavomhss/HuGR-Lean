import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { checkEvidence } from "./evidence.mjs";

export const WARMUPS = 20, SAMPLES = 100;
const bytes = (text) => Buffer.byteLength(text, "utf8");
export function stats(values) {
  assert.ok(values.length && values.every((n) => Number.isFinite(n) && n >= 0), "EMPTY_OR_INVALID_MEASUREMENTS");
  const sorted = values.toSorted((a, b) => a - b);
  return { p50: sorted[Math.ceil(sorted.length * 0.5) - 1], p95: sorted[Math.ceil(sorted.length * 0.95) - 1], mean: values.reduce((a, b) => a + b, 0) / values.length };
}
export function observation(capture) {
  assert.equal(typeof capture.output, "string", "UNSUPPORTED_CAPTURE_ENCODING");
  return Object.freeze({ source: "shell", command: capture.command, output: capture.output, presentation: "unknown",
    completeness: capture.complete ? "complete" : "unknown",
    termination: Object.freeze(capture.timedOut ? { kind: "timed_out" } : Number.isSafeInteger(capture.exitCode) && capture.signal === null ? { kind: "exited", code: capture.exitCode } : { kind: "unknown" }) });
}
async function sample(run, verify, asynchronous = false) {
  for (let i = 0; i < WARMUPS; i++) verify(asynchronous ? await run() : run());
  const wall = [], cpu = [];
  for (let i = 0; i < SAMPLES; i++) {
    const before = process.cpuUsage(), start = performance.now();
    const result = asynchronous ? await run() : run();
    wall.push(performance.now() - start);
    const used = process.cpuUsage(before); cpu.push((used.user + used.system) / 1000);
    verify(result);
  }
  return { wallMs: stats(wall), cpuMs: stats(cpu), warmups: WARMUPS, samples: SAMPLES };
}

export async function measureCapture(spec, capture, { filter, createAfterHook }) {
  const obs = observation(capture), result = filter(obs);
  const evidence = checkEvidence(spec, capture, result);
  const expected = "replacement" in result ? result.replacement : capture.output;
  const core = await sample(() => filter(obs), (actual) => assert.deepEqual(actual, result, `${spec.id}: NONDETERMINISTIC_CORE`));
  const hook = createAfterHook({ raw: false });
  const input = { tool: "bash", args: { command: capture.command } };
  const metadata = Object.freeze({ exit: capture.exitCode, truncated: capture.complete ? false : undefined, output: capture.output });
  const beforeInput = structuredClone(input), beforeMetadata = structuredClone(metadata);
  const adapter = await sample(async () => {
    const output = { title: spec.id, output: capture.output, metadata };
    await hook(input, output); return output;
  }, (actual) => {
    assert.equal(actual.output, expected, `${spec.id}: ADAPTER_CORE_DISAGREE`);
    assert.ok(isDeepStrictEqual(input, beforeInput) && isDeepStrictEqual(actual.metadata, beforeMetadata), `${spec.id}: EXECUTION_FACTS_CHANGED`);
    assert.equal(actual.title, spec.id);
  }, true);
  const inputBytes = capture.raw.length, outputBytes = bytes(expected);
  assert.equal(inputBytes, bytes(capture.output), `${spec.id}: CAPTURE_UTF8_ROUNDTRIP`);
  const savedBytes = inputBytes - outputBytes;
  return { result, filtered: expected, record: { id: spec.id, project: spec.project, category: spec.category, command: spec.command, oracle: spec.oracle,
    expectExit: spec.expectExit, observedExit: capture.exitCode, signal: capture.signal, complete: capture.complete, timedOut: capture.timedOut,
    captureMs: capture.durationMs, inputBytes, outputBytes, savedBytes, reductionPercent: inputBytes ? savedBytes / inputBytes * 100 : 0,
    linesBefore: capture.output.split("\n").length, linesAfter: expected.split("\n").length,
    decision: result.status, reason: result.reason, profile: result.profile ?? null, material: savedBytes >= 1024 && savedBytes >= inputBytes * 0.1,
    evidence, core, adapterRawOff: adapter, modifications: spec.modifications ?? [], cache: spec.cache ?? null } };
}

export function aggregate(records, category) {
  const cases = records.filter((row) => row.category === category);
  assert.ok(cases.length, `EMPTY_CATEGORY: ${category}`);
  const inputBytes = cases.reduce((sum, row) => sum + row.inputBytes, 0), outputBytes = cases.reduce((sum, row) => sum + row.outputBytes, 0);
  return { category, cases: cases.length, reduced: cases.filter((row) => row.decision === "reduced" || row.decision === "normalized").length,
    material: cases.filter((row) => row.material).length, evidenceFailures: cases.filter((row) => !row.evidence.ok).length,
    inputBytes, outputBytes, savedBytes: inputBytes - outputBytes, weightedReductionPercent: inputBytes ? (inputBytes - outputBytes) / inputBytes * 100 : 0,
    captureTotalMs: cases.reduce((sum, row) => sum + row.captureMs, 0), maximumCoreP95Ms: Math.max(...cases.map((row) => row.core.wallMs.p95)),
    maximumAdapterP95Ms: Math.max(...cases.map((row) => row.adapterRawOff.wallMs.p95)) };
}
