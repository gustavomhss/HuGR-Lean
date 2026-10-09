#!/usr/bin/env node
/** Compiled default-engine and raw-off after-hook measurements, never a model-cost estimate. */
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readUtilityCorpus } from "./utility-corpus.mjs";
import { readNativeCorpus, assertCorpusCoverage } from "./native-corpus.mjs";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const WARMUPS = 20;
export const SAMPLES = 100;
const bytes = (text) => Buffer.byteLength(text, "utf8");
// Fixture metadata, not a copy of the registry. Registry/corpus coverage is checked in both directions.
const FIXTURES = [
  ["runners/cargo_test_success.txt", "cargo-test", "cargo test --color never", "reduced", "native capture"],
  ["runners/cargo_build_success.txt", "cargo-build", "cargo build --color never", "reduced", "native capture"],
  ["runners/pytest_success.txt", "pytest", "python3 -m pytest --color=no", "reduced", "native capture"],
  ["runners/go_test_success.txt", "go-test-verbose", "go test -v", "reduced", "native capture"],
  ["runners/build_cargo_errors.txt", "cargo-build", "cargo build", "passthrough", "pinned TRS fixture"],
  ["runners/cargo_test_real_failures.txt", "cargo-test", "cargo test", "passthrough", "pinned TRS fixture"],
  ["runners/pytest_real_default.txt", "pytest", "pytest", "passthrough", "pinned TRS fixture"],
  ["formats/jest_all_passed.txt", "jest", "jest --verbose", "passthrough", "pinned TRS fixture", true],
  ["formats/jest_native.txt", "jest", "jest --runInBand --verbose --no-color", "passthrough", "native capture", true],
  ["formats/vitest_all_passed.txt", "vitest", "vitest run", "passthrough", "pinned TRS fixture", true],
  ["formats/vitest_native.txt", "vitest", "vitest run vitest-native.test.js --globals --no-color", "passthrough", "native capture", true],
  ["formats/git_status_mixed.txt", "git-status", "git status", "reduced", "pinned TRS fixture"],
  ["formats/grep_single_file_multiple_matches.txt", "rg", "rg -n --with-filename --regexp '' src", "reduced", "pinned TRS fixture"],
  ["formats/lint_tsc_errors.txt", "tsc", "tsc --pretty false", "passthrough", "pinned TRS fixture"],
];

export const observation = (output, command, patch = {}) => ({
  source: "shell", command, output, termination: { kind: "exited", code: 0 },
  completeness: "complete", presentation: "unknown", ...patch,
});

export async function readCorpus(root = ROOT) {
  const declared = FIXTURES.map(([file]) => file);
  assert.equal(new Set(declared).size, declared.length, "Duplicate fixture declaration");
  const found = [];
  for (const directory of ["runners", "formats"]) {
    const files = await readdir(path.join(root, "fixtures", directory));
    for (const file of files) if (file.endsWith(".txt")) found.push(`${directory}/${file}`);
  }
  assert.ok(found.length, "Fixture corpus is empty");
  assert.deepEqual(found.sort(), declared.toSorted(), "Fixture corpus/declarations differ (missing or unmeasured fixture)");
  const goldens = JSON.parse(await readFile(path.join(root, "fixtures/installed-goldens.json"), "utf8"));
  assert.equal(goldens.schema, "hugr-lean/installed-goldens/1", "Invalid installed golden schema");
  assert.ok(goldens.outputs && typeof goldens.outputs === "object" && !Array.isArray(goldens.outputs), "Missing installed golden outputs");
  assert.deepEqual(Object.keys(goldens.outputs).sort(), FIXTURES.filter((entry) => entry[3] === "reduced" || entry[5] === true).map(([file]) => file).sort(),
    "Installed golden/fixture coverage differs (missing or stale expected output)");
  const cases = [];
  for (const [file, family, command, status, provenance, exactGolden] of FIXTURES) {
    const output = await readFile(path.join(root, "fixtures", file), "utf8");
    assert.ok(output.length, `Empty fixture: ${file}`);
    let expected = status === "reduced" || exactGolden ? goldens.outputs[file] : output;
    assert.ok(typeof expected === "string" && expected.length, `Empty or invalid installed golden: ${file}`);
    if (status === "passthrough") assert.equal(expected, output, `${file}: passthrough installed golden changed original`);
    // Runner checkouts may use CRLF; their golden content stays fixed, with source line endings preserved.
    if (status === "reduced" && file.startsWith("runners/") && output.includes("\r\n") && !/(?<!\r)\n/.test(output)) expected = expected.replaceAll("\n", "\r\n");
    cases.push({ name: file, family, status, provenance, expected, observation: observation(output, command) });
  }
  const utility = await readUtilityCorpus(path.join(root, "fixtures", "utility"));
  assert.deepEqual(utility.families.map((entry) => entry.family).sort(), ["cargo", "go", "node", "pytest"], "Native family coverage differs");
  assert.equal(utility.cases.length, 25, "Independent native corpus contract changed");
  for (const entry of utility.cases) {
    cases.push({ name: `utility/${entry.qualifiedID}`, family: entry.profile, status: entry.expectedStatus,
      provenance: "new native fixture", expected: entry.expectedText, observation: entry.observation, required: entry.required });
  }
  const native = await readNativeCorpus(path.join(root, "fixtures", "profiles"));
  cases.push(...native);
  assert.equal(new Set(cases.map((entry) => entry.name)).size, cases.length, "Duplicate fixture case names");
  return Object.assign(cases, { exactFamilies: native.exactFamilies });
}

export function assertCoverage(profiles, cases) {
  return assertCorpusCoverage(profiles, cases);
}

export async function compiled(root = ROOT) {
  const modules = {};
  for (const name of ["core", "profiles", "opencode"]) {
    const file = path.join(root, "dist", name, "index.js");
    try { await access(file); modules[name] = await import(pathToFileURL(file).href); }
    catch (error) { throw new Error(`Missing or invalid compiled build: ${file}; run npm run build`, { cause: error }); }
  }
  assert.equal(typeof modules.core.filter, "function", "Compiled core filter is missing");
  assert.equal(typeof modules.opencode.createAfterHook, "function", "Compiled createAfterHook is missing");
  return { filter: modules.core.filter, profiles: modules.profiles.profiles, createAfterHook: modules.opencode.createAfterHook };
}

/** One allocation pass for uniquely named cases; exact target UTF-8 bytes, consistent native counts. */
export function cargoWorkload(targetBytes) {
  assert.ok(Number.isSafeInteger(targetBytes) && targetBytes >= 1024, "Cargo workload size must be at least 1024 bytes");
  const header = "    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.01s\n" +
    "     Running unittests src/lib.rs (target/debug/deps/benchmark-0000000000000000)\n";
  const summary = (n) => `test result: ok. ${n} passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s`;
  const frame = (n) => `${header}\nrunning ${n} tests\n\n${summary(n)}\n`;
  const row = (n) => `test bench::café_${String(n).padStart(8, "0")} ... ok\n`;
  const rowBytes = bytes(row(0));
  let n = Math.floor((targetBytes - bytes(frame(1))) / rowBytes);
  while (n > 0 && bytes(frame(n)) + n * rowBytes > targetBytes) n--;
  while (bytes(frame(n + 1)) + (n + 1) * rowBytes <= targetBytes) n++;
  assert.ok(n > 1 && n < 100_000_000, "Cargo workload is empty or exceeds fixed-width names");
  const body = Array.from({ length: n }, (_, i) => row(i)).join("");
  const text = `${header}\nrunning ${n} tests\n${body}\n${summary(n)}\n`;
  const output = text + "\n".repeat(targetBytes - bytes(text));
  assert.equal(bytes(output), targetBytes, "Cargo workload byte size differs");
  return { name: `synthetic-cargo-${targetBytes}`, family: "cargo-test", status: "reduced", provenance: "synthetic workload",
    testCases: n, nativeSummary: summary(n), expected: `${header}${summary(n)}\n`, observation: observation(output, "cargo test") };
}

export function preservationCases(cargo) {
  const base = { family: "cargo-test", status: "passthrough", provenance: "synthetic preservation control" };
  return [
    ["nonzero-exit", { termination: { kind: "exited", code: 101 } }],
    ["unknown-exit", { termination: { kind: "unknown" } }],
    ["timed-out", { termination: { kind: "timed_out" } }],
    ["truncated", { completeness: "truncated" }],
    ["unknown-completeness", { completeness: "unknown" }],
    ["unknown-command", { command: "echo cargo test" }],
    ["unknown-output", { output: "unknown log café 🔥\r\nnot a Cargo grammar\n" }],
  ].map(([name, patch]) => ({ ...base, name, observation: { ...cargo.observation, ...patch } }));
}

export function checkResult(entry, result) {
  assert.equal(result.status, entry.status, `${entry.name}: expected ${entry.status}, got ${result.status}/${result.reason}`);
  const input = entry.observation.output;
  assert.equal(result.inputBytes, bytes(input), `${entry.name}: wrong UTF-8 input bytes`);
  if (entry.status === "reduced") {
    assert.equal(result.profile, entry.family, `${entry.name}: default profile differs`);
    assert.equal(typeof result.replacement, "string");
    assert.equal(result.outputBytes, bytes(result.replacement), `${entry.name}: wrong UTF-8 output bytes`);
    assert.ok(result.outputBytes > 0 && result.outputBytes < result.inputBytes, `${entry.name}: workload did not reduce`);
    if (entry.expected !== undefined) assert.equal(result.replacement, entry.expected, `${entry.name}: independent golden/evidence differs`);
  } else {
    assert.equal(Object.hasOwn(result, "replacement"), false, `${entry.name}: passthrough supplied a replacement`);
    assert.equal(result.outputBytes, result.inputBytes, `${entry.name}: passthrough bytes changed`);
  }
  return result.replacement ?? input;
}

const percentile = (sorted, percent) => sorted[Math.max(0, Math.ceil(sorted.length * percent) - 1)];
const median = (sorted) => (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
function stats(values) {
  assert.ok(values.length && values.every((value) => Number.isFinite(value) && value >= 0), "Empty or invalid measurements");
  const sorted = values.toSorted((a, b) => a - b);
  return { p50: percentile(sorted, 0.50), p95: percentile(sorted, 0.95), mean: values.reduce((sum, value) => sum + value, 0) / values.length };
}
function distribution(values) {
  const sorted = values.toSorted((a, b) => a - b);
  assert.ok(sorted.length && sorted.every(value => Number.isFinite(value) && value >= 0 && value <= 100), "Empty or invalid reduction distribution");
  return { min: sorted[0], median: median(sorted), max: sorted.at(-1), mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length };
}
export function savingsPercent(inputBytes, outputBytes) {
  assert.ok(Number.isSafeInteger(inputBytes) && inputBytes >= 0 && Number.isSafeInteger(outputBytes) &&
    outputBytes >= 0 && outputBytes <= inputBytes, "Invalid savings byte counts");
  return inputBytes === 0 ? 0 : (1 - outputBytes / inputBytes) * 100;
}

async function measure(run, verify, asynchronous = false) {
  for (let i = 0; i < WARMUPS; i++) verify(asynchronous ? await run() : run());
  const wall = [], cpu = [];
  for (let i = 0; i < SAMPLES; i++) {
    const before = process.cpuUsage();
    const start = performance.now();
    const result = asynchronous ? await run() : run();
    wall.push(performance.now() - start);
    const usage = process.cpuUsage(before);
    cpu.push((usage.user + usage.system) / 1000);
    verify(result); // Assertions and byte accounting are outside timed work.
  }
  return { wallMs: stats(wall), processCpuMs: stats(cpu) };
}

export async function runBenchmark({ root = ROOT } = {}) {
  const { filter, profiles, createAfterHook } = await compiled(root);
  const fixtures = await readCorpus(root);
  const fixtureNames = new Set(fixtures.map((entry) => entry.name));
  const profileIds = assertCoverage(profiles, fixtures);
  const workloads = [256 * 1024, 1024 * 1024].map(cargoWorkload);
  const cases = [...fixtures, ...preservationCases(workloads[0]), ...workloads];
  assert.ok(cases.length && workloads.length, "Workload corpus is empty");
  assert.equal(new Set(cases.map((entry) => entry.name)).size, cases.length, "Duplicate benchmark case names");
  const hook = createAfterHook({ raw: false }); // Actual compiled adapter; no injected engine or raw store.
  const rows = [];
  for (const entry of cases) {
    const obs = Object.freeze({ ...entry.observation, termination: Object.freeze({ ...entry.observation.termination }) });
    const baseline = filter(obs); // Default options: an absent default reducer cannot be replaced by a benchmark stub.
    const expected = checkResult(entry, baseline);
    const core = await measure(() => filter(obs), (result) => {
      assert.equal(checkResult(entry, result), expected, `${entry.name}: nondeterministic core result`);
    });
    const input = Object.freeze({ tool: "bash", args: Object.freeze({ command: obs.command }) });
    const metadata = Object.freeze({ exit: obs.termination.kind === "exited" ? obs.termination.code : null,
      truncated: obs.completeness === "complete" ? false : obs.completeness === "truncated" ? true : undefined, output: obs.output });
    const adapter = await measure(async () => {
      const output = { title: "Benchmark", output: obs.output, metadata };
      await hook(input, output);
      return output;
    }, (output) => {
      assert.equal(output.output, expected, `${entry.name}: adapter output differs from default core`);
      assert.equal(output.metadata, metadata, `${entry.name}: adapter changed metadata`);
      assert.equal(output.title, "Benchmark", `${entry.name}: adapter changed title`);
    }, true);
    rows.push({ name: entry.name, family: entry.family, provenance: entry.provenance, command: obs.command,
      ...(entry.scope ? { scope: entry.scope } : {}),
      status: baseline.status, reason: baseline.reason, inputBytes: baseline.inputBytes, outputBytes: baseline.outputBytes,
      savedBytes: baseline.inputBytes - baseline.outputBytes, reductionPercent: savingsPercent(baseline.inputBytes, baseline.outputBytes),
      passthroughExact: entry.status === "passthrough" ? expected === obs.output : null,
      ...(entry.testCases ? { testCases: entry.testCases, nativeSummary: entry.nativeSummary } : {}), core, adapterRawOff: adapter });
  }
  const familyFixtures = profileIds.map((id) => {
    const entries = rows.filter((row) => row.family === id && fixtureNames.has(row.name));
    return { id, fixtureCount: entries.length, reducedCount: entries.filter((row) => row.status === "reduced").length,
      passthroughCount: entries.filter((row) => row.status === "passthrough").length,
      inputBytes: entries.reduce((sum, row) => sum + row.inputBytes, 0), outputBytes: entries.reduce((sum, row) => sum + row.outputBytes, 0),
      reductionPercent: distribution(entries.map((row) => row.reductionPercent)) };
  });
  const budgets = workloads.map((entry, index) => {
    const row = rows.find((item) => item.name === entry.name);
    const coreLimit = index === 0 ? 5 : 25, adapterLimit = index === 0 ? 10 : 35;
    return { inputBytes: row.inputBytes, coreP95Ms: row.core.wallMs.p95, coreLimitMs: coreLimit,
      adapterRawOffP95Ms: row.adapterRawOff.wallMs.p95, adapterLimitMs: adapterLimit,
      met: row.core.wallMs.p95 <= coreLimit && row.adapterRawOff.wallMs.p95 <= adapterLimit };
  });
  const cpus = os.cpus();
  assert.ok(cpus.length, "CPU hardware information is unavailable");
  return { schema: "hugr-lean/benchmark/1", recordedAt: new Date().toISOString(),
    environment: { node: process.version, v8: process.versions.v8, platform: process.platform, arch: process.arch,
      os: { type: os.type(), release: os.release(), version: os.version() }, cpu: cpus[0].model, logicalCpus: cpus.length, memoryBytes: os.totalmem() },
    method: { warmups: WARMUPS, samples: SAMPLES, percentiles: "nearest rank", median: "mean of middle two for even distributions",
      timing: "core synchronous filter; adapter fresh host result + awaited createAfterHook, raw false; no I/O/startup/model",
      cpu: "process.cpuUsage user+system per operation; includes measurement overhead and process background work" },
    exactFamilies: fixtures.exactFamilies, profileIds, profileCount: profileIds.length, fixtureCount: fixtures.length, caseCount: rows.length,
    reducedCount: rows.filter((row) => row.status === "reduced").length, passthroughCount: rows.filter((row) => row.status === "passthrough").length,
    fixtureReductionPercent: distribution(rows.filter((row) => fixtureNames.has(row.name)).map((row) => row.reductionPercent)),
    familyFixtures, cases: rows, budgets, budgetsMet: budgets.every((budget) => budget.met) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 2, "Usage: node scripts/benchmark.mjs (build first)");
    const report = await runBenchmark();
    console.log(JSON.stringify(report, null, 2));
    assert.ok(report.budgetsMet, "Benchmark p95 budget exceeded; measured report printed above");
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
