#!/usr/bin/env node
// Mechanism view for the lean arm: for every tool output that Lean summarized (it ends with a recall line),
// look up the stored original in Lean's local raw store and count the bytes the model did not receive.
// Lossless rewrites carry no recall line and are not counted here. Run soon after the benchmark: the store
// keeps originals for 7 days and at most 64 MiB.
// Usage: node bench/lean-effect.mjs --label full  (writes results/<label>/lean-effect.json)
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { benchDir, parseArgs } from "./common.mjs";

const args = parseArgs(process.argv.slice(2));
const root = benchDir(), label = String(args.label ?? "full");
const { RawStore } = await import(pathToFileURL(join(root, "plugin", "inst", "node_modules", "hugr-lean", "dist", "raw", "index.js")).href);
const store = new RawStore();
const RECALL = /\[full output: lean recall ([0-9a-f]+)\]/;
const runsDir = join(root, "runs", label);
const perRun = [];
for (const runId of readdirSync(runsDir).filter((d) => d.includes("__lean__")).sort()) {
  const attempts = readdirSync(join(runsDir, runId)).sort();
  const file = join(runsDir, runId, attempts.at(-1), "export.json");
  if (!existsSync(file)) continue;
  const exported = JSON.parse(readFileSync(file, "utf8"));
  const row = { runId, summaries: 0, summarizedBytes: 0, originalBytes: 0, missingOriginals: 0, byTool: {} };
  for (const message of exported.messages ?? []) for (const part of message.parts ?? []) {
    if (part.type !== "tool" || typeof part.state?.output !== "string") continue;
    const match = part.state.output.match(RECALL);
    if (!match) continue;
    row.summaries++;
    const original = await store.get(match[1]);
    if (original === undefined) { row.missingOriginals++; continue; }
    const shown = Buffer.byteLength(part.state.output, "utf8"), full = Buffer.byteLength(original, "utf8");
    row.summarizedBytes += shown; row.originalBytes += full;
    const t = (row.byTool[part.tool] ??= { summaries: 0, originalBytes: 0, summarizedBytes: 0 });
    t.summaries++; t.originalBytes += full; t.summarizedBytes += shown;
  }
  perRun.push(row);
}
const total = perRun.reduce((a, r) => ({ summaries: a.summaries + r.summaries, originalBytes: a.originalBytes + r.originalBytes,
  summarizedBytes: a.summarizedBytes + r.summarizedBytes, missingOriginals: a.missingOriginals + r.missingOriginals }),
{ summaries: 0, originalBytes: 0, summarizedBytes: 0, missingOriginals: 0 });
writeFileSync(join(root, "results", label, "lean-effect.json"), JSON.stringify({ total, perRun }, null, 2));
console.log(JSON.stringify(total));
for (const r of perRun) console.log(`${r.runId}: ${r.summaries} summaries, ${r.originalBytes} -> ${r.summarizedBytes} bytes${r.missingOriginals ? `, ${r.missingOriginals} originals missing` : ""}`);
