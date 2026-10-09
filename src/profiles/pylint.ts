import { tokenizeCommand } from "../core/command.js";
import type { Span } from "../core/types.js";
import { jsonLayout } from "./json-layout.js";
import { nativeProfile } from "./runner-utils.js";

type Value = Record<string, unknown>;
type Format = "json" | "json2";
const categories = ["fatal", "error", "warning", "refactor", "convention", "info"] as const;
const letters: Readonly<Record<string, string>> = { fatal: "F", error: "E", warning: "W", refactor: "R", convention: "C", info: "I" };
const oldKeys = ["type", "module", "obj", "line", "column", "endLine", "endColumn", "path", "symbol", "message", "message-id"];
const newKeys = ["type", "symbol", "message", "messageId", "confidence", "module", "obj", "line", "column", "endLine", "endColumn", "path", "absolutePath"];
const uint = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
function record(value: unknown, keys: readonly string[]): value is Value {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function text(value: unknown, empty = false): value is string {
  return typeof value === "string" && (empty || value.trim().length > 0) &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value) &&
    !/[\uD800-\uDFFF]/u.test(value);
}
function path(value: unknown, absolute = false): value is string {
  return text(value) && !/[\t\r\n\\]/u.test(value) && (!absolute || value.startsWith("/")) &&
    value.replace(/^\//u, "").split("/").every(part => part.length > 0 && part !== "." && part !== "..");
}
function identifier(value: unknown, empty = false): value is string {
  return text(value, empty) && ((empty && value === "") ||
    /^[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)*$/u.test(value));
}
function message(value: unknown, format: Format): value is Value {
  if (!record(value, format === "json" ? oldKeys : newKeys) ||
      typeof value.type !== "string" || value.type === "fatal" || !Object.hasOwn(letters, value.type) ||
      !identifier(value.module) || !identifier(value.obj, true) || !text(value.message) ||
      typeof value.symbol !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value.symbol) ||
      !path(value.path) || !value.path.endsWith(".py") || !uint(value.line) || value.line === 0 || !uint(value.column)) return false;
  const code = value[format === "json" ? "message-id" : "messageId"];
  if (typeof code !== "string" || !/^[FEWRCI][0-9]{4}$/u.test(code) || code[0] !== letters[value.type]) return false;
  if (value.endLine === null || value.endColumn === null) {
    if (value.endLine !== null || value.endColumn !== null) return false;
  } else if (!uint(value.endLine) || !uint(value.endColumn) || value.endLine < value.line ||
      (value.endLine === value.line && value.endColumn < value.column)) return false;
  if (format === "json2" && (!path(value.absolutePath, true) ||
      (value.path.startsWith("/") ? value.absolutePath !== value.path : !value.absolutePath.endsWith("/" + value.path)) ||
      typeof value.confidence !== "string" ||
      !["HIGH", "CONTROL_FLOW", "INFERENCE", "INFERENCE_FAILURE", "UNDEFINED"].includes(value.confidence))) return false;
  return true;
}
function schema(value: unknown, format: Format): boolean {
  let messages: unknown[], stats: Value | undefined;
  if (format === "json") {
    if (!Array.isArray(value)) return false;
    messages = value;
  } else {
    if (!record(value, ["messages", "statistics"]) || !Array.isArray(value.messages) ||
        !record(value.statistics, ["messageTypeCount", "modulesLinted", "score"])) return false;
    messages = value.messages; stats = value.statistics;
  }
  const counts: Record<string, number> = Object.fromEntries(categories.map(category => [category, 0]));
  const seen = new Set<string>(), paths = new Map<string, string>(), modules = new Set<string>();
  const absolutePaths = new Map<string, string>();
  const finished = new Set<string>();
  let previousPath: string | undefined;
  for (const item of messages) {
    if (!message(item, format)) return false;
    const identity = JSON.stringify((format === "json" ? oldKeys : newKeys).map(key => item[key]));
    if (seen.has(identity)) return false;
    seen.add(identity);
    const file = item.path as string, module = item.module as string;
    if (paths.has(file) && paths.get(file) !== module) return false;
    if (format === "json2") {
      const absolute = item.absolutePath as string;
      if (absolutePaths.has(file) && absolutePaths.get(file) !== absolute) return false;
      absolutePaths.set(file, absolute);
    }
    if (previousPath !== file) {
      if (finished.has(file)) return false;
      if (previousPath !== undefined) finished.add(previousPath);
    }
    previousPath = file; paths.set(file, module); modules.add(module);
    counts[item.type as string]!++;
  }
  if (!stats) return true;
  if (!record(stats.messageTypeCount, categories) || !uint(stats.modulesLinted) || stats.modulesLinted === 0 ||
      stats.modulesLinted < modules.size || typeof stats.score !== "number" || !Number.isFinite(stats.score) ||
      stats.score < 0 || stats.score > 10 || categories.some(category =>
        !uint((stats.messageTypeCount as Value)[category]) || (stats.messageTypeCount as Value)[category] !== counts[category])) return false;
  // Native default evaluation uses statement count, which JSON2 does not export.
  // Require a feasible positive integer denominator, not an invented exact statement total.
  const weight = 5 * counts.error! + counts.warning! + counts.refactor! + counts.convention!;
  if (!uint(weight)) return false;
  if (weight === 0) return stats.score === 10;
  if (stats.score === 0) return true; // Default evaluation clamps negative scores to zero.
  const statements = Math.round(weight * 10 / (10 - stats.score));
  return uint(statements) && statements > 0 && 10 - (weight / statements) * 10 === stats.score;
}
function executable(value: string, names: readonly string[]): boolean {
  return names.includes(value) || (value.startsWith("/") && path(value, true) && names.includes(value.split("/").at(-1)!));
}
function format(argv: readonly string[]): Format | undefined {
  let offset = 1;
  if (executable(argv[0] ?? "", ["python", "python3"])) {
    if (argv[1] !== "-m" || argv[2] !== "pylint") return undefined;
    offset = 3;
  } else if (!executable(argv[0] ?? "", ["pylint"])) return undefined;
  let selected: Format | undefined, files = 0;
  const flags = new Set<string>();
  for (const word of argv.slice(offset)) {
    if (word.startsWith("-")) {
      if (files > 0) return undefined;
      const key = word.split("=", 1)[0]!;
      if (flags.has(key)) return undefined;
      flags.add(key);
      if (word === "--output-format=json" || word === "--output-format=json2") selected = word.endsWith("json2") ? "json2" : "json";
      else if (!["--persistent=no", "--jobs=1", "--exit-zero", "--reports=yes"].includes(word) &&
          !(word.startsWith("--rcfile=") && path(word.slice(9)) && /^[A-Za-z0-9_./ -]+$/u.test(word.slice(9)))) return undefined;
    } else {
      if (!path(word) || !/^[A-Za-z0-9_./ -]+$/u.test(word) || !word.endsWith(".py")) return undefined;
      files++;
    }
  }
  return files > 0 ? selected : undefined;
}

/** Pylint 4.0.4 witnessed JSON and JSON2 subsets: data tokens and EOF are source evidence. */
export const pylintProfile = nativeProfile("pylint", argv => format(argv) !== undefined, (output, observation) => {
  if (observation.presentation !== "unknown") return undefined;
  const argv = tokenizeCommand(observation.command), selected = argv && format(argv);
  if (!selected || !output.startsWith(selected === "json" ? "[" : "{")) return undefined;
  const suffix = /[ \t\r\n]+$/u.exec(output);
  if (!suffix || !suffix[0].endsWith("\n")) return undefined;
  const layout = jsonLayout(output, value => schema(value, selected));
  if (!layout) return undefined;
  const eof: Span = [output.length - suffix[0].length, output.length];
  const pieces = [...layout.pieces, eof], required = [...layout.required, eof];
  const retained = layout.required.reduce((size, [start, end]) => size + end - start, suffix[0].length);
  return retained < output.length ? { pieces, required } : undefined;
});
