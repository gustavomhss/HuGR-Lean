import { tokenizeCommand } from "../core/command.js";
import { lines } from "../core/lines.js";
import type { Observation, Profile, Reduction } from "../core/types.js";
import { cargoProfiles } from "./cargo.js";
import { nativeProfile, reduction, uint } from "./runner-utils.js";

const original = cargoProfiles.find((profile) => profile.id === "cargo-build")!;
type Mode = "build" | "check";
interface Invocation {
  mode: Mode;
  profile: "dev" | "release" | "small";
  flags: ReadonlyMap<string, string>;
}
// Closed C01 packet. New option/value spellings require native evidence, not guessing.
const booleans = new Set(["--offline", "--release", "--workspace", "--lib", "--bins",
  "--examples", "--all-targets", "--all-features", "--no-default-features"]);
const values: Readonly<Record<string, readonly string[]>> = {
  "-p": ["c01-app", "c01-peer", "c01-collision"],
  "--exclude": ["c01-collision"], "--profile": ["small"],
  "--target": ["x86_64-apple-darwin"], "--bin": ["c01-app"],
  "--example": ["tiny"], "--color": ["never"],
};
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
          names.some(name => !["extra", "warn", "fail"].includes(name))) return undefined;
      flags.set(key, value);
    } else {
      if (!Object.hasOwn(values, key)) return undefined;
      const allowed = values[key], value = argv[++i];
      if (!allowed || !value || !allowed.includes(value)) return undefined;
      flags.set(key, value);
    }
  }
  if (!flags.has("--offline") || (flags.has("--release") && flags.has("--profile")) ||
      (flags.has("--workspace") && flags.has("-p")) ||
      (flags.has("--exclude") && !flags.has("--workspace"))) return undefined;
  const selected = ["--lib", "--bin", "--example", "--all-targets", "--bins", "--examples"]
    .filter(key => flags.has(key));
  if (selected.length > 1 && !(selected.length === 2 && flags.has("--bins") && flags.has("--examples"))) return undefined;
  if ((flags.has("--bin") || flags.has("--example") || flags.has("--bins") || flags.has("--examples")) &&
      flags.get("-p") !== "c01-app") return undefined;
  if (flags.has("--features") && flags.get("-p") !== "c01-app") return undefined;
  return { mode: argv[1], profile: flags.has("--release") ? "release" : flags.has("--profile") ? "small" : "dev", flags };
}

const progress = /^(   Compiling|    Checking) (c01-app|c01-peer|c01-collision) v0\.1\.0 \([^()]+\)$/;
const finish = /^    Finished `(dev|release|small)` profile \[(unoptimized \+ debuginfo|optimized|optimized \+ debuginfo)\] target\(s\) in (\d+\.\d{2})s$/;
const descriptions = { dev: "unoptimized + debuginfo", release: "optimized", small: "optimized + debuginfo" };

function parse(output: string, observation: Observation): Reduction | undefined {
  const argv = tokenizeCommand(observation.command), call = argv && invocation(argv);
  if (!call) return undefined;
  const rows = lines(output), packages = new Set<string>();
  let cursor = 0;
  while (cursor < rows.length) {
    const row = progress.exec(rows[cursor]!.text);
    if (!row) break;
    if (row[1] !== (call.mode === "build" ? "   Compiling" : "    Checking") ||
        packages.has(row[2]!) || (call.flags.has("-p") && row[2] !== call.flags.get("-p")) ||
        (call.flags.has("--exclude") && row[2] === call.flags.get("--exclude"))) return undefined;
    packages.add(row[2]!); cursor++;
  }
  const keptStart = cursor;
  // One bounded, captured rustc dead_code diagnostic. Unknown headings/help formats refuse.
  if (rows[cursor]?.text.startsWith("warning:")) {
    if (call.flags.get("-p") !== "c01-app" || !call.flags.get("--features")?.split(",").includes("warn")) return undefined;
    const heading = /^warning: function `([\p{L}_][\p{L}\p{N}_]*)` is never used$/u.exec(rows[cursor++]!.text);
    if (!heading) return undefined;
    const location = /^ --> app\/src\/lib\.rs:(\d+):(\d+)$/.exec(rows[cursor++]?.text ?? "");
    if (!location || uint(location[1]) !== 2 || uint(location[2]) !== 4) return undefined;
    const body = ["  |", `2 | fn ${heading[1]}() {}`, `  |    ${"^".repeat(heading[1]!.length)}`,
      "  |", "  = note: `#[warn(dead_code)]` (part of `#[warn(unused)]`) on by default", ""];
    for (const text of body) if (rows[cursor++]?.text !== text) return undefined;
    const totals = call.flags.has("--all-targets")
      ? ["warning: `c01-app` (lib test) generated 1 warning", "warning: `c01-app` (lib) generated 1 warning (1 duplicate)"]
      : ["warning: `c01-app` (lib) generated 1 warning"];
    for (const text of totals) if (rows[cursor++]?.text !== text) return undefined;
  }
  const completed = finish.exec(rows[cursor++]?.text ?? "");
  if (!completed || completed[1] !== call.profile || completed[2] !== descriptions[call.profile] ||
      !Number.isFinite(Number(completed[3])) || cursor !== rows.length) return undefined;
  return reduction(rows.slice(keptStart));
}

export const familyProfiles: readonly Profile[] = [
  nativeProfile("cargo-build", argv => original.match(argv) || invocation(argv)?.mode === "build",
    (output, observation) => {
      const argv = tokenizeCommand(observation.command);
      return argv && original.match(argv) ? original.reduce(output, observation) : parse(output, observation);
    }),
  nativeProfile("cargo-check", argv => invocation(argv)?.mode === "check", parse),
];
