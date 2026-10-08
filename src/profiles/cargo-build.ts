import { tokenizeCommand } from "../core/command.js";
import { lines } from "../core/lines.js";
import type { Line, Observation, Profile, Reduction } from "../core/types.js";
import { cargoProfiles } from "./cargo.js";
import { nativeProfile, reduction, uint } from "./runner-utils.js";

const original = cargoProfiles.find((profile) => profile.id === "cargo-build")!;
type Mode = "build" | "check";
interface Invocation {
  mode: Mode;
  profile: string;
  flags: ReadonlyMap<string, string>;
}
// Flags are closed; project names/settings are data, never fixture allowlists.
const booleans = new Set(["--offline", "--release", "--workspace", "--lib", "--bins",
  "--examples", "--all-targets", "--all-features", "--no-default-features"]);
const values = new Set(["-p", "--exclude", "--profile", "--target", "--bin", "--example", "--color"]);
const identifier = /^[\p{L}_][\p{L}\p{N}_-]*$/u;
const feature = /^[\p{L}_][\p{L}\p{N}_-]*(?:\/[\p{L}_][\p{L}\p{N}_-]*)?$/u;
function argument(key: string, value: string): boolean {
  if (key === "--color") return value === "never";
  if (key === "--target") {
    return identifier.test(value) || (!value.startsWith("-") && /^[^\x00-\x1f\x7f]+\.json$/.test(value));
  }
  return identifier.test(value);
}
function invocation(argv: readonly string[]): Invocation | undefined {
  if (argv[0] !== "cargo" || (argv[1] !== "build" && argv[1] !== "check")) return undefined;
  const flags = new Map<string, string>();
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!, key = arg === "--color=never" ? "--color" : arg;
    if (flags.has(key)) return undefined;
    if (arg === "--color=never") flags.set(key, "never");
    else if (booleans.has(key)) flags.set(key, "");
    else if (key === "--features") {
      const value = argv[++i];
      if (!value) return undefined;
      const names = value.split(",");
      if (new Set(names).size !== names.length ||
          names.some(name => !feature.test(name))) return undefined;
      flags.set(key, value);
    } else {
      if (!values.has(key)) return undefined;
      const value = argv[++i];
      if (!value || !argument(key, value)) return undefined;
      flags.set(key, value);
    }
  }
  if ((flags.has("--release") && flags.has("--profile")) ||
      (flags.has("--exclude") && !flags.has("--workspace"))) return undefined;
  return { mode: argv[1], profile: flags.get("--profile") ?? (flags.has("--release") ? "release" : "dev"), flags };
}

const name = "[\\p{L}_][\\p{L}\\p{N}_-]*";
const numeric = "(?:0|[1-9]\\d*)", prerelease = `(?:${numeric}|\\d*[A-Za-z-][A-Za-z0-9-]*)`;
const version = `${numeric}\\.${numeric}\\.${numeric}(?:-${prerelease}(?:\\.${prerelease})*)?(?:\\+[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*)?`;
const progress = new RegExp(`^(   Compiling|    Checking) (${name}) v${version}(?: \\([^\\r\\n]+\\))?$`, "u");
const finish = new RegExp(`^    Finished \u0060(${name})\u0060 profile \\[(?:unoptimized|optimized)(?: \\+ debuginfo)?\\] target\\(s\\) in (\\d+\\.\\d{2})s$`, "u");
const locking = new RegExp(`^     Locking ([1-9]\\d*) (package|packages) to latest Rust ${version} compatible versions$`);
const total = new RegExp(`^warning: \u0060(${name})\u0060 \\((lib(?: test)?|bin "${name}"(?: test)?|example "${name}")\\) generated ([1-9]\\d*) (warning|warnings)(?: \\(([1-9]\\d*) (duplicate|duplicates)\\))?$`, "u");

/** Consume one bounded native dead_code diagnostic; no producer-prefixed warning admitted. */
function diagnostic(rows: readonly Line[], start: number): number | undefined {
  let cursor = start;
  const heading = /^warning: function `([\p{L}_][\p{L}\p{N}_]*)` is never used$/u.exec(rows[cursor++]?.text ?? "");
  if (!heading) return undefined;
  const location = /^ --> ([^\r\n]+):([1-9]\d*):([1-9]\d*)$/.exec(rows[cursor++]?.text ?? "");
  if (!location || uint(location[2]) === undefined || uint(location[3]) === undefined) return undefined;
  const gutter = `${" ".repeat(location[2]!.length + 1)}|`;
  if (rows[cursor++]?.text !== gutter) return undefined;
  const snippet = rows[cursor++]?.text, prefix = `${location[2]} | `;
  if (!snippet?.startsWith(prefix)) return undefined;
  const code = snippet.slice(prefix.length), column = Number(location[3]);
  // Name and highlight must agree with source position, without fixing source file/line/body.
  const before = Array.from(code).slice(0, column - 1).join("");
  const highlighted = code.slice(before.length);
  if (!highlighted.startsWith(heading[1]!) || /[\p{L}\p{N}_]/u.test(highlighted.slice(heading[1]!.length, heading[1]!.length + 1))) return undefined;
  if (rows[cursor++]?.text !== `${gutter} ${" ".repeat(column - 1)}${"^".repeat(Array.from(heading[1]!).length)}`) return undefined;
  if (rows[cursor]?.text === gutter) {
    cursor++;
    if (rows[cursor++]?.text !== `${" ".repeat(location[2]!.length + 1)}= note: \u0060#[warn(dead_code)]\u0060 (part of \u0060#[warn(unused)]\u0060) on by default`) return undefined;
  }
  if (rows[cursor++]?.text !== "") return undefined;
  return cursor;
}

function targetAllowed(call: Invocation, packageName: string, context: string): boolean {
  if (context === "lib") return true; // Dependency libraries need not equal the selected package.
  const all = call.flags.has("--all-targets");
  if (context.endsWith(" test") && !all) return false; // --tests is outside this closed argv vocabulary.
  if (!call.flags.has("--workspace") && call.flags.has("-p") && call.flags.get("-p") !== packageName) return false;
  if (context === "lib test") return all;
  const bin = /^bin "([^"]+)"(?: test)?$/.exec(context);
  if (bin) {
    const explicit = ["--lib", "--bin", "--bins", "--example", "--examples", "--all-targets"]
      .some(flag => call.flags.has(flag));
    return all || call.flags.has("--bins") || call.flags.get("--bin") === bin[1] || !explicit;
  }
  const example = /^example "([^"]+)"$/.exec(context);
  return example !== null && (all || call.flags.has("--examples") || call.flags.get("--example") === example[1]);
}

function parse(output: string, observation: Observation): Reduction | undefined {
  const argv = tokenizeCommand(observation.command), call = argv && invocation(argv);
  if (!call) return undefined;
  const rows = lines(output), kept: Line[] = [], prior = new Map<string, number>(), contexts = new Set<string>();
  let cursor = 0, pending = 0, deletionOpen = true;
  const lock = locking.exec(rows[0]?.text ?? "");
  if (lock) {
    const count = uint(lock[1]);
    if (count === undefined || lock[2] !== (count === 1 ? "package" : "packages")) return undefined;
    kept.push(rows[cursor++]!);
  }
  while (cursor < rows.length) {
    const row = rows[cursor]!, progressRow = progress.exec(row.text);
    if (progressRow) {
      if (call.mode === "build" && progressRow[1] !== "   Compiling") return undefined;
      if (!deletionOpen) kept.push(row); // Once diagnostics start, all later progress is required evidence.
      cursor++; continue; // Dependencies, version-disjoint packages and check build scripts are valid.
    }
    if (row.text.startsWith("warning: function ")) {
      deletionOpen = false;
      const end = diagnostic(rows, cursor);
      if (end === undefined) return undefined;
      kept.push(...rows.slice(cursor, end)); cursor = end; pending++; continue;
    }
    const summary = total.exec(row.text);
    if (summary) {
      const count = uint(summary[3]), duplicates = summary[5] === undefined ? 0 : uint(summary[5]);
      const context = `${summary[1]}:${summary[2]}`;
      if (!targetAllowed(call, summary[1]!, summary[2]!) ||
          count === undefined || duplicates === undefined || count !== pending + duplicates ||
          duplicates > (prior.get(summary[1]!) ?? 0) || (pending === 0 && contexts.has(context)) ||
          summary[4] !== (count === 1 ? "warning" : "warnings") ||
          (duplicates > 0 && summary[6] !== (duplicates === 1 ? "duplicate" : "duplicates"))) return undefined;
      contexts.add(context); prior.set(summary[1]!, count); pending = 0;
      kept.push(row); cursor++; continue;
    }
    const completed = finish.exec(row.text);
    if (!completed || completed[1] !== call.profile || !Number.isFinite(Number(completed[2])) ||
        pending !== 0 || cursor !== rows.length - 1) return undefined;
    kept.push(row);
    return reduction(kept);
  }
  return undefined;
}

export const familyProfiles: readonly Profile[] = [
  nativeProfile("cargo-build", argv => original.match(argv) || invocation(argv)?.mode === "build",
    (output, observation) => {
      const argv = tokenizeCommand(observation.command);
      const legacy = argv && original.match(argv) ? original.reduce(output, observation) : undefined;
      return legacy ?? parse(output, observation);
    }),
  nativeProfile("cargo-check", argv => invocation(argv)?.mode === "check", parse),
];
