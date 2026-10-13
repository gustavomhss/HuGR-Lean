#!/usr/bin/env node
// Aggregates run records into results JSON (no paths, no transcripts) and Markdown tables.
// Usage: node bench/analyze.mjs --label full [--out bench/results/ab-0.4.0.json] [--md out.md]
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { benchDir, parseArgs, rng } from "./common.mjs";

const B = 10_000;
const args = parseArgs(process.argv.slice(2));
const label = String(args.label ?? "full");
const dir = join(benchDir(), "results", label);
const records = readdirSync(join(dir, "records")).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(dir, "records", f), "utf8")));
const plan = JSON.parse(readFileSync(join(dir, "plan.json"), "utf8"));
const env = { ...plan.environment };
delete env.date;

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const quantile = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1) + 0.5)))]; };
const pct = (x) => (x * 100).toFixed(1);
const sample = (xs, r) => xs.map(() => xs[Math.floor(r() * xs.length)]);

/** % change of means (lean/base - 1) with a percentile bootstrap CI, resampling runs within each arm. */
function change(base, lean, r) {
  const point = mean(lean) / mean(base) - 1;
  const boots = [];
  for (let i = 0; i < B; i++) boots.push(mean(sample(lean, r)) / mean(sample(base, r)) - 1);
  return { point, lo: quantile(boots, 0.025), hi: quantile(boots, 0.975) };
}

/** Pooled change: ratio of summed per-task means, stratified bootstrap over tasks' runs. */
function pooled(groups, key, r) {
  const ratio = (pick) => groups.reduce((a, g) => a + mean(pick(g.lean).map(key)), 0) /
    groups.reduce((a, g) => a + mean(pick(g.base).map(key)), 0) - 1;
  const boots = [];
  for (let i = 0; i < B; i++) {
    const g2 = groups.map((g) => ({ base: sample(g.base, r), lean: sample(g.lean, r) }));
    boots.push(ratio2(g2, key));
  }
  function ratio2(gs, k) { return gs.reduce((a, g) => a + mean(g.lean.map(k)), 0) / gs.reduce((a, g) => a + mean(g.base.map(k)), 0) - 1; }
  return { point: ratio((x) => x), lo: quantile(boots, 0.025), hi: quantile(boots, 0.975) };
}

// Pre-declared: a run that hit the session timeout is a failure even if the check passes afterwards.
for (const x of records) if (x.timedOut && x.success) { x.checkPassedAfterTimeout = true; x.success = false; }
const valid = records.filter((r) => !r.infraFailure && r.metrics);
// Discarded attempts (disk full, no session, provider errors) are kept in results/<label>/excluded.
const excludedDir = join(dir, "excluded");
const discarded = existsSync(excludedDir) ? readdirSync(excludedDir).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(excludedDir, f), "utf8"))) : [];
const excluded = [...records.filter((r) => r.infraFailure || !r.metrics), ...discarded]
  .map((r) => ({ runId: r.runId, attempt: r.attempt ?? null, reason: r.note ?? r.reclassified ?? r.infraFailure ?? "no metrics" }));
const taskIds = [...new Set(records.map((r) => r.task))].sort();
const r = rng(plan.environment.seed ?? 4242);
const keys = ["totalInputTokens", "inputTokens", "cachedInputTokens", "outputTokens", "reasoningTokens", "llmCalls", "toolOutputBytes", "wallMs"];
const tasks = [];
const groups = [];
for (const id of taskIds) {
  const base = valid.filter((x) => x.task === id && x.arm === "base");
  const lean = valid.filter((x) => x.task === id && x.arm === "lean");
  const row = { task: id, n: { base: base.length, lean: lean.length } };
  for (const arm of ["base", "lean"]) {
    const xs = arm === "base" ? base : lean;
    row[arm] = { successes: xs.filter((x) => x.success).length, runs: xs.length };
    for (const k of keys) row[arm][k] = xs.length ? { mean: mean(xs.map((x) => x.metrics[k] ?? x[k])), median: median(xs.map((x) => x.metrics[k] ?? x[k])) } : null;
    row[arm].leanRecallCalls = xs.reduce((a, x) => a + x.metrics.leanRecallCalls, 0);
    row[arm].leanSummaries = xs.reduce((a, x) => a + x.metrics.leanSummaries, 0);
    row[arm].retries = xs.reduce((a, x) => a + (x.retries ?? 0), 0);
    row[arm].timeouts = xs.filter((x) => x.timedOut).length;
  }
  if (base.length && lean.length) {
    row.totalInputChange = change(base.map((x) => x.metrics.totalInputTokens), lean.map((x) => x.metrics.totalInputTokens), r);
    row.uncachedInputChange = change(base.map((x) => x.metrics.inputTokens), lean.map((x) => x.metrics.inputTokens), r);
    row.toolBytesChange = change(base.map((x) => x.metrics.toolOutputBytes), lean.map((x) => x.metrics.toolOutputBytes), r);
    row.wallChange = change(base.map((x) => x.wallMs), lean.map((x) => x.wallMs), r);
    groups.push({ base, lean });
  }
  row.runs = [...base, ...lean].map((x) => ({ arm: x.arm, run: x.runId.split("__").pop(), success: x.success, timedOut: x.timedOut,
    retries: x.retries ?? 0, rescored: x.rescored ?? false, checkPassedAfterTimeout: x.checkPassedAfterTimeout ?? false, wallMs: x.wallMs, ...Object.fromEntries(Object.entries(x.metrics).filter(([k]) => k !== "errors")) }));
  tasks.push(row);
}
/** Pair bootstrap: resample (task, run index) pairs that have both arms; statistic = sum(lean)/sum(base) - 1. */
function pairBootstrap(pairs, key, r) {
  const stat = (ps) => ps.reduce((a, p) => a + key(p.lean), 0) / ps.reduce((a, p) => a + key(p.base), 0) - 1;
  const boots = [];
  for (let i = 0; i < B; i++) boots.push(stat(sample(pairs, r)));
  return { point: stat(pairs), lo: quantile(boots, 0.025), hi: quantile(boots, 0.975), pairs: pairs.length };
}
const pairs = [];
for (const b of valid.filter((x) => x.arm === "base")) {
  const l = valid.find((x) => x.arm === "lean" && x.task === b.task && x.runId.split("__")[2] === b.runId.split("__")[2]);
  if (l) pairs.push({ task: b.task, run: b.runId.split("__")[2], base: b, lean: l });
}
const get = (k) => (x) => (k === "wallMs" ? x.wallMs : x.metrics[k]);
const aggregate = groups.length ? {
  pairs: pairs.map((p) => `${p.task}/${p.run}`),
  pairTotalInput: pairBootstrap(pairs, get("totalInputTokens"), r),
  pairUncachedInput: pairBootstrap(pairs, get("inputTokens"), r),
  pairOutput: pairBootstrap(pairs, get("outputTokens"), r),
  pairToolOutputBytes: pairBootstrap(pairs, get("toolOutputBytes"), r),
  pairWall: pairBootstrap(pairs, get("wallMs"), r),
  pairTotalInputExcludingControl: pairBootstrap(pairs.filter((p) => p.task !== "t8-control"), get("totalInputTokens"), r),
  totalInput: pooled(groups, get("totalInputTokens"), r),
  uncachedInput: pooled(groups, get("inputTokens"), r),
  output: pooled(groups, get("outputTokens"), r),
  toolOutputBytes: pooled(groups, get("toolOutputBytes"), r),
  wall: pooled(groups, get("wallMs"), r),
  success: Object.fromEntries(["base", "lean"].map((arm) => { const xs = valid.filter((x) => x.arm === arm); return [arm, { successes: xs.filter((x) => x.success).length, runs: xs.length }]; })),
  recallCalls: valid.filter((x) => x.arm === "lean").reduce((a, x) => a + x.metrics.leanRecallCalls, 0),
  leanSummaries: valid.filter((x) => x.arm === "lean").reduce((a, x) => a + x.metrics.leanSummaries, 0),
  retries: records.reduce((a, x) => a + (x.retries ?? 0), 0),
} : null;
const result = { label, environment: env, bootstrap: { resamples: B, ci: 0.95, statistic: "ratio of means - 1" }, excluded, aggregate, tasks };
const out = String(args.out ?? join(dir, "aggregate.json"));
writeFileSync(out, JSON.stringify(result, null, 2) + "\n");

const ci = (c) => `${pct(c.point)}% [${pct(c.lo)}, ${pct(c.hi)}]`;
const ciN = (c, t) => (Math.min(t.n.base, t.n.lean) < 2 ? `${pct(c.point)}% (n=1, no CI)` : ci(c));
const k = (x) => (x / 1000).toFixed(1) + "k";
const lines = ["| Task | Success base | Success lean | Input tokens base: median (mean) | Input tokens lean: median (mean) | Change of mean, 95% CI | Tool output bytes change | Lean summaries / recalls | Wall time base → lean (median s) |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"];
for (const t of tasks) {
  if (!t.totalInputChange) continue;
  lines.push(`| ${t.task} | ${t.base.successes}/${t.base.runs} | ${t.lean.successes}/${t.lean.runs} | ${k(t.base.totalInputTokens.median)} (${k(t.base.totalInputTokens.mean)}) | ` +
    `${k(t.lean.totalInputTokens.median)} (${k(t.lean.totalInputTokens.mean)}) | ${ciN(t.totalInputChange, t)} | ${ciN(t.toolBytesChange, t)} | ` +
    `${t.lean.leanSummaries} / ${t.lean.leanRecallCalls} | ${(t.base.wallMs.median / 1000).toFixed(0)} → ${(t.lean.wallMs.median / 1000).toFixed(0)} |`);
}
if (aggregate) {
  lines.push("", `Paired (${pairs.length} task/run pairs, bootstrap over pairs): total input ${ci(aggregate.pairTotalInput)}, ` +
    `uncached input ${ci(aggregate.pairUncachedInput)}, output ${ci(aggregate.pairOutput)}, tool output bytes ${ci(aggregate.pairToolOutputBytes)}, ` +
    `wall time ${ci(aggregate.pairWall)}; total input without the control task ${ci(aggregate.pairTotalInputExcludingControl)}.`);
  lines.push("", `Pre-declared stratified estimate (sum of per-task means; cells with one run add no variance, so this CI is too narrow): total input ${ci(aggregate.totalInput)}, uncached input ${ci(aggregate.uncachedInput)}, ` +
    `output ${ci(aggregate.output)}, tool output bytes ${ci(aggregate.toolOutputBytes)}, wall time ${ci(aggregate.wall)}. ` +
    `Success: base ${aggregate.success.base.successes}/${aggregate.success.base.runs}, lean ${aggregate.success.lean.successes}/${aggregate.success.lean.runs}. ` +
    `Lean summaries ${aggregate.leanSummaries}, recall calls ${aggregate.recallCalls}, provider retries ${aggregate.retries}.`);
}
if (args.md) writeFileSync(String(args.md), lines.join("\n") + "\n");
console.log(lines.join("\n"));
