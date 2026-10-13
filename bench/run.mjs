#!/usr/bin/env node
// Runs the A/B benchmark. Arms: "base" (no plugin) and "lean" (hugr-lean 0.4.0, default options).
// Usage: node bench/run.mjs --label full --runs 3 [--tasks a,b] [--parallel 6] [--seed 4242] [--timeout-min 25]
//        [--min-free-mib 1024] [--max-attempts 3] [--resume] [--only runId,...] [--keep]
import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { arch, platform, release } from "node:os";
import { join } from "node:path";
import { TASKS, SOURCES } from "./tasks.mjs";
import { checkWorkspace } from "./check.mjs";
import { sessionMetrics, providerFailure } from "./metrics.mjs";
import { MODEL, OPENCODE, benchDir, cloneDir, parseArgs, projectConfig, rng, runEnv } from "./common.mjs";

const ARMS = ["base", "lean"];
const args = parseArgs(process.argv.slice(2));
const MIN_FREE_BYTES = Number(args["min-free-mib"] ?? 1024) * 2 ** 20;
const root = benchDir();
const label = String(args.label ?? "pilot");
const runs = Number(args.runs ?? 1);
const parallel = Number(args.parallel ?? 4);
const seed = Number(args.seed ?? 4242);
const timeoutMs = Number(args["timeout-min"] ?? 25) * 60_000;
const maxAttempts = Number(args["max-attempts"] ?? 3);
const tasks = args.tasks ? TASKS.filter((t) => String(args.tasks).split(",").includes(t.id)) : TASKS;
const outDir = join(root, "results", label);
mkdirSync(join(outDir, "records"), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freeBytes = () => { const s = statfsSync(root); return s.bavail * s.bsize; };

/** Launches wait (never fail) while free disk is below the floor; a full disk would break runs mid-session. */
async function waitForDisk() {
  for (let i = 0; freeBytes() < MIN_FREE_BYTES; i++) {
    if (existsSync(join(outDir, "STOP"))) throw new Error("stopped");
    if (i % 20 === 0) console.log(`${new Date().toISOString()} waiting for disk: ${(freeBytes() / 2 ** 20).toFixed(0)} MiB free`);
    await sleep(15_000);
  }
}

function environment() {
  const plugin = JSON.parse(readFileSync(join(root, "plugin", "inst", "node_modules", "hugr-lean", "package.json"), "utf8"));
  return {
    date: new Date().toISOString(), model: MODEL,
    opencode: execFileSync(OPENCODE, ["--version"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(),
    plugin: `${plugin.name}@${plugin.version}`, node: process.version, os: `${platform()} ${release()} ${arch()}`,
    sources: Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, { url: v.url, commit: v.commit }])),
    runs, parallel, seed, timeoutMin: timeoutMs / 60_000, maxAttempts, tasks: tasks.map((t) => t.id),
  };
}

function runAgent(task, ws, runDir) {
  return new Promise((resolve) => {
    const events = openSync(join(runDir, "events.jsonl"), "w");
    const stderr = openSync(join(runDir, "stderr.log"), "w");
    const started = Date.now();
    const child = spawn(OPENCODE, ["run", ...(process.env.LEAN_BENCH_DEBUG ? ["--print-logs", "--log-level", "INFO"] : []), "-m", MODEL, "--format", "json", task.prompt], {
      // PWD must be set: OpenCode resolves the project directory from it, not from the process cwd.
      cwd: ws, env: { ...runEnv(root, join(runDir, "opencode.db")), PWD: ws }, stdio: ["ignore", events, stderr], detached: true,
    });
    let timedOut = false;
    const kill = (signal) => { try { process.kill(-child.pid, signal); } catch {} };
    const timer = setTimeout(() => { timedOut = true; kill("SIGTERM"); setTimeout(() => kill("SIGKILL"), 10_000); }, timeoutMs);
    child.on("exit", (code, signal) => {
      clearTimeout(timer); closeSync(events); closeSync(stderr);
      kill("SIGKILL"); // leftover tool processes of this run only (own process group)
      resolve({ exitCode: code, signal, timedOut, wallMs: Date.now() - started });
    });
  });
}

function readEvents(runDir) {
  const out = { sessionId: null, errors: [] };
  for (const line of readFileSync(join(runDir, "events.jsonl"), "utf8").split("\n")) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    out.sessionId ??= event.sessionID ?? null;
    if (event.type === "error") out.errors.push(`${event.error?.name ?? "error"}: ${String(event.error?.data?.message ?? "").slice(0, 200)}`);
  }
  return out;
}

async function attempt(task, arm, runId, n) {
  await waitForDisk();
  const runDir = join(root, "runs", label, runId, `attempt-${n}`);
  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(runDir, { recursive: true });
  const template = join(root, "templates", task.id), ws = join(runDir, "ws");
  try { cloneDir(template, ws); } catch (error) {
    // Disk can fill between the free-space check and the clone; no session started, so retry.
    rmSync(ws, { recursive: true, force: true });
    return { runId, task: task.id, arm, attempt: n, sessionId: null, exitCode: null, signal: null, timedOut: false,
      wallMs: 0, infraFailure: `workspace-clone: ${String(error.message).split("\n")[0].slice(0, 120)}`, success: null,
      checkDetail: null, metrics: null, eventErrors: [], stderrTail: "" };
  }
  writeFileSync(join(ws, "opencode.json"), JSON.stringify(projectConfig(arm, root), null, 2));
  const proc = await runAgent(task, ws, runDir);
  const stderr = readFileSync(join(runDir, "stderr.log"), "utf8");
  const { sessionId: sid, errors: eventErrors } = readEvents(runDir);
  let metrics = null;
  if (sid) {
    // Export to a file descriptor: a pipe can lose the tail of a large export when the process exits.
    const fd = openSync(join(runDir, "export.json"), "w");
    try {
      execFileSync(OPENCODE, ["export", sid], { cwd: ws, env: { ...runEnv(root, join(runDir, "opencode.db")), PWD: ws },
        stdio: ["ignore", fd, "ignore"] });
    } finally { closeSync(fd); }
    const exported = readFileSync(join(runDir, "export.json"), "utf8");
    metrics = sessionMetrics(JSON.parse(exported.slice(exported.indexOf("{"))));
  }
  const diskFull = metrics?.diskFullSeen || /No space left on device|ENOSPC/.test(stderr);
  const infra = !sid ? "no-session" : diskFull ? "disk-full" : proc.timedOut ? null
    : metrics.llmCalls === 0 ? `no-llm-call: ${eventErrors[0] ?? "none"}`
    : providerFailure(metrics, `${stderr}\n${eventErrors.join("\n")}`);
  const check = infra ? null : checkWorkspace(task, ws, template);
  if (!args.keep) rmSync(ws, { recursive: true, force: true });
  return { runId, task: task.id, arm, attempt: n, sessionId: sid, ...proc, infraFailure: infra,
    success: check ? check.pass : null, checkDetail: check?.detail ?? null, metrics,
    eventErrors, stderrTail: stderr.slice(-400) };
}

async function runJob(job) {
  const tries = [];
  for (let n = 1; n <= maxAttempts; n++) {
    const r = await attempt(job.task, job.arm, job.runId, n);
    tries.push(r);
    console.log(`${new Date().toISOString()} ${job.runId} attempt ${n}: ${r.infraFailure ? `INFRA ${r.infraFailure}` : `success=${r.success}`}` +
      ` ${(r.wallMs / 1000).toFixed(0)}s in=${r.metrics?.totalInputTokens ?? "-"}`);
    if (!r.infraFailure) break;
    await sleep(30_000 * n);
  }
  const final = { ...tries.at(-1), retries: tries.length - 1, retryReasons: tries.slice(0, -1).map((t) => t.infraFailure) };
  writeFileSync(join(outDir, "records", `${job.runId}.json`), JSON.stringify(final, null, 2));
  return final;
}

const random = rng(seed);
const jobs = [];
for (const task of tasks) for (const arm of ARMS) for (let k = 1; k <= runs; k++) jobs.push({ task, arm, runId: `${task.id}__${arm}__r${k}` });
for (let i = jobs.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [jobs[i], jobs[j]] = [jobs[j], jobs[i]]; }
const only = args.only ? new Set(String(args.only).split(",")) : null; // explicit cells, e.g. to complete pairs
const todo = jobs.filter((job) => (!only || only.has(job.runId)) &&
  (args.resume ? !existsSync(join(outDir, "records", `${job.runId}.json`)) : true));
if (!args.resume || !existsSync(join(outDir, "plan.json"))) writeFileSync(join(outDir, "plan.json"), JSON.stringify({ environment: environment(), order: jobs.map((j) => j.runId) }, null, 2));
console.log(`${todo.length} runs, ${parallel} in parallel, model ${MODEL}`);
let next = 0, lastLaunch = 0;
await Promise.all(Array.from({ length: Math.min(parallel, todo.length) }, async () => {
  while (next < todo.length) {
    const job = todo[next++];
    const wait = lastLaunch + 3_000 - Date.now(); // stagger launches by 3 s
    lastLaunch = Math.max(Date.now(), lastLaunch + 3_000);
    if (wait > 0) await sleep(wait);
    try { await runJob(job); } catch (error) { console.error(`${job.runId}: harness error: ${error.message}`); }
    if (existsSync(join(outDir, "STOP"))) break;
  }
}));
