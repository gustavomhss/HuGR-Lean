import { tokenizeCommand } from "../core/command.js";
import { lines } from "../core/lines.js";
import type { Observation, Profile, Reduction, Span } from "../core/types.js";

// Biome 2.2.6 plain successful check/lint only. Every retained byte is source-backed.
// JSON, writes, format, errors, controls and unknown grammar have no reduction.
const executable = /^(?:biome|\/(?:[A-Za-z0-9_.+-]+\/)*biome)$/;
const path = /^(?!-)(?!.*\/\/)[A-Za-z0-9_./:+ -]+$/;
const flags = new Set(["--write", "--unsafe", "--error-on-warnings", "--reporter=json", "--colors=off", "--colors=force"]);
function invocation(argv: readonly string[]): boolean {
  if (!executable.test(argv[0] ?? "") || !["lint", "check", "format"].includes(argv[1] ?? "")) return false;
  let paths = 0;
  const seen = new Set<string>();
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("-")) {
      if (!flags.has(arg) || seen.has(arg)) return false;
      if (arg.startsWith("--colors=") && [...seen].some((item) => item.startsWith("--colors="))) return false;
      seen.add(arg);
    } else {
      if (!path.test(arg) || !arg.trim()) return false;
      paths++;
    }
  }
  return paths > 0 && (!seen.has("--unsafe") || seen.has("--write"));
}

const header = /^([^\s].*):([1-9]\d*):([1-9]\d*) (lint\/[A-Za-z][A-Za-z0-9_-]*(?:\/[A-Za-z][A-Za-z0-9_-]*)+)  FIXABLE  (━+)$/;
const summary = /^Checked ([1-9]\d*) (file|files) in \d+(?:\.\d+)?(?:µs|ms|s)\. No fixes applied\.$/;
const found = /^Found ([1-9]\d*) (warning|warnings)\.$/;
// Numbered source rows, caret rows, and old/new/both numbered native diff rows.
const gutter = /^(?:(?:  > [1-9]\d*| {4,}[1-9]\d*(?: +[1-9]\d*)?) +│| {6,}│) .*$/;
const positive = (value: string): number | undefined => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
};

function reduce(output: string, observation: Observation): Reduction | undefined {
  if (output !== observation.output || observation.presentation !== "unknown"
    || observation.source !== "shell" || observation.completeness !== "complete"
    || observation.termination.kind !== "exited" || observation.termination.code !== 0) return undefined;
  const argv = tokenizeCommand(observation.command);
  if (!argv || !invocation(argv) || argv[1] === "format"
    || argv.some((arg) => ["--write", "--unsafe", "--reporter=json", "--colors=force"].includes(arg))) return undefined;
  // LF/tab are the only admitted controls. Never sanitize ANSI/CR under unknown presentation.
  if (!output.endsWith("\n") || /[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(output)) return undefined;
  const rows = lines(output);
  const required: Span[] = [];
  const files = new Set<string>();
  let cursor = 0, warnings = 0, diagnostics = 0;
  const keep = (index: number): void => { required.push(rows[index]!.span); };
  while (cursor < rows.length && !summary.test(rows[cursor]!.text)) {
    const row = rows[cursor]!;
    const match = header.exec(row.text);
    if (!match || !positive(match[2]!) || !positive(match[3]!) || !match[1]!.trim()) return undefined;
    files.add(match[1]!);
    const barStart = row.span[0] + row.text.length - match[5]!.length;
    required.push([row.span[0], barStart], [row.span[0] + row.text.length, row.span[1]]);
    cursor++;
    if (rows[cursor]?.text !== "") return undefined;
    keep(cursor++);
    const primary = /^  ([i!]) \S.*$/.exec(rows[cursor]?.text ?? "");
    if (!primary) return undefined;
    if (primary[1] === "!") warnings++;
    diagnostics++;
    keep(cursor++);
    let section: "paragraph" | "gutter" = "paragraph", blanks = 0;
    while (cursor < rows.length) {
      const body = rows[cursor]!.text;
      if (header.test(body) || summary.test(body)) break;
      if (body === "" || body === "  ") {
        blanks++;
      } else if (/^  i \S.*$/.test(body)) {
        if (blanks === 0) return undefined;
        section = "paragraph";
        blanks = 0;
      } else if (gutter.test(body)) {
        if (blanks > 0) {
          if (/^ {6,}│/.test(body)) return undefined;
        } else if (section !== "gutter") return undefined;
        section = "gutter";
        blanks = 0;
      } else if (/^ {4}\S.*$/.test(body) && !body.includes("│")) {
        // Wrapped prose is admitted only as continuation of an existing paragraph.
        if (section !== "paragraph" || blanks !== 0) return undefined;
      } else return undefined;
      keep(cursor++);
    }
    // Native blocks finish with a padded blank and an empty line, not pending text.
    if (blanks !== 2 || rows[cursor - 2]?.text !== "  " || rows[cursor - 1]?.text !== "") return undefined;
  }
  const footer = summary.exec(rows[cursor]?.text ?? "");
  if (!footer || diagnostics === 0) return undefined;
  const checked = positive(footer[1]!);
  if (!checked || files.size > checked || footer[2] !== (checked === 1 ? "file" : "files")) return undefined;
  if (warnings > 0 && argv.includes("--error-on-warnings")) return undefined;
  keep(cursor++);
  if (warnings > 0) {
    const count = found.exec(rows[cursor]?.text ?? "");
    if (!count || positive(count[1]!) !== warnings || count[2] !== (warnings === 1 ? "warning" : "warnings")) return undefined;
    keep(cursor++);
  }
  if (cursor !== rows.length) return undefined;
  return { pieces: required, required };
}

export const familyProfiles: readonly Profile[] = Object.freeze([
  { id: "biome", match: invocation, reduce },
]);
