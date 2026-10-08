import { cargoProfiles } from "./cargo.js";
import { tokenizeCommand } from "../core/command.js";
import { iterateLines } from "../core/lines.js";
import type { Line, Observation, Profile, Reduction } from "../core/types.js";
import { nativeProfile, reduction, uint } from "./runner-utils.js";

const legacy = cargoProfiles.find(profile => profile.id === "cargo-test")!;
const rustName = "[\\p{L}_][\\p{L}\\p{N}_]*(?:::[\\p{L}_][\\p{L}\\p{N}_]*)*";
const nameRow = new RegExp(`^test (${rustName}) \\.\\.\\. (ok|ignored(?:, .+)?)$`, "u");
const docRow = new RegExp(`^test ([^\\s()]+\\.rs - ${rustName} \\(line ([1-9]\\d*)\\)) \\.\\.\\. (ok|ignored(?:, .+)?)$`, "u");
const nameArg = new RegExp(`^${rustName}$`, "u");
const token = /^[A-Za-z_][A-Za-z0-9_-]*$/;
type Selector = "lib" | "doc" | "all-targets" | "examples" | "test" | "bin" | "example";
interface Command {
  selector?: Selector; selected?: string; target?: string; filter?: string;
  profile: "test" | "release" | "c02"; packages: Set<string>; workspace: boolean;
  ignored: boolean; includeIgnored: boolean; skips: Set<string>;
}

/** Closed delta argv. Log-emitting/quiet/list flags are refusal-only, never no-noise. */
function command(argv: readonly string[]): Command | undefined {
  if (argv[0] !== "cargo" || argv[1] !== "test" || argv.length > 64) return undefined;
  const result: Command = { profile: "test", packages: new Set(), workspace: false,
    ignored: false, includeIgnored: false, skips: new Set() };
  const seen = new Set<string>(), exclusions = new Set<string>();
  let harness = false, exact = false, features = false, allFeatures = false;
  function once(key: string): boolean { if (seen.has(key)) return false; seen.add(key); return true; }
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--" && !harness && i + 1 < argv.length) { harness = true; continue; }
    if (harness) {
      if (arg === "--exact" && once("exact")) exact = true;
      else if (arg === "--ignored" && once("ignored")) result.ignored = true;
      else if (arg === "--include-ignored" && once("include-ignored")) result.includeIgnored = true;
      else if (arg === "--test-threads=1" && once("threads")) { /* pinned serial spelling */ }
      else if (arg === "--test-threads" && once("threads") && argv[++i] === "1") { /* pinned serial value */ }
      else if (arg === "--skip") {
        const skip = argv[++i];
        if (!skip || !nameArg.test(skip) || result.skips.has(skip) || result.skips.size >= 8) return undefined;
        result.skips.add(skip);
      } else return undefined;
      continue;
    }
    if (arg === "--offline" && once("offline")) continue;
    if ((arg === "--color=never" || arg === "--color") && once("color")) {
      if (arg === "--color" && argv[++i] !== "never") return undefined;
    } else if (arg === "--workspace" && once("workspace")) result.workspace = true;
    else if (arg === "-p") {
      const pkg = argv[++i];
      if (!pkg || !token.test(pkg) || result.packages.has(pkg) || result.packages.size >= 8) return undefined;
      result.packages.add(pkg);
    } else if (arg === "--exclude") {
      const pkg = argv[++i];
      if (!pkg || !token.test(pkg) || exclusions.has(pkg) || exclusions.size >= 8) return undefined;
      exclusions.add(pkg);
    } else if (["--lib", "--doc", "--all-targets", "--examples", "--test", "--bin", "--example"].includes(arg)) {
      if (!once("selector")) return undefined;
      result.selector = arg.slice(2) as Selector;
      if (["--test", "--bin", "--example"].includes(arg)) {
        const selected = argv[++i];
        if (!selected || !token.test(selected)) return undefined;
        result.selected = selected;
      }
    } else if (arg === "--release" && once("profile")) result.profile = "release";
    else if (arg === "--profile" && once("profile") && argv[++i] === "c02") result.profile = "c02";
    else if (arg === "--target" && once("target") && argv[++i] === "x86_64-apple-darwin") result.target = "x86_64-apple-darwin";
    else if (arg === "--no-default-features" && once("no-default-features")) continue;
    else if (arg === "--all-features" && once("all-features")) allFeatures = true;
    else if (arg === "--features" && once("features")) {
      const value = argv[++i];
      if (!value || !token.test(value)) return undefined;
      features = true;
    } else if (!arg.startsWith("-") && !result.filter && nameArg.test(arg)) result.filter = arg;
    else return undefined;
  }
  if ((exclusions.size && !result.workspace) || (result.workspace && result.packages.size) ||
      (features && allFeatures) || (result.ignored && result.includeIgnored) ||
      Boolean(result.filter) !== exact || (result.selector === "doc" && harness)) return undefined;
  return result;
}

const compileRow = /^   Compiling [A-Za-z0-9_-]+ v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?: \([^()]+\))?$/;
const finishRow = /^    Finished `(test|release|c02)` profile \[(unoptimized \+ debuginfo|optimized|optimized \+ debuginfo)\] target\(s\) in (?:(\d+)m )?(\d+(?:\.\d+)?)s$/;
const summaryRow = /^test result: ok\. (\d+) passed; 0 failed; (\d+) ignored; 0 measured; (\d+) filtered out; finished in (\d+(?:\.\d+)?)s$/;
const executableRow = /^     Running (unittests (?:src\/[^\s()]+|examples\/[^\s()]+)\.rs|tests\/[^\s()]+\.rs) \(((?:\/[^\s()]+\/)?target\/(?:(x86_64-apple-darwin)\/)?(debug|release|c02)\/(deps|examples)\/([^/\s()]+))\)$/;
const docHeader = /^   Doc-tests ([A-Za-z0-9_-]+)$/;
const docMetrics = /^all doctests ran in (\d+(?:\.\d+)?)s; merged doctests compilation took (\d+(?:\.\d+)?)s$/;
function seconds(text: string, minute = false): boolean {
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && (!minute || n < 60);
}
function allowedContext(context: string, doc: boolean, c: Command): boolean {
  if (doc) return c.selector === undefined || c.selector === "doc";
  switch (c.selector) {
    case "doc": return false;
    case "lib": return context === "unittests src/lib.rs";
    case "test": return context === `tests/${c.selected}.rs`;
    case "bin": return context === `unittests src/bin/${c.selected}.rs`;
    case "example": return context === `unittests examples/${c.selected}.rs`;
    case "examples": return context.startsWith("unittests examples/");
    default: return true;
  }
}

/** Full suites, source-backed evidence, independent executable identities across workspace members. */
function delta(output: string, c: Command): Reduction | undefined {
  const rows = iterateLines(output);
  let row = rows.next().value ?? undefined;
  function take(): Line | undefined { const value = row; row = rows.next().value ?? undefined; return value; }
  function blanks(): void { while (row?.text === "") take(); }
  let removable = false;
  while (row && compileRow.test(row.text)) { removable = true; take(); }
  const finished = take(), finish = finishRow.exec(finished?.text ?? "");
  const detail = c.profile === "test" ? "unoptimized + debuginfo" : c.profile === "release" ? "optimized" : "optimized + debuginfo";
  if (!finished || !finish || finish[1] !== c.profile || finish[2] !== detail ||
      !seconds(finish[4]!, finish[3] !== undefined) || (finish[3] !== undefined && (!uint(finish[3]) || Number(finish[3]) < 1))) return undefined;
  const kept: Line[] = [finished], executables = new Set<string>(), docs = new Set<string>();
  const mode = c.profile === "test" ? "debug" : c.profile;
  let suites = 0;
  blanks();
  while (row) {
    const header = take()!, executable = executableRow.exec(header.text), doc = docHeader.exec(header.text);
    if (!executable && !doc) return undefined;
    const isDoc = Boolean(doc), context = executable?.[1] ?? doc![1]!;
    if (!allowedContext(context, isDoc, c)) return undefined;
    if (executable) {
      const [, , , target, profile, kind, name] = executable;
      const identity = `${target ?? ""}/${profile}/${kind}/${name}`;
      if (target !== c.target || profile !== mode || executables.has(identity)) return undefined;
      const example = context.startsWith("unittests examples/");
      if (kind !== (example ? "examples" : "deps")) return undefined;
      executables.add(identity);
    } else {
      if (docs.has(context)) return undefined;
      docs.add(context);
    }
    suites++; kept.push(header); blanks();
    const run = /^running (\d+) (test|tests)$/.exec(take()?.text ?? ""), total = uint(run?.[1]);
    if (total === undefined || run?.[2] !== (total === 1 ? "test" : "tests") || (c.filter && total > 1)) return undefined;
    const names = new Set<string>();
    let passed = 0, ignored = 0;
    while (row?.text.startsWith("test ") && !row.text.startsWith("test result:")) {
      const test = take()!, match = (isDoc ? docRow : nameRow).exec(test.text);
      if (!match || names.has(match[1]!) || (isDoc && uint(match[2]) === undefined)) return undefined;
      const name = match[1]!, status = match[isDoc ? 3 : 2]!;
      if ((c.filter && name !== c.filter) || [...c.skips].some(skip => name.includes(skip))) return undefined;
      names.add(name);
      if (status === "ok") { passed++; removable = true; }
      else {
        if (c.ignored || c.includeIgnored) return undefined;
        ignored++; kept.push(test);
      }
    }
    blanks();
    const summary = take(), result = summaryRow.exec(summary?.text ?? "");
    if (!summary || !result || uint(result[1]) !== passed || uint(result[2]) !== ignored || passed + ignored !== total ||
        uint(result[3]) === undefined || !seconds(result[4]!) ||
        (!c.filter && !c.skips.size && !c.ignored && uint(result[3]) !== 0)) return undefined;
    kept.push(summary); blanks();
    if (isDoc && row && docMetrics.test(row.text)) {
      const metrics = docMetrics.exec(row.text)!;
      if (!seconds(metrics[1]!) || !seconds(metrics[2]!)) return undefined;
      kept.push(take()!); blanks();
    }
  }
  if (!suites || !removable || (c.selector === "lib" && c.packages.size && suites !== c.packages.size)) return undefined;
  return reduction(kept);
}

const expanded = nativeProfile("cargo-test", argv => legacy.match(argv) || command(argv) !== undefined,
  (output: string, observation: Observation) => {
    const argv = tokenizeCommand(observation.command);
    if (!argv) return undefined;
    // A declined legacy grammar stays declined; no broad fallback on legacy argv.
    if (legacy.match(argv)) return legacy.reduce(output, observation);
    const c = command(argv);
    return c ? delta(output, c) : undefined;
  });
export const familyProfiles: readonly Profile[] = [expanded];
