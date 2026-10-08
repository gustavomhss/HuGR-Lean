import { tokenizeCommand } from "../core/command.js";
import { lines } from "../core/lines.js";
import type { Line, Observation, Reduction } from "../core/types.js";
import { blankEnd, nativeProfile, reduction, uint } from "./runner-utils.js";

function invocation(argv: readonly string[]): { quiet: boolean } | undefined {
  let end: number;
  if (argv[0] === "pytest") end = 1;
  else if ((argv[0] === "python" || argv[0] === "python3") && argv[1] === "-m" && argv[2] === "pytest") end = 3;
  else return undefined;
  const flags = new Set<string>();
  for (const arg of argv.slice(end)) {
    if (["-q", "--color=no", "--doctest-modules"].includes(arg)) {
      if (flags.has(arg)) return undefined;
      flags.add(arg);
    } else {
      // Literal relative files/directories only; no node IDs, globs or option values.
      if (arg === "." || arg === "./") continue;
      const path = arg.startsWith("./") ? arg.slice(2) : arg;
      if (!/^[A-Za-z0-9_][A-Za-z0-9_. /-]*$/.test(path) ||
          path.split("/").some((part, i, parts) => part === "." || part === ".." || (part === "" && i !== parts.length - 1))) return undefined;
    }
  }
  return { quiet: flags.has("-q") };
}

interface Totals { passed: number; skipped: number; warnings: number; subtests: number }
function footer(text: string, quiet: boolean): Totals | undefined {
  const body = quiet ? text : /^={3,} (.+) ={3,}$/.exec(text)?.[1];
  const timing = /^(.+) in (\d+(?:\.\d+)?)s$/.exec(body ?? "");
  if (!timing || !Number.isFinite(Number(timing[2]))) return undefined;
  const totals: Totals = { passed: 0, skipped: 0, warnings: 0, subtests: 0 };
  let last = -1;
  for (const entry of timing[1]!.split(", ")) {
    const field = /^(\d+) (passed|skipped|warning|warnings|subtests passed)$/.exec(entry);
    const count = uint(field?.[1]);
    if (!field || count === undefined || count === 0) return undefined;
    const label = field[2]!;
    const key = label.startsWith("warning") ? "warnings" : label === "subtests passed" ? "subtests" : label as "passed" | "skipped";
    const order = ["passed", "skipped", "warnings", "subtests"].indexOf(key);
    if (order <= last || (!quiet && key === "subtests") ||
        (key === "warnings" && label !== (count === 1 ? "warning" : "warnings"))) return undefined;
    totals[key] = count; last = order;
  }
  if (totals.passed + totals.skipped === 0 ||
      !Number.isSafeInteger(totals.passed + totals.skipped + totals.subtests + totals.warnings)) return undefined;
  return totals;
}

function pytest(rows: readonly Line[], observation: Observation): Reduction | undefined {
  const argv = tokenizeCommand(observation.command), mode = argv && invocation(argv);
  if (!mode) return undefined;
  const quiet = mode.quiet, kept = new Set<Line>();
  let i = 0;
  let collected: number | undefined;
  if (!quiet) {
    if (!/^={3,} test session starts ={3,}$/.test(rows[i++]?.text ?? "")) return undefined;
    const platform = rows[i++], root = rows[i++];
    // Reporter/version pair measured with native pytest; other versions stay exact.
    if (!platform || !/^platform (?:darwin|linux|win32) -- Python 3\.\d+\.\d+, pytest-9\.0\.3, pluggy-1\.6\.0$/.test(platform.text) ||
        !root || !/^rootdir: \S.*$/.test(root.text)) return undefined;
    kept.add(platform); kept.add(root);
    if (rows[i]?.text.startsWith("configfile: ")) {
      const config = rows[i++]!;
      if (!/^configfile: [^\r\n]+\.(?:toml|ini|cfg)$/.test(config.text)) return undefined;
      kept.add(config);
    }
    const collection = /^collected (\d+) (item|items)$/.exec(rows[i++]?.text ?? "");
    collected = uint(collection?.[1]);
    if (collected === undefined || collected === 0 || collection?.[2] !== (collected === 1 ? "item" : "items")) return undefined;
    while (rows[i]?.text === "") i++;
  }
  let passed = 0, parentsSkipped = 0, subtests = 0, subSkipped = 0;
  const files = new Set<string>();
  const progress: { parents: number; percent: number }[] = [];
  let context: Line | undefined;
  while (rows[i]) {
    const row = rows[i]!;
    const named = quiet ? null : /^(\S+\.py) ([.s]+) +\[ *(\d+)%\]$/.exec(row.text);
    const wrapped = /^(\S+) +\[ *(\d+)%\]$/.exec(row.text);
    if (!named && (!wrapped || !(quiet ? /^[.us-]+$/ : /^[.s]+$/).test(wrapped[1]!))) break;
    if (named) {
      if (files.has(named[1]!)) return undefined;
      files.add(named[1]!); context = row;
    } else if (!quiet && !context) return undefined; // Never admit unbound wrapped progress.
    const marks = named ? named[2]! : wrapped![1]!;
    const percent = uint(named ? named[3] : wrapped![2]);
    if (percent === undefined || percent > 100) return undefined;
    for (const mark of marks) {
      if (mark === ".") passed++;
      else if (mark === "s") parentsSkipped++;
      else if (mark === "u") subtests++;
      else subSkipped++;
    }
    progress.push({ parents: passed + parentsSkipped, percent });
    if (/[su-]/.test(marks)) {
      kept.add(row);
      // Legacy unwrapped passing rows remain removable; wrapped skips retain their filename.
      if (!quiet && !named) kept.add(context!);
    }
    i++;
  }
  const parents = passed + parentsSkipped, skipped = parentsSkipped + subSkipped;
  if (progress.length === 0 || parents === 0 || (collected !== undefined && collected !== parents)) return undefined;
  for (const row of progress) {
    if (row.percent !== Math.floor(row.parents * 100 / parents)) return undefined;
  }

  while (rows[i]?.text === "") i++;
  let warningCount = 0;
  if (/^={3,} warnings summary ={3,}$/.test(rows[i]?.text ?? "")) {
    const start = i++;
    const contexts = new Set<string>();
    while (rows[i]?.text !== "-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html") {
      const paths: string[] = [];
      while (/^(\S+\.py)::\S+$/.test(rows[i]?.text ?? "")) {
        const row = rows[i++]!, path = row.text.slice(0, row.text.indexOf("::"));
        if (contexts.has(row.text) || (!quiet && !files.has(path))) return undefined;
        contexts.add(row.text); paths.push(path); warningCount++;
      }
      const warning = /^  (.+\.py):(\d+): UserWarning: (\S.*)$/.exec(rows[i++]?.text ?? "");
      const location = uint(warning?.[2]);
      if (paths.length === 0 || !warning || location === undefined || location === 0 ||
          paths.some(path => warning[1] !== path && !warning[1]!.endsWith(`/${path}`))) return undefined;
      // Only known native warning source continuations; all are protected, never discarded.
      let sourceRows = 0;
      while (/^    \S.*$/.test(rows[i]?.text ?? "")) { sourceRows++; i++; }
      if (sourceRows === 0 || rows[i++]?.text !== "") return undefined;
    }
    if (warningCount === 0) return undefined;
    i++; // Exact Docs terminator, including its original newline.
    for (let n = start; n < i; n++) kept.add(rows[n]!);
  }

  if (/^={3,} short test summary info ={3,}$/.test(rows[i]?.text ?? "")) {
    kept.add(rows[i++]!);
    const records = new Set<string>();
    let reasons = 0, subReasons = 0;
    while (rows[i]?.text.startsWith("SKIPPED") || rows[i]?.text.startsWith("SUBSKIPPED")) {
      const row = rows[i++]!;
      const record = /^(SKIPPED|SUBSKIPPED\(case='skip'\)) \[(\d+)\] (\S+\.py):(\d+): (\S.*)$/.exec(row.text);
      const count = uint(record?.[2]), location = uint(record?.[4]);
      if (!record || (!quiet && record[1] !== "SKIPPED") || count === undefined || count === 0 ||
          location === undefined || location === 0 || (!quiet && !files.has(record[3]!))) return undefined;
      const key = `${record[3]}:${record[4]}`;
      if (records.has(key)) return undefined;
      records.add(key); reasons += count;
      if (record[1]!.startsWith("SUBSKIPPED")) subReasons += count;
      if (!Number.isSafeInteger(reasons)) return undefined;
      kept.add(row);
    }
    if (records.size === 0 || reasons !== skipped) return undefined;
    // Native quiet labels can also name an ordinary skip SUBSKIPPED, but only in
    // a stream containing actual '-' subskip evidence. Never invent that context.
    if (quiet && (subReasons < subSkipped || (subReasons > 0 && subSkipped === 0))) return undefined;
  }
  const summary = rows[i++];
  const totals = summary && footer(summary.text, quiet);
  if (!summary || !totals || !blankEnd(rows, i)) return undefined;
  if (totals.passed !== passed || totals.skipped !== skipped || totals.subtests !== subtests || totals.warnings !== warningCount) return undefined;
  kept.add(summary);
  const retained = rows.filter(row => kept.has(row));
  return reduction(retained);
}

export const pytestProfile = nativeProfile("pytest", argv => invocation(argv) !== undefined,
  (output, observation) => pytest(lines(output), observation));
