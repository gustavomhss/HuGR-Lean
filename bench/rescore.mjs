#!/usr/bin/env node
// Re-scores answer tasks from the session export after a ground-truth correction, without rerunning the
// agent. ANSWER.json is rebuilt from the session's own file writes (apply_patch "Add File" or write).
// A session that edited ANSWER.json in place is reported as not reconstructible instead of guessed.
// Usage: node bench/rescore.mjs --label full --task t5-git-review [--dry]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TASKS } from "./tasks.mjs";
import { benchDir, parseArgs } from "./common.mjs";

const args = parseArgs(process.argv.slice(2));
const root = benchDir(), label = String(args.label ?? "full");
const task = TASKS.find((t) => t.id === args.task);
if (!task || task.check.kind !== "answer") throw new Error("--task must name an answer task");

function answerFromExport(exported) {
  let text = null, edited = false;
  for (const message of exported.messages ?? []) for (const part of message.parts ?? []) {
    if (part.type !== "tool" || part.state?.status !== "completed") continue;
    const input = part.state.input ?? {};
    if (part.tool === "write" && String(input.filePath ?? "").endsWith("ANSWER.json")) text = input.content;
    if (part.tool === "apply_patch") {
      const blocks = String(input.patchText ?? "").split(/^\*\*\* /m);
      for (const block of blocks) {
        if (/^Add File: (.*\/)?ANSWER\.json\s*$/m.test(block.split("\n")[0])) {
          text = block.split("\n").slice(1).filter((l) => l.startsWith("+")).map((l) => l.slice(1)).join("\n");
        } else if (/^(Update|Delete) File: (.*\/)?ANSWER\.json/.test(block)) edited = true;
      }
    }
    if (part.tool === "edit" && String(input.filePath ?? "").endsWith("ANSWER.json")) edited = true;
  }
  return { text, edited };
}

for (const file of readdirSync(join(root, "results", label, "records")).filter((f) => f.startsWith(`${task.id}__`))) {
  const path = join(root, "results", label, "records", file);
  const record = JSON.parse(readFileSync(path, "utf8"));
  if (record.infraFailure || !record.sessionId) continue;
  const exported = JSON.parse(readFileSync(join(root, "runs", label, record.runId, `attempt-${record.attempt}`, "export.json"), "utf8"));
  const { text, edited } = answerFromExport(exported);
  let pass = false, detail;
  if (edited) detail = "rescore: ANSWER.json was edited in place; not reconstructible";
  else if (text === null) detail = "rescore: no ANSWER.json write found";
  else {
    let answer = null;
    try { answer = JSON.parse(text); } catch (error) { detail = `rescore: invalid JSON: ${error.message}`; }
    if (answer) {
      const wrong = Object.keys(task.check.expected).filter((k) => JSON.stringify(answer[k]) !== JSON.stringify(task.check.expected[k]));
      const extra = Object.keys(answer).filter((k) => !(k in task.check.expected));
      pass = !wrong.length && !extra.length;
      detail = pass ? "rescore: all fields correct" : `rescore: wrong: ${wrong.join(",") || "-"}; extra keys: ${extra.join(",") || "-"}`;
    }
  }
  record.original = record.original ?? { success: record.success, checkDetail: record.checkDetail };
  record.success = pass; record.checkDetail = detail; record.rescored = true;
  if (!args.dry) writeFileSync(path, JSON.stringify(record, null, 2));
  console.log(`${record.runId}: ${record.original.success} -> ${pass} (${detail})`);
}
