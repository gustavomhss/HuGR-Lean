import type { Observation, Profile, Reduction, Span } from "../core/types.js";

// LF-only, non-TTY stylish subset. Never delete or reconstruct an interior byte.
const LIMIT = 1024 * 1024;
const MAX_RECORDS = 16384;
const MAX_FILES = 4096;
const MAX_CONTINUATIONS = 256;
const UNSAFE = /[\x00-\x09\x0b-\x1f\x7f-\x9f\p{Cf}]/u;
const ROW = /^ {2,}([0-9]+):([0-9]+) {2,}(warning|error) {2,}(.+)$/u;
const RULE_END = / {2,}(@?[A-Za-z0-9_-]+(?:[/.][A-Za-z0-9_-]+)*)$/u;
const SUMMARY = /^✖ ([1-9][0-9]*) (problem|problems) \(0 errors, ([1-9][0-9]*) (warning|warnings)\)$/u;
const FIXES = /^  0 errors and ([1-9][0-9]*) (warning|warnings) potentially fixable with the `--fix` option\.$/u;

function absolutePath(value: string): boolean {
  return value.startsWith("/") && !value.includes("\\") && !UNSAFE.test(value)
    && value.slice(1).split("/").every(part => part.length > 0 && part !== "." && part !== "..");
}

function executable(value: string): boolean {
  return value === "eslint" || (absolutePath(value) && value.endsWith("/eslint"));
}

function match(argv: readonly string[]): boolean {
  let cursor = 0;
  if (argv[0] === "npx") {
    cursor = argv[1] === "--no-install" ? 2 : 1;
    if (argv[cursor++] !== "eslint") return false;
  } else if (!argv[0] || !executable(argv[cursor++]!)) return false;
  let targets = 0, config = false, fix = false;
  for (; cursor < argv.length; cursor++) {
    const arg = argv[cursor]!;
    if (arg === "--config") {
      const path = argv[++cursor];
      if (config || !path || path.startsWith("-") || !/^[A-Za-z0-9_./ -]+$/u.test(path)) return false;
      config = true;
    } else if (arg === "--fix") {
      if (fix) return false;
      fix = true;
    } else {
      if (!arg || arg.startsWith("-") || !/^[A-Za-z0-9_./ -]+$/u.test(arg)) return false;
      targets++;
    }
  }
  return targets > 0;
}

function positive(value: string): number | undefined {
  if (!/^[1-9][0-9]*$/u.test(value)) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
}

function plural(count: number, word: string, singular: string): boolean {
  return word === (count === 1 ? singular : `${singular}s`);
}

function continuation(line: string): boolean {
  // Structural lookalikes cannot establish a continuation boundary. Refuse them.
  return line.length > 0 && !line.startsWith("/") && !line.trimStart().startsWith("✖")
    && !/^\s*[0-9]+\s*:/u.test(line) && !line.startsWith("(node:")
    && !line.startsWith("(Use `node") && !FIXES.test(line);
}

function reduce(output: string, observation: Observation): Reduction | undefined {
  // terminal-rendered is refused: core normalizes SGR before calling profiles.
  if (observation.source !== "shell" || observation.completeness !== "complete"
    || observation.termination.kind !== "exited" || observation.termination.code !== 0
    || observation.presentation !== "unknown" || output.length > LIMIT || UNSAFE.test(output)
    || !output.startsWith("\n/") || !output.endsWith("\n\n")) return undefined;
  const body = output.slice(1, -1);
  const lines = body.split("\n");
  if (lines.pop() !== "") return undefined;
  const paths = new Set<string>();
  let cursor = 0, warnings = 0;
  while (cursor < lines.length && lines[cursor]!.startsWith("/")) {
    const path = lines[cursor++]!;
    if (!absolutePath(path) || paths.has(path) || paths.size >= MAX_FILES) return undefined;
    paths.add(path);
    let records = 0;
    while (cursor < lines.length && lines[cursor] !== "") {
      const row = ROW.exec(lines[cursor++]!);
      if (!row || row[3] !== "warning") return undefined;
      const zeroPosition = row[1] === "0" && row[2] === "0";
      if (!zeroPosition && (positive(row[1]!) === undefined || positive(row[2]!) === undefined)) return undefined;
      let message = row[4]!;
      if (zeroPosition) {
        // Native rule-less file diagnostics have 0:0; no multiline/rule inference.
        if (RULE_END.test(message)) return undefined;
      } else {
        let count = 0;
        while (!RULE_END.test(message)) {
          const next = lines[cursor++];
          if (next === undefined || !continuation(next) || ++count > MAX_CONTINUATIONS) return undefined;
          message = next;
        }
        const suffix = RULE_END.exec(message)!;
        if (suffix.index === 0) return undefined;
      }
      records++;
      if (++warnings > MAX_RECORDS) return undefined;
    }
    if (!records || lines[cursor++] !== "") return undefined;
  }
  if (!paths.size) return undefined;
  const summary = SUMMARY.exec(lines[cursor++] ?? "");
  if (!summary || positive(summary[1]!) !== warnings || positive(summary[3]!) !== warnings
    || !plural(warnings, summary[2]!, "problem") || !plural(warnings, summary[4]!, "warning")) return undefined;
  if (cursor < lines.length) {
    const fixes = FIXES.exec(lines[cursor++]!);
    const count = fixes && positive(fixes[1]!);
    if (!fixes || count === undefined || count === null || count > warnings
      || !plural(count, fixes[2]!, "warning")) return undefined;
  }
  if (cursor !== lines.length) return undefined;
  const interior: Span = [1, output.length - 1];
  return { pieces: [interior], required: [interior] };
}

export const familyProfiles: readonly Profile[] = [{ id: "eslint", match, reduce }];
