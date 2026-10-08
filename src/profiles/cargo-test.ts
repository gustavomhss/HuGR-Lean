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
const identifier = "[A-Za-z_][A-Za-z0-9_-]{0,63}";
const token = new RegExp(`^${identifier}$`);
const tripleSyntax = "[A-Za-z0-9_]{1,32}(?:-[A-Za-z0-9_]{1,32}){1,5}";
const tripleArg = new RegExp(`^${tripleSyntax}$`);
type Selector = "lib" | "doc" | "all-targets" | "examples" | "test" | "bin" | "example";
interface Command {
  selector?: Selector; selected?: string; target?: string; filter?: string;
  profile: string; packages: Set<string>; workspace: boolean;
  exact: boolean; ignored: boolean; includeIgnored: boolean; skips: Set<string>;
}

/** Closed delta argv. Log-emitting/quiet/list flags are refusal-only, never no-noise. */
function command(argv: readonly string[]): Command | undefined {
  if (argv[0] !== "cargo" || argv[1] !== "test" || argv.length > 64) return undefined;
  const result: Command = { profile: "test", packages: new Set(), workspace: false,
    exact: false, ignored: false, includeIgnored: false, skips: new Set() };
  const seen = new Set<string>(), exclusions = new Set<string>();
  let harness = false, features = false, allFeatures = false;
  function once(key: string): boolean { if (seen.has(key)) return false; seen.add(key); return true; }
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--" && !harness && i + 1 < argv.length) { harness = true; continue; }
    if (harness) {
      if (arg === "--exact" && once("exact")) result.exact = true;
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
    else if (arg === "--profile" && once("profile")) {
      const value = argv[++i];
      if (!value || !token.test(value)) return undefined;
      result.profile = value;
    } else if (arg === "--target" && once("target")) {
      const value = argv[++i];
      if (!value || value.length > 128 || !tripleArg.test(value)) return undefined;
      result.target = value;
    }
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
      (result.filter && !result.exact) || (result.selector === "doc" && harness)) return undefined;
  return result;
}

const compileRow = /^   Compiling [A-Za-z0-9_-]+ v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?: \([^()]+\))?$/;
const finishRow = new RegExp(`^    Finished \u0060(${identifier})\u0060 profile \\[(unoptimized|optimized)(?: \\+ (debuginfo))?\\] target\\(s\\) in (?:(\\d+)m )?(\\d+(?:\\.\\d+)?)s$`);
const summaryRow = /^test result: ok\. (\d+) passed; 0 failed; (\d+) ignored; 0 measured; (\d+) filtered out; finished in (\d+(?:\.\d+)?)s$/;
const executableRow = new RegExp(`^     Running ((?:unittests )?([^\\s()]+\\.rs)) \\(((?:/[^\\s()]+/)?target/(?:(` +
  `${tripleSyntax})/)?(${identifier})/(deps|examples)/([^/\\s()]+))\\)$`);
const docHeader = /^   Doc-tests ([A-Za-z0-9_-]+)$/;
const docMetrics = /^all doctests ran in (\d+(?:\.\d+)?)s; merged doctests compilation took (\d+(?:\.\d+)?)s$/;
function seconds(text: string, minute = false): boolean {
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && (!minute || n < 60);
}
function allowedExecutable(context: string, source: string, kind: string, name: string, c: Command): boolean {
  // Manifest source paths are independent of target names; do not invent src/bin/NAME or tests/NAME.
  if (source.length > 1024 || source.includes("\\") || source.includes("//")) return false;
  const unit = context.startsWith("unittests ");
  if (kind === "examples" && !unit) return false;
  if (c.selected) {
    const identity = /^([A-Za-z_][A-Za-z0-9_-]{0,63})-[0-9a-f]{16}$/.exec(name);
    if (!identity || identity[1] !== c.selected.replaceAll("-", "_")) return false;
  }
  switch (c.selector) {
    case "doc": return false;
    case "lib": case "bin": return unit && kind === "deps";
    case "test": return !unit && kind === "deps";
    case "example": case "examples": return unit && kind === "examples";
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
  // Optimization/debug detail is project-configured. Validate its finite syntax, never infer it from a name.
  if (!finished || !finish || finish[1] !== c.profile ||
      !seconds(finish[5]!, finish[4] !== undefined) || (finish[4] !== undefined && (!uint(finish[4]) || Number(finish[4]) < 1))) return undefined;
  const kept: Line[] = [finished], executables = new Set<string>(), docs = new Set<string>();
  const mode = c.profile === "test" || c.profile === "dev" ? "debug" : c.profile;
  let suites = 0;
  blanks();
  while (row) {
    const header = take()!, executable = executableRow.exec(header.text), doc = docHeader.exec(header.text);
    if (!executable && !doc) return undefined;
    const isDoc = Boolean(doc), context = executable?.[1] ?? doc![1]!;
    if (executable) {
      const [, , source, , target, profile, kind, name] = executable;
      const identity = `${target ?? ""}/${profile}/${kind}/${name}`;
      if (target !== c.target || profile !== mode || executables.has(identity)) return undefined;
      if (!allowedExecutable(context, source!, kind!, name!, c)) return undefined;
      executables.add(identity);
    } else {
      if (c.selector !== undefined && c.selector !== "doc") return undefined;
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
      if ((c.filter && name !== c.filter) || [...c.skips].some(skip => c.exact ? name === skip : name.includes(skip))) return undefined;
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
