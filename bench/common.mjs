// Shared helpers for the A/B benchmark scripts.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const PLUGIN = {
  spec: "hugr-lean@0.4.0",
  integrity: "sha512-mN7VGI6MBXiswd5ye0zJZML5loxhdrL3/HJbzvvXT8Cv6kMTyYsR7YorNYk6REdwEE4E4BfiwnuzZljOCDlkew==",
};
export const MODEL = process.env.LEAN_BENCH_MODEL ?? "openai/gpt-6-luna";
export const OPENCODE = process.env.OPENCODE_BIN ?? "opencode";

export function benchDir() {
  return process.env.LEAN_BENCH_DIR ?? join(tmpdir(), "lean-bench");
}

export function pluginUrl(root) {
  return pathToFileURL(join(root, "plugin", "inst", "node_modules", "hugr-lean", "dist", "index.js")).href;
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`unexpected argument ${key}`);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key.slice(2)] = true;
    else { out[key.slice(2)] = next; i++; }
  }
  return out;
}

/** Project-level opencode.json for one arm. The arms differ only in the `plugin` entry. */
export function projectConfig(arm, root) {
  const config = {
    $schema: "https://opencode.ai/config.json",
    provider: { openai: { models: { "gpt-6-luna": { name: "GPT-6 Luna" } } } },
    permission: { webfetch: "deny", websearch: "deny", external_directory: "deny" },
    snapshot: false,
    share: "disabled",
    autoupdate: false,
  };
  if (arm === "lean") config.plugin = [pluginUrl(root)];
  return config;
}

/** Environment shared by every run of both arms. */
export function runEnv(root, dbPath) {
  return {
    ...process.env,
    XDG_CONFIG_HOME: join(root, "xdg-config"),
    OPENCODE_DB: dbPath,
    OPENCODE_DISABLE_CLAUDE_CODE: "1",
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    OPENCODE_DISABLE_SHARE: "1",
  };
}

/** Deterministic PRNG (mulberry32) for the run order and the bootstrap. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Copies a template; on APFS `cp -c` makes copy-on-write clones, so workspaces cost almost no disk. */
export function cloneDir(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  if (process.platform === "darwin") execFileSync("cp", ["-cR", from, to]);
  else cpSync(from, to, { recursive: true, verbatimSymlinks: true });
}
