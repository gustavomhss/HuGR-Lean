import { lines } from "../core/lines.js";
import type { Observation, Piece, Profile, Reduction, Span } from "../core/types.js";

type Draft = { pieces: Piece[]; required: Span[] };
const draft = (): Draft => ({ pieces: [], required: [] });
function keep(result: Draft, span: Span): void { result.pieces.push(span); result.required.push(span); }
function safe(output: string, observation: Observation): boolean {
  return observation.source === "shell" && observation.completeness === "complete" &&
    observation.termination.kind === "exited" && observation.termination.code === 0 &&
    output.length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]|\r(?!\n)/u.test(output);
}
function args(argv: readonly string[], tool: string): readonly string[] | undefined {
  if (argv[0] === tool) return argv.slice(1);
  if (argv[0] === "npx" && argv[1] === tool) return argv.slice(2);
  if (argv[0] === "npx" && argv[1] === "--no-install" && argv[2] === tool) return argv.slice(3);
  return undefined;
}
function numberedRipgrep(argv: readonly string[]): boolean {
  const options = args(argv, "rg");
  if (!options) return false;
  let numbered = false;
  const switches = ["--with-filename", "--no-filename", "--no-heading", "--ignore-case", "--case-sensitive", "--smart-case", "--word-regexp", "--line-regexp", "--invert-match", "--fixed-strings", "--text", "--hidden", "--no-ignore", "--no-ignore-vcs", "--color=never"];
  const values = ["-e", "--regexp", "-f", "--file", "-g", "--glob", "--iglob", "-t", "--type", "-T", "--type-not", "-E", "--encoding", "-m", "--max-count", "--max-depth", "-j", "--threads"];
  for (let index = 0; index < options.length; index++) {
    const option = options[index]!;
    if (option === "--") break;
    if (option === "--line-number" || option === "--no-line-number") { numbered = option === "--line-number"; continue; }
    if (/^-[nNHIiSswxvFa]+$/u.test(option)) {
      for (const flag of option.slice(1)) if (flag === "n" || flag === "N") numbered = flag === "n";
      continue;
    }
    if (switches.includes(option)) continue;
    if (option === "--color") { if (options[++index] !== "never") return false; continue; }
    if (values.includes(option)) { if (options[++index] === undefined) return false; continue; }
    if (option.startsWith("--") && values.includes(option.split("=", 1)[0]!) && option.includes("=")) continue;
    if (option.startsWith("-") && option !== "-") return false;
  }
  return numbered;
}
function equalCounts(text: string, pattern: RegExp, expected?: number): boolean {
  const match = pattern.exec(text);
  return !!match && Number.isSafeInteger(Number(match[1])) && Number(match[1]) === Number(match[2]) &&
    (expected === undefined || Number(match[1]) === expected);
}

function jest(output: string, observation: Observation): Reduction | undefined {
  if (!safe(output, observation)) return undefined;
  const rows = lines(output), result = draft(), tests: number[] = [], headings: number[] = [];
  let index = 0, pending = false;
  for (; index < rows.length; index++) {
    const line = rows[index]!, text = line.text;
    if (text.startsWith("Test Suites:")) break;
    if (text === "") { keep(result, line.span); continue; }
    if (/^ ?PASS .+$/u.test(text)) {
      if (pending) return undefined;
      tests.push(0); headings.length = 0;
      // Config-only reporters can emit native-shaped user evidence, markers included.
      keep(result, line.span); continue;
    }
    const leaf = /^( {2,})✓ (.+)$/u.exec(text);
    const heading = /^( {2,})([^\s✓○✎].*)$/u.exec(text);
    const detail = leaf ?? heading;
    if (!detail || tests.length === 0) return undefined;
    const indent = detail[1]!.length;
    if (pending && indent !== headings.at(-1)! + 2) return undefined;
    while (headings.length && headings.at(-1)! >= indent) headings.pop();
    if (indent !== (headings.at(-1) ?? 0) + 2) return undefined;
    pending = !leaf;
    if (leaf) {
      tests[tests.length - 1]!++;
      keep(result, line.span);
    } else { headings.push(indent); keep(result, line.span); }
  }
  if (pending || !tests.length || !equalCounts(rows[index]?.text ?? "", /^Test Suites: +(\d+) passed, (\d+) total$/u, tests.length)) return undefined;
  keep(result, rows[index++]!.span);
  const total = tests.reduce((sum, count) => sum + count, 0);
  if (total && tests.some((count) => count === 0)) return undefined;
  if (!equalCounts(rows[index]?.text ?? "", /^Tests: +([1-9]\d*) passed, ([1-9]\d*) total$/u, total || undefined)) return undefined;
  keep(result, rows[index++]!.span);
  if (rows[index]?.text.startsWith("Snapshots:")) {
    const text = rows[index]!.text;
    if (!/^Snapshots: +0 total$/u.test(text) && !equalCounts(text, /^Snapshots: +(\d+) passed, (\d+) total$/u)) return undefined;
    keep(result, rows[index++]!.span);
  }
  if (/^Seed: +-?\d+$/u.test(rows[index]?.text ?? "")) keep(result, rows[index++]!.span);
  if (/^Time: +\d+(?:\.\d+)? s(?:, estimated \d+(?:\.\d+)? s)?$/u.test(rows[index]?.text ?? "")) keep(result, rows[index++]!.span);
  if (/^Ran all test suites(?: matching .+)?\.$/u.test(rows[index]?.text ?? "")) keep(result, rows[index++]!.span);
  if (rows.slice(index).some((line) => line.text !== "")) return undefined;
  for (const line of rows.slice(index)) keep(result, line.span);
  return result;
}

function vitest(output: string, observation: Observation): Reduction | undefined {
  if (!safe(output, observation)) return undefined;
  const rows = lines(output), result = draft();
  let index = 0, files = 0, tests = 0, banner = false;
  for (; index < rows.length; index++) {
    const line = rows[index]!, text = line.text;
    if (text.startsWith(" Test Files")) break;
    if (text === "") { keep(result, line.span); continue; }
    if (!files && !banner && /^ RUN  v\d+\.\d+\.\d+(?:[-+][\w.-]+)? .+$/u.test(text)) { banner = true; keep(result, line.span); continue; }
    const match = /^ ✓ (.+) \(([1-9]\d*) tests?\)(?: (\d+(?:\.\d+)?)ms)?$/u.exec(text);
    if (!match) return undefined;
    files++; tests += Number(match[2]);
    // Configured reporters can emit this entire grammar as user evidence.
    keep(result, line.span);
  }
  if (!files || !equalCounts(rows[index]?.text ?? "", /^ Test Files +(\d+) passed \((\d+)\)$/u, files)) return undefined;
  keep(result, rows[index++]!.span);
  if (!equalCounts(rows[index]?.text ?? "", /^ {6}Tests +(\d+) passed \((\d+)\)$/u, tests)) return undefined;
  keep(result, rows[index++]!.span);
  if (!/^ {3}Start at +(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/u.test(rows[index]?.text ?? "")) return undefined;
  keep(result, rows[index++]!.span);
  const stage = "(?:transform|setup|collect|import|tests|environment|prepare) \\d+(?:\\.\\d+)?(?:ms|s)";
  if (!new RegExp(`^ {3}Duration +\\d+(?:\\.\\d+)?(?:ms|s)(?: \\(${stage}(?:, ${stage})*\\))?$`, "u").test(rows[index]?.text ?? "")) return undefined;
  keep(result, rows[index++]!.span);
  if (rows.slice(index).some((line) => line.text !== "")) return undefined;
  for (const line of rows.slice(index)) keep(result, line.span);
  return result;
}

const sections = ["Changes to be committed:", "Unmerged paths:", "Changes not staged for commit:", "Untracked files:"];
const hints = [
  ['(use "git restore --staged <file>..." to unstage)'],
  ['(use "git restore --staged <file>..." to unstage)', '(use "git add <file>..." to mark resolution)'],
  ['(use "git add <file>..." to update what will be committed)', '(use "git add/rm <file>..." to update what will be committed)', '(use "git restore <file>..." to discard changes in working directory)', '(commit or discard the untracked or modified content in submodules)'],
  ['(use "git add <file>..." to include in what will be committed)'],
];
const branchHints = ['(use "git push" to publish your local commits)', '(use "git pull" to update your local branch)', '(use "git pull" to merge the remote branch into yours)', '(use "git branch --unset-upstream" to fixup)'];
const mergeHints = ['(fix conflicts and run "git commit")', '(use "git merge --abort" to abort the merge)', '(use "git commit" to conclude merge)'];
function gitPath(path: string): boolean {
  // Deliberately exclude quoting/escapes and punctuation with structural meanings.
  return !/["'\\]/u.test(path) && !path.includes(" -> ") &&
    /^[\p{L}\p{M}\p{N}\p{S}_./@+-]+(?: +[\p{L}\p{M}\p{N}\p{S}_./@+-]+)*$/u.test(path);
}
function gitEntry(text: string, section: number): boolean {
  if (section === 3) return gitPath(/^(?:\t|  )(.+)$/u.exec(text)?.[1] ?? "");
  const labels = section === 1 ? "both modified|both added|both deleted|added by us|added by them|deleted by us|deleted by them" : "modified|new file|deleted|renamed|copied|typechange";
  const entry = new RegExp(`^(?:\\t|  )(${labels}): +(.+)$`, "u").exec(text);
  if (!entry) return false;
  if (entry[1] === "renamed" || entry[1] === "copied") {
    const paths = entry[2]!.split(" -> ");
    return paths.length === 2 && paths.every(gitPath);
  }
  const annotation = section === 2 && entry[1] === "modified" ? /^(.+) \((?:new commits(?:, modified content)?(?:, untracked content)?|modified content(?:, untracked content)?|untracked content)\)$/u.exec(entry[2]!) : null;
  return gitPath(annotation?.[1] ?? entry[2]!);
}
function gitStatus(output: string, observation: Observation): Reduction | undefined {
  if (!safe(output, observation)) return undefined;
  const rows = lines(output), result = draft(), counts = [0, 0, 0, 0];
  if (!/^(?:On branch .+|HEAD detached (?:at|from) .+|Not currently on any branch\.)$/u.test(rows[0]!.text)) return undefined;
  keep(result, rows[0]!.span);
  let section = -1, tracking = false, merge = "", initial = false, footer = false, removed = false;
  const seenHints = new Set<string>();
  let preambleHints: readonly string[] = [];
  for (let index = 1; index < rows.length; index++) {
    const line = rows[index]!, text = line.text;
    if (text === "") { keep(result, line.span); continue; }
    if (footer) return undefined;
    const hint = /^(?:  |\t)(\(.+\))$/u.exec(text)?.[1];
    if (hint && (section < 0 ? preambleHints.includes(hint) : counts[section] === 0 && hints[section]!.includes(hint))) {
      if (seenHints.has(hint + section)) return undefined;
      seenHints.add(hint + section); removed = true; continue;
    }
    if (hint) return undefined;
    const next = sections.indexOf(text);
    if (next !== -1) {
      if (next <= section || (section >= 0 && counts[section] === 0)) return undefined;
      section = next; keep(result, line.span); continue;
    }
    if (section < 0 && !tracking && /^Your branch (?:is up to date with '.+'\.|is ahead of '.+' by [1-9]\d* commits?\.|is behind '.+' by [1-9]\d* commits?, and can be fast-forwarded\.|is based on '.+', but the upstream is gone\.|and '.+' have diverged,)$/u.test(text)) {
      tracking = true; keep(result, line.span);
      const hintIndex = text.includes("is ahead") ? 0 : text.includes("is behind") ? 1 : text.endsWith("have diverged,") ? 2 : text.endsWith("the upstream is gone.") ? 3 : -1;
      if (hintIndex >= 0) preambleHints = [...preambleHints, branchHints[hintIndex]!];
      if (text.endsWith("have diverged,")) {
        if (!/^and have [1-9]\d* and [1-9]\d* different commits each, respectively\.$/u.test(rows[index + 1]?.text ?? "")) return undefined;
        keep(result, rows[++index]!.span);
      }
      continue;
    }
    if (section < 0 && !initial && (text === "No commits yet" || text === "Initial commit")) { initial = true; keep(result, line.span); continue; }
    if (section < 0 && !merge && (text === "You have unmerged paths." || text === "All conflicts fixed but you are still merging.")) {
      merge = text; preambleHints = [...preambleHints, ...(text.startsWith("You have") ? mergeHints.slice(0, 2) : mergeHints.slice(2))];
      keep(result, line.span); continue;
    }
    const clean = text === "nothing to commit, working tree clean" || text === 'nothing to commit (create/copy files and use "git add" to track)';
    const unstaged = text === 'no changes added to commit (use "git add" and/or "git commit -a")';
    const untracked = text === 'nothing added to commit but untracked files present (use "git add" to track)';
    if (clean || unstaged || untracked) {
      if ((clean && counts.some(Boolean)) || (unstaged && (counts[0] !== 0 || !(counts[1]! + counts[2]!))) || (untracked && (counts[0]! + counts[1]! + counts[2]! !== 0 || !counts[3]))) return undefined;
      footer = true; keep(result, line.span); continue;
    }
    if (section < 0 || !gitEntry(text, section)) return undefined;
    counts[section]!++; keep(result, line.span);
  }
  if ((tracking || initial) && !rows[0]!.text.startsWith("On branch ")) return undefined;
  if (tracking && initial) return undefined;
  if (merge === "You have unmerged paths." && !counts[1]) return undefined;
  if (merge.startsWith("All conflicts") && (counts[1] || !counts[0])) return undefined;
  if (counts[0] === 0 && !merge && !footer) return undefined;
  return removed && (section < 0 ? footer : counts[section]! > 0) ? result : undefined;
}

function ripgrep(output: string, observation: Observation): Reduction | undefined {
  if (!safe(output, observation)) return undefined;
  const rows = lines(output), result = draft();
  const records = rows.map((line) => /^([^:]+):([1-9]\d*):(.*)$/u.exec(line.text));
  // Multiple numeric delimiters could be a colon-bearing path or --column output.
  if (records.some((record, index) => !record || /^\d+$/u.test(record[1]!) || [...rows[index]!.text.matchAll(/(?=:\d+:)/gu)].length !== 1)) return undefined;
  let grouped = false;
  for (let index = 0; index < rows.length;) {
    const path = records[index]![1]!;
    let end = index + 1;
    while (end < rows.length && records[end]![1] === path) end++;
    if (end === index + 1) { keep(result, rows[index]!.span); index = end; continue; }
    grouped = true;
    keep(result, [rows[index]!.span[0], rows[index]!.span[0] + path.length]);
    result.pieces.push({ text: ":\n" });
    for (; index < end; index++) keep(result, [rows[index]!.span[0] + path.length + 1, rows[index]!.span[1]]);
  }
  return grouped ? result : undefined;
}

export const formatProfiles: readonly Profile[] = [
  { id: "jest", match: (argv) => args(argv, "jest")?.every((arg) => !arg.startsWith("--reporter")) ?? false, reduce: jest },
  { id: "vitest", match: (argv) => args(argv, "vitest")?.every((arg) => !arg.startsWith("--reporter")) ?? false, reduce: vitest },
  { id: "git-status", match: (argv) => args(argv, "git")?.[0] === "status", reduce: gitStatus },
  { id: "rg", match: numberedRipgrep, reduce: ripgrep },
  // Plain diagnostics have multiline continuations and ambiguous path/position syntax.
  { id: "tsc", match: (argv) => args(argv, "tsc") !== undefined, reduce: () => undefined },
];
