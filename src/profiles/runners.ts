import { iterateLines, lines } from "../core/lines.js";
import type { Line, Observation, Profile, Reduction } from "../core/types.js";

// Success-only native grammars. Diagnostics, plugins, captured logs, parallel Go
// tests, nested suites and any unrecognized row cause exact passthrough.
type Parser = (output: string) => Reduction | undefined;

function uint(value: string | undefined): number | undefined {
  if (value === undefined || !/^(?:0|[1-9]\d*)$/.test(value)) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
}

function reduction(kept: readonly Line[]): Reduction {
  const spans = kept.map((line) => line.span);
  return { pieces: spans, required: spans };
}

function blankEnd(rows: readonly Line[], start: number): boolean {
  return rows.slice(start).every((line) => line.text === "");
}

function nativeProfile(id: string, match: Profile["match"], parse: Parser): Profile {
  return {
    id, match,
    reduce(output: string, observation: Observation) {
      if (observation.source !== "shell" || observation.completeness !== "complete" ||
          observation.termination.kind !== "exited" || observation.termination.code !== 0 ||
          /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]|\r(?!\n)/.test(output)) return undefined;
      return parse(output);
    },
  };
}

function cargoIdentity(argv: readonly string[], subcommand: string): boolean {
  return argv[0] === "cargo" && argv[1] === subcommand && (
    argv.length === 2 ||
    (argv.length === 3 && argv[2] === "--color=never") ||
    (argv.length === 4 && argv[2] === "--color" && argv[3] === "never")
  );
}

const compiling = /^   Compiling [A-Za-z0-9_-]+ v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?: \([^()]+\))?$/;
const rustName = "[\\p{L}_][\\p{L}\\p{N}_]*(?:::[\\p{L}_][\\p{L}\\p{N}_]*)*";
const rustTest = new RegExp(`^test (${rustName}) \\.\\.\\. (ok|ignored(?:, .+)?)$`, "u");

function cargo(output: string, testing: boolean): Reduction | undefined {
  const rows = iterateLines(output);
  let current = rows.next().value ?? undefined;
  function take(): Line | undefined {
    const line = current;
    current = rows.next().value ?? undefined;
    return line;
  }
  while (current && compiling.test(current.text)) take();
  const finished = take();
  const mode = testing ? "test" : "dev";
  if (!finished || !new RegExp(
    `^    Finished \`${mode}\` profile \\[unoptimized \\+ debuginfo\\] target\\(s\\) in \\d+(?:\\.\\d+)?s$`,
  ).test(finished.text)) return undefined;
  const kept: Line[] = [finished];
  if (!testing) return current === undefined ? reduction(kept) : undefined;

  const running = take();
  if (!running || !/^     Running (?:unittests [^\s()]+\.rs|tests\/[^\s()]+\.rs) \(target\/debug\/deps\/[^\s()]+\)$/.test(running.text)) return undefined;
  kept.push(running);
  while (current?.text === "") take();
  const count = /^running (\d+) (test|tests)$/.exec(take()?.text ?? "");
  const total = uint(count?.[1]);
  if (total === undefined || count?.[2] !== (total === 1 ? "test" : "tests")) return undefined;
  let passed = 0;
  let ignored = 0;
  const names = new Set<string>();
  while (current?.text.startsWith("test ")) {
    const line = take()!;
    const test = rustTest.exec(line.text);
    if (!test || names.has(test[1]!)) return undefined;
    names.add(test[1]!);
    if (test[2] === "ok") passed++;
    else { ignored++; kept.push(line); }
  }
  while (current?.text === "") take();
  const summary = take();
  const result = /^test result: ok\. (\d+) passed; 0 failed; (\d+) ignored; 0 measured; (\d+) filtered out; finished in \d+(?:\.\d+)?s$/.exec(summary?.text ?? "");
  if (!summary || !result || uint(result[1]) !== passed || uint(result[2]) !== ignored ||
      uint(result[3]) === undefined || passed + ignored !== total) return undefined;
  while (current?.text === "") take();
  if (current !== undefined) return undefined;
  kept.push(summary);
  return reduction(kept);
}

function pytestIdentity(argv: readonly string[]): boolean {
  let end: number;
  if (argv[0] === "pytest") end = 1;
  else if ((argv[0] === "python" || argv[0] === "python3") && argv[1] === "-m" && argv[2] === "pytest") end = 3;
  else return false;
  return argv.length === end || (argv.length === end + 1 && argv[end] === "--color=no");
}

function pytest(rows: readonly Line[]): Reduction | undefined {
  let i = 0;
  if (!/^={3,} test session starts ={3,}$/.test(rows[i++]?.text ?? "")) return undefined;
  const platform = rows[i++];
  // Reporter/version pair measured with native pytest; other versions stay exact.
  if (!platform || !/^platform (?:darwin|linux|win32) -- Python 3\.\d+\.\d+, pytest-9\.0\.3, pluggy-1\.6\.0$/.test(platform.text)) return undefined;
  const root = rows[i++];
  if (!root || !/^rootdir: \S.*$/.test(root.text)) return undefined;
  const kept: Line[] = [platform, root];
  if (rows[i]?.text.startsWith("configfile: ")) {
    const config = rows[i++]!;
    if (!/^configfile: [^\r\n]+\.(?:toml|ini|cfg)$/.test(config.text)) return undefined;
    kept.push(config);
  }
  const collection = /^collected (\d+) (item|items)$/.exec(rows[i++]?.text ?? "");
  const total = uint(collection?.[1]);
  if (total === undefined || total === 0 || collection?.[2] !== (total === 1 ? "item" : "items")) return undefined;
  while (rows[i]?.text === "") i++;
  let passed = 0;
  let skipped = 0;
  const files = new Set<string>();
  while (rows[i] && !rows[i]!.text.startsWith("=")) {
    const line = rows[i++]!;
    if (line.text === "") break;
    const progress = /^([^\s]+\.py) ([.s]+) +\[ *(\d+)%\]$/.exec(line.text);
    if (!progress || files.has(progress[1]!)) return undefined;
    files.add(progress[1]!);
    for (const mark of progress[2]!) {
      if (mark === ".") passed++;
      else skipped++;
    }
    if (passed + skipped > total || uint(progress[3]) !== Math.floor((passed + skipped) * 100 / total)) return undefined;
    // Mixed rows carry file/skip evidence, so retain the whole native row.
    if (progress[2]!.includes("s")) kept.push(line);
  }
  while (rows[i]?.text === "") i++;
  const summary = rows[i++];
  const result = /^={3,} (?:(\d+) passed(?:, (\d+) skipped)?|(\d+) skipped) in \d+(?:\.\d+)?s ={3,}$/.exec(summary?.text ?? "");
  if (!summary || !result) return undefined;
  const summaryPassed = result[1] === undefined ? 0 : uint(result[1]);
  const summarySkipped = result[2] === undefined && result[3] === undefined ? 0 : uint(result[2] ?? result[3]);
  if (summaryPassed !== passed || summarySkipped !== skipped || passed + skipped !== total ||
      (result[1] !== undefined && summaryPassed === 0) ||
      ((result[2] !== undefined || result[3] !== undefined) && summarySkipped === 0) || !blankEnd(rows, i)) return undefined;
  kept.push(summary);
  return reduction(kept);
}

function goIdentity(argv: readonly string[]): boolean {
  return argv[0] === "go" && argv[1] === "test" && argv[2] === "-v" &&
    (argv.length === 3 || (argv.length === 4 && argv[3] === "."));
}

function go(rows: readonly Line[]): Reduction | undefined {
  let i = 0;
  const kept: Line[] = [];
  const names = new Set<string>();
  while (rows[i]?.text.startsWith("=== RUN   ")) {
    const start = rows[i++]!;
    const run = /^=== RUN   (Test[\p{L}\p{N}_]+)$/u.exec(start.text);
    if (!run || names.has(run[1]!)) return undefined;
    names.add(run[1]!);
    const end = rows[i++];
    const result = /^--- (PASS|SKIP): (Test[\p{L}\p{N}_]+) \(\d+(?:\.\d+)?s\)$/u.exec(end?.text ?? "");
    // In particular, t.Log rows between RUN and PASS must not disappear.
    if (!end || !result || result[2] !== run[1]) return undefined;
    if (result[1] === "SKIP") kept.push(start, end);
  }
  const pass = rows[i++];
  const summary = rows[i++];
  if (names.size === 0 || pass?.text !== "PASS" || !summary ||
      !/^ok  \t[^\s]+\t\d+(?:\.\d+)?s$/.test(summary.text) || i !== rows.length) return undefined;
  kept.push(pass, summary);
  return reduction(kept);
}

export const runnerProfiles: readonly Profile[] = [
  nativeProfile("cargo-test", (argv) => cargoIdentity(argv, "test"), (output) => cargo(output, true)),
  nativeProfile("cargo-build", (argv) => cargoIdentity(argv, "build"), (output) => cargo(output, false)),
  nativeProfile("pytest", pytestIdentity, (output) => pytest(lines(output))),
  nativeProfile("go-test-verbose", goIdentity, (output) => go(lines(output))),
];
