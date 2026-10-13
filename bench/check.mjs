#!/usr/bin/env node
// Automatic success checks. checkWorkspace() runs after the agent has exited.
// Self-test: node bench/check.mjs --self-test  (each template must FAIL, each reference solution must PASS).
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TASKS } from "./tasks.mjs";
import { benchDir, cloneDir } from "./common.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function protectedFiles(template, patterns) {
  const files = execFileSync("git", ["ls-files"], { cwd: template }).toString().split("\n").filter(Boolean);
  return files.filter((file) => patterns.some((p) => p.startsWith("*")
    ? file.endsWith(p.slice(1)) : file === p || file.startsWith(`${p}/`)));
}

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function checkAnswer(ws, expected) {
  const path = join(ws, "ANSWER.json");
  if (!existsSync(path)) return { pass: false, detail: "ANSWER.json missing" };
  let answer;
  try { answer = JSON.parse(readFileSync(path, "utf8")); } catch (error) { return { pass: false, detail: `invalid JSON: ${error.message}` }; }
  const wrong = Object.keys(expected).filter((key) => !sameJson(answer?.[key], expected[key]));
  const extra = answer && typeof answer === "object" ? Object.keys(answer).filter((key) => !(key in expected)) : [];
  const pass = wrong.length === 0 && extra.length === 0;
  return { pass, detail: pass ? "all fields correct" : `wrong: ${wrong.join(",") || "-"}; extra keys: ${extra.join(",") || "-"}`, wrongFields: wrong, extraKeys: extra };
}

function runCommand(cmd, cwd, timeoutMs = 600_000) {
  const result = spawnSync(cmd[0], cmd.slice(1), { cwd, timeout: timeoutMs, maxBuffer: 1 << 28,
    env: { ...process.env, CI: "1", NO_COLOR: "1" } });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { pass: result.status === 0, detail: `exit ${result.status ?? result.signal}: ${output.slice(-600)}` };
}

/** Returns { pass, detail, ... } for one finished workspace. */
export function checkWorkspace(task, ws, template) {
  for (const file of protectedFiles(template, task.protect)) {
    const a = join(template, file), b = join(ws, file);
    if (!existsSync(b) || !readFileSync(a).equals(readFileSync(b))) return { pass: false, detail: `protected file changed: ${file}` };
  }
  const c = task.check, taskDir = join(HERE, "tasks", task.id);
  if (c.kind === "answer") return checkAnswer(ws, c.expected);
  if (c.kind === "command") return runCommand(c.cmd, ws);
  if (c.kind === "script") return runCommand(c.cmd.map((x) => x.replace("{task}", taskDir).replace("{ws}", ws)), ws);
  if (c.kind === "hidden-vitest") {
    copyFileSync(join(taskDir, c.file), join(ws, "test", c.file));
    return runCommand(c.cmd, ws);
  }
  throw new Error(`unknown check kind ${c.kind}`);
}

function applyReference(task, ws) {
  const taskDir = join(HERE, "tasks", task.id);
  if (task.check.kind === "answer") { writeFileSync(join(ws, "ANSWER.json"), JSON.stringify(task.check.expected)); return; }
  if (task.setup) { execFileSync("git", ["apply", "-R", join(taskDir, task.setup)], { cwd: ws }); return; }
  execFileSync("git", ["apply", join(taskDir, "reference.patch")], { cwd: ws });
}

if (process.argv.includes("--self-test")) {
  const root = benchDir();
  let ok = true;
  for (const task of TASKS) {
    const template = join(root, "templates", task.id);
    for (const mode of ["template", "reference"]) {
      const ws = join(root, "selftest", `${task.id}-${mode}`);
      rmSync(ws, { recursive: true, force: true });
      cloneDir(template, ws);
      if (mode === "reference") applyReference(task, ws);
      const result = checkWorkspace(task, ws, template);
      const expected = mode === "reference";
      if (result.pass !== expected) ok = false;
      console.log(`${result.pass === expected ? "ok  " : "FAIL"} ${task.id} ${mode}: pass=${result.pass} (${result.detail.split("\n")[0].slice(0, 120)})`);
      rmSync(ws, { recursive: true, force: true });
    }
  }
  process.exit(ok ? 0 : 1);
}
