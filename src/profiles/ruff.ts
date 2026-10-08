import { tokenizeCommand } from "../core/command.js";
import type { Profile } from "../core/types.js";
import { jsonLayout } from "./json-layout.js";

type RecordValue = Record<string, unknown>;
type Position = { row: number; column: number };
function record(value: unknown, keys: readonly string[]): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
function position(value: unknown): value is Position {
  return record(value, ["row", "column"]) && positive(value.row) && positive(value.column);
}
const compare = (left: Position, right: Position): number => left.row - right.row || left.column - right.column;
function range(value: RecordValue): boolean {
  return position(value.location) && position(value.end_location) && compare(value.location, value.end_location) <= 0;
}
function fix(value: unknown): boolean {
  if (value === null) return true;
  if (!record(value, ["applicability", "edits", "message"]) ||
      (value.applicability !== "safe" && value.applicability !== "unsafe") ||
      !(value.message === null || typeof value.message === "string") ||
      !Array.isArray(value.edits) || value.edits.length === 0) return false;
  let previous: RecordValue | undefined;
  for (const edit of value.edits) {
    if (!record(edit, ["content", "location", "end_location"]) || typeof edit.content !== "string" || !range(edit)) return false;
    if (previous && (compare(previous.end_location as Position, edit.location as Position) > 0 ||
        compare(previous.location as Position, edit.location as Position) === 0)) return false;
    previous = edit;
  }
  return true;
}
function diagnostics(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every((item) => {
    if (!record(item, ["cell", "code", "end_location", "filename", "fix", "location", "message", "noqa_row", "url"]) ||
        item.cell !== null || typeof item.code !== "string" || typeof item.filename !== "string" ||
        typeof item.message !== "string" || !(item.url === null || typeof item.url === "string") ||
        !(item.noqa_row === null || positive(item.noqa_row)) || !range(item) || !fix(item.fix)) return false;
    return true;
  });
}
function match(argv: readonly string[]): boolean {
  const executable = argv[0] ?? "";
  if (executable !== "ruff" && !/^\/(?:[A-Za-z0-9_.:+,-]+\/)*ruff$/u.test(executable)) return false;
  if (argv[1] !== "check") return false;
  const seen = new Set<string>();
  let paths = false, literal = false;
  for (let index = 2; index < argv.length; index++) {
    const arg = argv[index]!;
    if (!literal && arg === "--") { literal = true; continue; }
    if (!literal && arg.startsWith("-")) {
      if (paths) return false;
      const key = arg === "--output-format=json" ? "--output-format" : arg;
      if (seen.has(key)) return false;
      if (key === "--output-format") {
        if (arg !== "--output-format=json" && argv[++index] !== "json") return false;
      } else if (!["--exit-zero", "--isolated", "--no-cache"].includes(key)) return false;
      seen.add(key);
    } else {
      if (!/^[A-Za-z0-9_./:+,= -]+$/u.test(arg) || (!literal && arg.startsWith("-"))) return false;
      paths = true;
    }
  }
  return seen.has("--output-format") && seen.has("--exit-zero");
}

/** Ruff 0.14.0 check JSON only: no diagnostics, edits, values or metrics are removed. */
export const ruffProfile: Profile = {
  id: "ruff",
  match,
  reduce(output, observation) {
    if (observation.source !== "shell" || observation.completeness !== "complete" ||
        observation.termination.kind !== "exited" || observation.termination.code !== 0 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(output)) return undefined;
    const argv = tokenizeCommand(observation.command);
    if (!argv || !match(argv)) return undefined;
    return jsonLayout(output, diagnostics);
  },
};
