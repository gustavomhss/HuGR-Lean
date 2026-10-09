import { tokenizeCommand } from "../core/command.js";
import type { Span } from "../core/types.js";
import { jsonLayout } from "./json-layout.js";
import { nativeProfile } from "./runner-utils.js";

type Value = Record<string, unknown>;
type Position = { line: number; character: number };
function record(value: unknown, keys: readonly string[]): value is Value {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
const uint = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !controls.test(value);
}
function position(value: unknown): value is Position {
  return record(value, ["line", "character"]) && uint(value.line) && uint(value.character);
}
const compare = (left: Position, right: Position) => left.line - right.line || left.character - right.character;
function path(value: unknown): value is string {
  return text(value) && value.startsWith("/") && !/[\t\r\n\\]/u.test(value) &&
    value.split("/").slice(1).every(part => part.length > 0 && part !== "." && part !== "..");
}
function schema(value: unknown): boolean {
  if (!record(value, ["version", "time", "generalDiagnostics", "summary"]) || value.version !== "1.1.408" ||
      typeof value.time !== "string" || !/^[1-9]\d*$/u.test(value.time) ||
      !uint(Number(value.time)) || !Array.isArray(value.generalDiagnostics) ||
      !record(value.summary, ["filesAnalyzed", "errorCount", "warningCount", "informationCount", "timeInSec"])) return false;
  const summary = value.summary;
  if (!uint(summary.filesAnalyzed) || summary.filesAnalyzed === 0 || summary.errorCount !== 0 ||
      !uint(summary.warningCount) || !uint(summary.informationCount) ||
      typeof summary.timeInSec !== "number" || !Number.isFinite(summary.timeInSec) ||
      summary.timeInSec < 0 || summary.timeInSec > Number.MAX_SAFE_INTEGER) return false;
  let warnings = 0, information = 0, previousFile: string | undefined, previous: Position | undefined;
  const files = new Set<string>(), diagnostics = new Set<string>();
  for (const item of value.generalDiagnostics) {
    if (item === null || typeof item !== "object") return false;
    const severity = (item as Value).severity;
    const keys = ["file", "severity", "message", "range"];
    if (severity === "warning") keys.push("rule");
    else if (severity !== "information") return false;
    if (!record(item, keys) || !path(item.file) || !text(item.message) ||
        !record(item.range, ["start", "end"]) || !position(item.range.start) || !position(item.range.end) ||
        compare(item.range.start, item.range.end) > 0 ||
        (severity === "warning" && (typeof item.rule !== "string" || !/^report[A-Z][A-Za-z0-9]*$/u.test(item.rule)))) return false;
    if (item.file !== previousFile) {
      if (files.has(item.file)) return false;
      files.add(item.file); previous = undefined;
    }
    if (previous && compare(previous, item.range.start) > 0) return false;
    const identity = JSON.stringify(item);
    if (diagnostics.has(identity)) return false;
    diagnostics.add(identity);
    previousFile = item.file; previous = item.range.start;
    if (severity === "warning") warnings++; else information++;
  }
  return summary.warningCount === warnings && summary.informationCount === information &&
    summary.filesAnalyzed >= files.size;
}
function match(argv: readonly string[]): boolean {
  const executable = argv[0] ?? "";
  if (executable !== "pyright" && !/^\/(?:[A-Za-z0-9_.:+,-]+\/)*pyright$/u.test(executable)) return false;
  return argv[1] === "--outputjson" && argv.length >= 3 && argv.slice(2).every(arg =>
    /^[A-Za-z0-9_./ -]+$/u.test(arg) && arg.trim().length > 0 && !arg.startsWith("-"));
}

/** Pyright 1.1.408 explicit JSON: layout only; every data token and native two-LF EOF required. */
export const pyrightProfile = nativeProfile("pyright", match, (output, observation) => {
  if (observation.presentation !== "unknown" || !output.endsWith("}\n\n")) return undefined;
  const argv = tokenizeCommand(observation.command);
  if (!argv || !match(argv)) return undefined;
  const layout = jsonLayout(output, schema);
  if (!layout) return undefined;
  const eof: Span = [output.length - 2, output.length];
  const pieces = [...layout.pieces, eof], required = [...layout.required, eof];
  const retained = layout.required.reduce((size, [start, end]) => size + end - start, 2);
  return retained < output.length ? { pieces, required } : undefined;
});
