#!/usr/bin/env node
/** Compiled automatic native-view latency: default filterAutomatic and raw-off createAfterHook, never a model-cost estimate. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const count = (name, fallback, minimum) => {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  assert.ok(/^\d+$/.test(raw) && Number(raw) >= minimum, `${name} must be an integer >= ${minimum}`);
  return Number(raw);
};
const WARMUPS = count("BENCH_WARMUPS", 20, 0), SAMPLES = count("BENCH_SAMPLES", 100, 1);
// Optional local filter: BENCH_ONLY=<comma-separated case names (family@size) or family ids>. Unknown names fail.
const ONLY = process.env.BENCH_ONLY === undefined ? undefined : process.env.BENCH_ONLY.split(",").map((name) => name.trim()).filter(Boolean);
assert.ok(ONLY === undefined || ONLY.length > 0, "BENCH_ONLY must name at least one case or family");
const KiB = 1024, MiB = 1024 * KiB;
// Existing default-path budgets (docs/BENCHMARK.md); compared and reported, never enforced here.
const BUDGETS = { "256KiB": { core: 5, adapter: 10 }, "1MiB": { core: 25, adapter: 35 } };
const bytes = (text) => Buffer.byteLength(text, "utf8");
const fixture = async (file) => readFile(path.join(ROOT, "fixtures/automatic", file), "utf8");

async function compiled() {
  const modules = {};
  for (const name of ["core", "opencode"]) {
    const file = path.join(ROOT, "dist", name, "index.js");
    try { await access(file); modules[name] = await import(pathToFileURL(file).href); }
    catch (error) { throw new Error(`Missing or invalid compiled build: ${file}; run npm run build`, { cause: error }); }
  }
  assert.equal(typeof modules.core.filterAutomatic, "function", "Compiled filterAutomatic is missing");
  assert.equal(typeof modules.opencode.createAfterHook, "function", "Compiled createAfterHook is missing");
  return { filterAutomatic: modules.core.filterAutomatic, createAfterHook: modules.opencode.createAfterHook };
}

/** The nth native MCP tools/call response of a pinned capture: exact arguments and text block. */
async function mcpCapture(file, tool, nth = 0) {
  const capture = JSON.parse(await fixture(file)), calls = new Map(), found = [];
  for (const { direction, message } of capture.records) {
    if (direction === "send" && message.method === "tools/call") calls.set(message.id, message.params);
    else if (direction === "receive" && calls.get(message.id)?.name === tool) {
      const { content, isError } = message.result;
      assert.ok(isError === undefined && content.length === 1 && content[0].type === "text", `${file}: unexpected ${tool} carrier`);
      found.push({ args: calls.get(message.id).arguments, text: content[0].text });
    }
  }
  assert.ok(found[nth], `${file}: missing ${tool} response #${nth}`);
  return found[nth];
}

/** Templates are real captures; scaling repeats records with unique ids/refs/paths and keeps each grammar. */
async function templates() {
  // Real OpenCode 1.18.17 grep capture (host proof): directory, file texts, carrier metadata and args.
  const grepLine = (await fixture("files/host-grep.jsonl")).split("\n").filter(Boolean).map((line) => JSON.parse(line))
    .find((entry) => entry.phase === "before" && entry.input.tool === "grep");
  assert.ok(grepLine, "Missing native grep host capture");
  const grepRows = [...grepLine.output.output.matchAll(/^(\/[^\n]*)\/project-source-component-([a-z]+)\.txt:\n {2}Line 1: ([^\n]*)$/gmu)];
  assert.equal(grepRows.length, 3, "Unexpected grep capture shape");
  const directory = grepRows[0][1];
  assert.ok(grepRows.every((row) => row[1] === directory), "Grep capture rows differ in directory");
  const inventory = grepRows.map((row) => ({ name: row[2], text: row[3] }));

  const pwSnapshot = await mcpCapture("browser/native/playwright.json", "browser_snapshot", 0);
  const pwRunCode = await mcpCapture("browser/native/playwright.json", "browser_run_code_unsafe", 0);
  const devtools = await mcpCapture("browser/native/devtools.json", "take_snapshot", 0);
  const ps = JSON.parse(await fixture("cli/darwin-ps-axo.json"));
  assert.deepEqual(ps.argv.slice(1), ["-axo", "pid,ppid,stat,comm"], "Unexpected ps capture argv");
  return { directory, inventory, grepArgs: grepLine.input.args, pwSnapshot, pwRunCode, devtools, ps: ps.original };
}

function inventoryRows(t, n) {
  return Array.from({ length: n }, (_, i) => {
    const { name, text } = t.inventory[i % t.inventory.length];
    return { path: `${t.directory}/component-${String(i).padStart(7, "0")}/project-source-component-${name}.txt`, text: `${text}\n` };
  });
}

/** Playwright browser_snapshot: root container keeps its children; each replica renumbers refs after the capture's maximum. */
function playwrightBuilder(capture) {
  const lines = capture.text.split("\n"), open = lines.indexOf("```yaml"), close = lines.lastIndexOf("```");
  assert.ok(open > 0 && close === lines.length - 1 && /^- generic .*\[ref=e1\]:$/.test(lines[open + 1]), "Unexpected Playwright snapshot capture");
  const head = lines.slice(0, open + 2), children = lines.slice(open + 2, close);
  assert.ok(children.length && children.every((line) => /^(?:  )+- /.test(line)), "Unexpected Playwright snapshot hierarchy");
  const maxRef = Math.max(...[...capture.text.matchAll(/\[ref=e(\d+)\]/g)].map((m) => Number(m[1])));
  return (n) => {
    let next = maxRef + 1;
    const body = [];
    for (let k = 0; k < n; k++) for (const line of children) {
      body.push(k === 0 ? line : line.replace(/\[ref=e\d+\]/g, () => `[ref=e${next++}]`).replace(/^(\s*- \/url: \/details)$/, `$1/${k}`));
    }
    return [...head, ...body, "```"].join("\n");
  };
}

/** DevTools take_snapshot: RootWebArea first; replicas renumber uid=1_N after the capture's maximum. */
function devtoolsBuilder(capture) {
  const lines = capture.text.split("\n");
  assert.ok(lines[0] === "## Latest page snapshot" && /^uid=1_0 RootWebArea /.test(lines[1]) && lines.at(-1) === "", "Unexpected DevTools capture");
  const children = lines.slice(2, -1);
  assert.ok(children.length && children.every((line) => /^ {2,}uid=1_\d+ /.test(line)), "Unexpected DevTools hierarchy");
  const maxUid = Math.max(...[...capture.text.matchAll(/uid=1_(\d+)/g)].map((m) => Number(m[1])));
  return (n) => {
    let next = maxUid + 1;
    const body = [];
    for (let k = 0; k < n; k++) for (const line of children) {
      body.push(k === 0 ? line : line.replace(/uid=1_\d+/, () => `uid=1_${next++}`).replace(/(url="[^"]*\/details)"/, `$1/${k}"`));
    }
    return [...lines.slice(0, 2), ...body, ""].join("\n");
  };
}

/** CDP Accessibility.getFullAXTree via Playwright browser_run_code_unsafe; replicas of every non-root node, ids offset. */
function cdpBuilder(capture) {
  const prefix = "### Result\n", marker = "\n### Ran Playwright code\n";
  assert.ok(capture.text.startsWith(prefix), "Unexpected CDP carrier");
  const end = capture.text.indexOf(marker), section = capture.text.slice(prefix.length, end), suffix = capture.text.slice(end);
  const root = JSON.parse(section);
  assert.equal(JSON.stringify(root), section, "CDP capture is not compact JSON.stringify output");
  const [first, ...rest] = root.accessibility.nodes;
  assert.equal(first.parentId, undefined, "CDP root node has a parent");
  const OFFSET = 100000;
  const shift = (k) => (id) => { const value = Number(id); assert.ok(Number.isSafeInteger(value), "Non-integer CDP id"); return value < 0 ? value - k * OFFSET : value + k * OFFSET; };
  const remap = (value, k) => {
    if (Array.isArray(value)) return value.map((item) => remap(item, k));
    if (value === null || typeof value !== "object") return value;
    const move = shift(k), copy = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === "nodeId" || key === "parentId") copy[key] = String(move(item));
      else if (key === "childIds") copy[key] = item.map((id) => String(move(id)));
      else if (key === "backendDOMNodeId") copy[key] = move(item);
      else copy[key] = remap(item, k);
    }
    return copy;
  };
  return (n) => {
    const nodes = [{ ...first, childIds: Array.from({ length: n }, (_, k) => first.childIds.map((id) => String(shift(k)(id)))).flat() }];
    for (let k = 0; k < n; k++) nodes.push(...(k === 0 ? rest : remap(rest, k)));
    return prefix + JSON.stringify({ ...root, accessibility: { ...root.accessibility, nodes } }) + suffix;
  };
}

/** Darwin ps -axo pid,ppid,stat,comm: n capture rows in cyclic order, STAT/COMM verbatim, PIDs renumbered uniquely, parent links kept per replica. */
function psBuilder(capture) {
  const lines = capture.slice(0, -1).split("\n"), header = lines.shift();
  assert.ok(header === "  PID  PPID STAT COMM" && capture.endsWith("\n"), "Unexpected Darwin ps capture");
  const rows = lines.map((line) => ({ pid: line.slice(0, 5).trim(), ppid: line.slice(6, 11).trim(), tail: line.slice(11) }));
  const index = new Map(rows.map((row, i) => [row.pid, i]));
  return (n) => {
    assert.ok(n <= 99999, "Darwin PID bound exceeded");
    const out = [header];
    for (let i = 0; i < n; i++) {
      const row = rows[i % rows.length], base = Math.floor(i / rows.length) * rows.length;
      const parent = index.get(row.ppid), ppid = row.ppid === "0" ? 0 : parent !== undefined && base + parent < n ? base + parent + 1 : 1;
      out.push(`${String(i + 1).padStart(5)} ${String(ppid).padStart(5)}${row.tail}`);
    }
    return out.join("\n") + "\n";
  };
}

function families(t) {
  const mcp = (tool, args, extras = {}) => ({ carrier: "mcp", tool, args, ...extras });
  const inventoryPacket = (n) => {
    const json = { files: inventoryRows(t, n), scope: t.directory, hasMore: false, opaque: { error: "application data", ref: "e42" } };
    return { text: JSON.stringify(json, null, 2), structuredContent: json };
  };
  const grepText = (n) => `Found ${n} matches\n` + inventoryRows(t, n).map((row) => `${row.path}:\n  Line 1: ${row.text}`).join("\n\n");
  const globArgs = { pattern: "**/*.txt", path: t.directory };
  const curl = "curl -fsS http://127.0.0.1:56643/inventory";
  return [
    { id: "mcp-json", profile: "auto-json", source: "automatic-proof-server.mjs MCP packet (OpenCode 1.18.17 host proof shape), JSON.stringify(json, null, 2)",
      ...mcp("proof_inventory", { mode: "json" }), build: (n) => {
        const { text, structuredContent } = inventoryPacket(n);
        return { text, annotations: { audience: ["assistant"] }, packet: { structuredContent, _meta: { source: "original-mit-local-producer", ref: "e42" } } };
      } },
    { id: "cdp-ax", profile: "auto-cdp", source: "fixtures/automatic/browser/native/playwright.json browser_run_code_unsafe (Accessibility.getFullAXTree)",
      ...mcp("browser_run_code_unsafe", t.pwRunCode.args), build: ((b) => (n) => ({ text: b(n) }))(cdpBuilder(t.pwRunCode)), roundTrip: t.pwRunCode.text },
    { id: "playwright-snapshot", profile: "auto-snapshot", source: "fixtures/automatic/browser/native/playwright.json browser_snapshot",
      ...mcp("browser_snapshot", t.pwSnapshot.args), build: ((b) => (n) => ({ text: b(n) }))(playwrightBuilder(t.pwSnapshot)), roundTrip: t.pwSnapshot.text },
    { id: "devtools-snapshot", profile: "auto-snapshot", source: "fixtures/automatic/browser/native/devtools.json take_snapshot",
      ...mcp("take_snapshot", t.devtools.args), build: ((b) => (n) => ({ text: b(n) }))(devtoolsBuilder(t.devtools)), roundTrip: t.devtools.text },
    { id: "native-grep", profile: "auto-files", source: "fixtures/automatic/files/host-grep.jsonl (OpenCode 1.18.17 host capture)",
      carrier: "native", tool: "grep", args: t.grepArgs,
      build: (n) => { const text = grepText(n); return { text, metadata: { matches: n, truncated: false } }; } },
    { id: "native-glob", profile: "auto-files", source: "OpenCode 1.18.17 glob grammar (fixtures/automatic/files/native.json, host BASELINE.md shape)",
      carrier: "native", tool: "glob", args: globArgs,
      build: (n) => ({ text: inventoryRows(t, n).map((row) => row.path).join("\n"), metadata: { count: n, truncated: false } }) },
    { id: "darwin-ps", profile: "auto-cli", source: "fixtures/automatic/cli/darwin-ps-axo.json (macOS 15.3.2 /bin/ps)",
      carrier: "native", tool: "bash", args: { command: "ps -axo pid,ppid,stat,comm", description: "List processes" },
      build: ((b) => (n) => { const text = b(n); return { text, metadata: { output: text, exit: 0, truncated: false } }; })(psBuilder(t.ps)) },
    { id: "bash-curl-json", profile: "auto-json", source: "automatic-host-proof.mjs curl JSON API (OpenCode 1.18.17 host proof), JSON.stringify(json, null, 2)",
      carrier: "native", tool: "bash", args: { command: curl, description: "Read local JSON API" },
      build: (n) => { const text = JSON.stringify({ files: inventoryRows(t, n), scope: t.directory }, null, 2);
        return { text, metadata: { output: text, exit: 0, truncated: false } }; } },
  ];
}

/** Largest scale with model-visible text <= target bytes (text bytes are monotone in scale). */
function scaleFor(family, target) {
  const size = (n) => bytes(family.build(n).text);
  assert.ok(size(1) <= target, `${family.id}: one record exceeds ${target} bytes`);
  let low = 1, high = 2;
  while (size(high) <= target) { low = high; high *= 2; }
  while (high - low > 1) { const mid = Math.floor((low + high) / 2); if (size(mid) <= target) low = mid; else high = mid; }
  return low;
}

function makeCase(family, scale, label, expected) {
  const built = family.build(scale), text = built.text;
  const observation = Object.freeze({ source: family.carrier === "mcp" ? "mcp" : "native", tool: family.tool, output: text,
    args: Object.freeze({ ...family.args }), metadata: Object.freeze({ ...(built.metadata ?? {}) }), status: "success", completeness: "complete" });
  const input = Object.freeze({ tool: family.tool, args: Object.freeze({ ...family.args }) });
  let fresh, visible, untouched;
  if (family.carrier === "mcp") {
    const block = Object.freeze({ type: "text", text, ...(built.annotations ? { annotations: built.annotations } : {}) });
    fresh = () => ({ content: [block], ...built.packet });
    visible = (output) => output.content[0].text;
    untouched = (output, reduced) => {
      assert.equal(output.content.length, 1);
      if (reduced) assert.deepEqual({ ...output.content[0], text: undefined }, { ...block, text: undefined }, `${label}: block fields changed`);
      else assert.equal(output.content[0], block, `${label}: refused packet block replaced`);
      for (const key of Object.keys(built.packet ?? {})) assert.equal(output[key], built.packet[key], `${label}: ${key} changed`);
    };
  } else {
    const metadata = observation.metadata;
    fresh = () => ({ title: "Benchmark", output: text, metadata });
    visible = (output) => output.output;
    untouched = (output) => { assert.equal(output.metadata, metadata, `${label}: metadata changed`); assert.equal(output.title, "Benchmark"); };
  }
  return { name: label, family: family.id, carrier: family.carrier, tool: family.tool, source: family.source, scale, expected, observation, input, fresh, visible, untouched };
}

function checkCore(entry, result) {
  const { expected, observation } = entry;
  assert.equal(result.status, expected.status, `${entry.name}: expected ${expected.status}, got ${result.status}/${result.reason}`);
  assert.equal(result.reason, expected.reason, `${entry.name}: expected reason ${expected.reason}, got ${result.reason}`);
  assert.equal(result.inputBytes, bytes(observation.output), `${entry.name}: wrong UTF-8 input bytes`);
  if (expected.status === "reduced") {
    assert.equal(result.profile, expected.profile, `${entry.name}: profile differs`);
    assert.equal(typeof result.replacement, "string");
    assert.equal(result.outputBytes, bytes(result.replacement), `${entry.name}: wrong UTF-8 output bytes`);
    assert.ok(result.outputBytes > 0 && result.outputBytes < result.inputBytes, `${entry.name}: did not reduce`);
    return result.replacement;
  }
  assert.equal(Object.hasOwn(result, "replacement"), false, `${entry.name}: refusal supplied a replacement`);
  assert.equal(result.outputBytes, result.inputBytes, `${entry.name}: refusal bytes changed`);
  return observation.output;
}

const percentile = (sorted, percent) => sorted[Math.max(0, Math.ceil(sorted.length * percent) - 1)];
function stats(values) {
  assert.ok(values.length && values.every((value) => Number.isFinite(value) && value >= 0), "Empty or invalid measurements");
  const sorted = values.toSorted((a, b) => a - b);
  return { p50: percentile(sorted, 0.50), p95: percentile(sorted, 0.95), max: sorted.at(-1), mean: values.reduce((sum, value) => sum + value, 0) / values.length };
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

function commit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return null; }
}

export async function runAutomaticBenchmark() {
  const { filterAutomatic, createAfterHook } = await compiled();
  const t = await templates();
  const known = families(t);
  const wanted = (family) => ONLY === undefined || ONLY.some((name) => name === family.id || name.startsWith(`${family.id}@`));
  const all = known.filter(wanted);
  // Builders at scale 1 must reproduce the pinned capture exactly where the capture is the template.
  for (const family of all) if (family.roundTrip !== undefined) assert.equal(family.build(1).text, family.roundTrip, `${family.id}: scale 1 differs from capture`);
  const reduced = (family) => ({ status: "reduced", reason: "automatic_native_view", profile: family.profile });
  const refused = { status: "passthrough", reason: "unsupported_or_not_smaller" };
  // Intended outcomes. CDP: the shared JSON parser admits at most 25,000 syntax nodes (keys and values),
  // and one real AX node is roughly 45 of them, so CDP refuses well below 256 KiB (before the 25,000-cell
  // bound). The auto-json fallback uses the same parser, so both sizes stay exact passthrough.
  const expectedAt = (family) => family.id === "cdp-ax" ? refused : reduced(family);
  const cases = [];
  for (const family of all) {
    let refusedScale;
    for (const [size, target] of [["256KiB", 256 * KiB], ["1MiB", MiB]]) {
      const scale = scaleFor(family, target), expected = expectedAt(family);
      cases.push({ ...makeCase(family, scale, `${family.id}@${size}`, expected), sizeClass: size, budgetClass: size });
      if (expected.status !== "reduced") refusedScale = Math.min(refusedScale ?? scale, scale);
    }
    if (refusedScale !== undefined) {
      // Largest admitted whole-replica scale, with its refused successor as boundary witness.
      const admitted = (n) => filterAutomatic(makeCase(family, n, "probe", reduced(family)).observation).status === "reduced";
      assert.ok(admitted(1) && !admitted(refusedScale), `${family.id}: admission boundary is not bracketed`);
      let low = 1, high = refusedScale;
      while (high - low > 1) { const mid = Math.floor((low + high) / 2); if (admitted(mid)) low = mid; else high = mid; }
      assert.equal(admitted(low + 1), false, `${family.id}: admission is not monotone at ${low + 1}`);
      const entry = makeCase(family, low, `${family.id}@largest-admitted`, reduced(family));
      const budgetClass = bytes(entry.observation.output) <= 256 * KiB ? "256KiB" : "1MiB";
      cases.push({ ...entry, sizeClass: "largest-admitted", budgetClass });
    }
  }
  assert.equal(new Set(cases.map((entry) => entry.name)).size, cases.length, "Duplicate case names");
  if (ONLY !== undefined) {
    for (const name of ONLY) assert.ok(known.some((family) => family.id === name) || cases.some((entry) => entry.name === name), `BENCH_ONLY: unknown case or family ${name}`);
    cases.splice(0, cases.length, ...cases.filter((entry) => ONLY.includes(entry.name) || ONLY.includes(entry.family)));
  }
  const hook = createAfterHook({ raw: false }); // Actual compiled adapter, automatic default on; no injected engine or raw store.
  const rows = [];
  for (const entry of cases) {
    const baseline = filterAutomatic(entry.observation); // Default options and registry.
    const expectedText = checkCore(entry, baseline);
    const core = await measure(() => filterAutomatic(entry.observation), (result) => {
      assert.equal(checkCore(entry, result), expectedText, `${entry.name}: nondeterministic core result`);
    });
    const adapter = await measure(async () => {
      const output = entry.fresh();
      await hook(entry.input, output);
      return output;
    }, (output) => {
      assert.equal(entry.visible(output), expectedText, `${entry.name}: adapter output differs from default core`);
      entry.untouched(output, baseline.status === "reduced");
    }, true);
    const budget = BUDGETS[entry.budgetClass];
    rows.push({ name: entry.name, family: entry.family, sizeClass: entry.sizeClass, carrier: entry.carrier, tool: entry.tool, source: entry.source,
      scale: entry.scale, intended: entry.expected, status: baseline.status, reason: baseline.reason, profile: baseline.profile ?? null,
      inputBytes: baseline.inputBytes, outputBytes: baseline.outputBytes, savedBytes: baseline.inputBytes - baseline.outputBytes,
      savingsPercent: baseline.inputBytes ? (1 - baseline.outputBytes / baseline.inputBytes) * 100 : 0,
      core, adapterRawOff: adapter,
      budget: { class: entry.budgetClass, coreLimitMs: budget.core, adapterLimitMs: budget.adapter,
        coreP95Ms: core.wallMs.p95, adapterP95Ms: adapter.wallMs.p95,
        coreMet: core.wallMs.p95 <= budget.core, adapterMet: adapter.wallMs.p95 <= budget.adapter } });
  }
  const cpus = os.cpus();
  return { schema: "hugr-lean/benchmark-automatic/1", recordedAt: new Date().toISOString(), commit: commit(),
    environment: { node: process.version, v8: process.versions.v8, platform: process.platform, arch: process.arch,
      os: { type: os.type(), release: os.release(), version: os.version() }, cpu: cpus[0]?.model ?? null, logicalCpus: cpus.length,
      memoryBytes: os.totalmem(), runner: { os: process.env.RUNNER_OS ?? null, arch: process.env.RUNNER_ARCH ?? null,
        image: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, runId: process.env.GITHUB_RUN_ID ?? null } },
    method: { warmups: WARMUPS, samples: SAMPLES, percentiles: "nearest rank",
      timing: "core: synchronous default filterAutomatic; adapter: fresh host result + awaited createAfterHook({raw:false}); no I/O/startup/model",
      workloads: "real capture shapes scaled by whole records/replicas with unique ids/refs/paths to the largest size <= target UTF-8 bytes",
      budgets: "existing default-path p95 budgets (core 5/25 ms, adapter 10/35 ms at 256 KiB/1 MiB); reported only, never a failure",
      caveat: "glob/grep/ps sizes exceed what a host usually returns untruncated; they measure reducer cost on the admitted grammar" },
    caseCount: rows.length, cases: rows,
    budgetSummary: { coreMet: rows.filter((row) => row.budget.coreMet).length, adapterMet: rows.filter((row) => row.budget.adapterMet).length, total: rows.length } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 2, "Usage: node scripts/benchmark-automatic.mjs (build first)");
    console.log(JSON.stringify(await runAutomaticBenchmark(), null, 2));
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
