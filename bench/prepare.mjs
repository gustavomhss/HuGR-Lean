#!/usr/bin/env node
// Builds one read-only template workspace per task under $LEAN_BENCH_DIR/templates.
// Usage: node bench/prepare.mjs [--tasks t1-rust-semver,...]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCES, TASKS } from "./tasks.mjs";
import { PLUGIN, benchDir, parseArgs } from "./common.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXED_GIT_ENV = {
  GIT_AUTHOR_NAME: "bench", GIT_AUTHOR_EMAIL: "bench@example.invalid", GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_NAME: "bench", GIT_COMMITTER_EMAIL: "bench@example.invalid", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
};

function sh(cmd, args, cwd, extraEnv = {}) {
  return execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, ...extraEnv } }).toString();
}

function sourceRepo(root, name) {
  const src = SOURCES[name];
  const dir = join(root, "repos", name);
  if (!existsSync(dir)) sh("git", ["clone", "-q", src.url, dir], root);
  try { sh("git", ["cat-file", "-e", `${src.commit}^{commit}`], dir); }
  catch { sh("git", ["fetch", "-q", "origin"], dir); }
  return { dir, commit: src.commit };
}

function freshRepo(dir) {
  sh("git", ["init", "-q", "-b", "main"], dir);
  sh("git", ["add", "-A"], dir);
  sh("git", ["commit", "-q", "-m", "workspace snapshot"], dir, FIXED_GIT_ENV);
}

function build(root, task) {
  const out = join(root, "templates", task.id);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const taskDir = join(HERE, "tasks", task.id);
  if (task.source && task.history) {
    const { dir, commit } = sourceRepo(root, task.source);
    sh("git", ["clone", "-q", "--no-local", dir, out], root);
    sh("git", ["checkout", "-q", "--detach", commit], out);
    sh("git", ["remote", "remove", "origin"], out);
  } else if (task.source) {
    const { dir, commit } = sourceRepo(root, task.source);
    const tar = execFileSync("git", ["archive", "--format=tar", commit], { cwd: dir, maxBuffer: 1 << 30 });
    execFileSync("tar", ["-x", "-f", "-"], { cwd: out, input: tar });
  }
  if (task.setup) sh("git", ["apply", "--whitespace=nowarn", join(taskDir, task.setup)], out);
  if (task.fixture) {
    const data = gunzipSync(readFileSync(join(taskDir, task.fixture.from)));
    const digest = createHash("sha256").update(data).digest("hex");
    if (digest !== task.fixture.sha256) throw new Error(`${task.id}: fixture sha256 ${digest} != pinned ${task.fixture.sha256}`);
    mkdirSync(join(out, dirname(task.fixture.to)), { recursive: true });
    writeFileSync(join(out, task.fixture.to), data);
  }
  if (!task.history) freshRepo(out);
  if (task.prebuild === "cargo") sh("cargo", ["test", "--no-run", "-q"], out);
  if (task.prebuild === "pnpm") sh("npx", ["-y", "pnpm@10.33.2", "install", "--frozen-lockfile", "--reporter=silent"], out);
  appendFileSync(join(out, ".git", "info", "exclude"), "\nopencode.json\n");
  const status = sh("git", ["status", "--porcelain"], out).trim();
  if (status) throw new Error(`${task.id}: template is not clean after prebuild:\n${status}`);
  console.log(`prepared ${task.id}`);
}

function installPlugin(root) {
  const dir = join(root, "plugin");
  mkdirSync(join(dir, "inst"), { recursive: true });
  const name = sh("npm", ["pack", PLUGIN.spec, "--silent"], dir).trim().split("\n").pop();
  const digest = "sha512-" + createHash("sha512").update(readFileSync(join(dir, name))).digest("base64");
  if (digest !== PLUGIN.integrity) throw new Error(`plugin tarball integrity ${digest} != ${PLUGIN.integrity}`);
  writeFileSync(join(dir, "inst", "package.json"), '{"name":"lean-bench-plugin","private":true}\n');
  sh("npm", ["install", "--no-audit", "--no-fund", "--silent", join(dir, name)], join(dir, "inst"));
  console.log(`installed ${PLUGIN.spec} (${digest})`);
}

const args = parseArgs(process.argv.slice(2));
const root = benchDir();
mkdirSync(join(root, "repos"), { recursive: true });
const wanted = args.tasks ? new Set(args.tasks.split(",")) : null;
if (!args["skip-plugin"]) installPlugin(root);
for (const task of TASKS) if (!wanted || wanted.has(task.id)) build(root, task);
// Empty user-level OpenCode config used by every run (keeps the user's global plugins out of both arms).
mkdirSync(join(root, "xdg-config", "opencode"), { recursive: true });
writeFileSync(join(root, "xdg-config", "opencode", "opencode.json"), '{"$schema":"https://opencode.ai/config.json"}\n');
