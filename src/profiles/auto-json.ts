import { tokenizeAutomaticCommand } from "../core/automatic-command.js";
import { LEXICAL_TEXT, parseJson, recordJson, scalar, scanJson, scanned, type JsonNode, type JsonRecords } from "../core/structured-json.js";
import type { AutomaticObservation, AutomaticReducer } from "../core/automatic-types.js";
import type { Piece, Reduction, Span } from "../core/types.js";

// Shared immutable formatting pieces: one allocation per token kind, never per emitted token (the scanner's own).
export const JSON_TEXT = LEXICAL_TEXT;
const { openArray, closeArray, openObject, closeObject, comma, colon, newline } = JSON_TEXT;
const MAX_BYTES = 16 * 1024 * 1024;
/** UTF-8 bytes never exceed 3 per UTF-16 unit, so the exact byte count is only needed near the limit. */
export function overByteLimit(output: string): boolean {
  return output.length * 3 > MAX_BYTES && Buffer.byteLength(output, "utf8") > MAX_BYTES;
}

/**
 * Lexical emission with an optional global node budget (every key and value costs one, pre-order).
 * A subtree whose source already has no whitespace outside tokens (lexical length equals its span length)
 * is emitted and required as ONE source span: same rendered bytes, every token still declared evidence.
 * Returns the lexical length, or -1 when the budget is exhausted.
 */
export function emitLexical(node: JsonNode, pieces: Piece[], required: Span[], offset = 0, budget?: { left: number }): number {
  // Both arrays are used as stacks with explicit tops: a collapsed subtree rewinds its tops instead of
  // truncating the arrays, and one final truncation drops whatever was rewound past.
  emitPieces = pieces; emitRequired = required; pieceTop = pieces.length; requiredTop = required.length;
  try { return lexical(node, offset, budget); }
  finally {
    if (pieces.length !== pieceTop) pieces.length = pieceTop;
    if (required.length !== requiredTop) required.length = requiredTop;
    emitPieces = emitRequired = EMPTY;
  }
}
const EMPTY: never[] = [];
let emitPieces: Piece[] = EMPTY, emitRequired: Span[] = EMPTY, pieceTop = 0, requiredTop = 0;
const evidence = (span: Span): void => { emitPieces[pieceTop++] = span; emitRequired[requiredTop++] = span; };
function lexical(node: JsonNode, offset: number, budget: { left: number } | undefined): number {
  if (budget !== undefined && --budget.left < 0) return -1;
  const start = node.span[0], end = node.span[1];
  // Always a fresh array: the parse tree is memoized per observation, so a caller mutating a returned span
  // must never reach a later reduction of the same observation.
  if (node.kind === "scalar") { evidence([start + offset, end + offset]); return end - start; }
  const values = node.kind === "array" ? node.items : node.entries;
  if (values.length === 0) {
    if (end - start === 2) evidence([start + offset, end + offset]);
    else { evidence([start + offset, start + offset + 1]); evidence([end + offset - 1, end + offset]); }
    return 2;
  }
  const pieceMark = pieceTop, requiredMark = requiredTop;
  let length: number;
  if (node.kind === "array") {
    const items = node.items;
    length = items.length + 1; emitPieces[pieceTop++] = openArray;
    for (let i = 0; i < items.length; i++) {
      if (i) emitPieces[pieceTop++] = comma;
      const size = lexical(items[i]!, offset, budget);
      if (size < 0) return -1;
      length += size;
    }
    emitPieces[pieceTop++] = closeArray;
  } else {
    const entries = node.entries;
    length = 2 * entries.length + 1; emitPieces[pieceTop++] = openObject;
    for (let i = 0; i < entries.length; i++) {
      if (i) emitPieces[pieceTop++] = comma;
      const entry = entries[i]!, key = lexical(entry.key, offset, budget);
      if (key < 0) return -1;
      emitPieces[pieceTop++] = colon;
      const value = lexical(entry.value, offset, budget);
      if (value < 0) return -1;
      length += key + value;
    }
    emitPieces[pieceTop++] = closeObject;
  }
  if (length === end - start) { pieceTop = pieceMark; requiredTop = requiredMark; evidence([start + offset, end + offset]); }
  return length;
}

/** Full lexical evidence, including keys and meaningful empty-container delimiters. */
export function lexicalJson(node: JsonNode, pieces: Piece[], required: Span[]): void {
  emitLexical(node, pieces, required);
}

export function jsonField(node: JsonNode, name: string): JsonNode | undefined {
  if (node.kind !== "object") return undefined;
  for (const entry of node.entries) if (entry.name === name) return entry.value;
  return undefined;
}
export function protocolError(node: JsonNode): boolean {
  const error = jsonField(node, "error");
  return error?.kind === "object" && typeof scalar(jsonField(error, "code")) === "number"
    && typeof scalar(jsonField(error, "message")) === "string"
    && (scalar(jsonField(node, "jsonrpc")) === "2.0"
      || (typeof scalar(jsonField(node, "id")) === "number" && !jsonField(node, "result")));
}
export function jsonCarrier(observation: AutomaticObservation): boolean {
  if (observation.status !== "success" || observation.completeness !== "complete") return false;
  if (observation.source === "mcp") return true;
  if (observation.tool !== "bash" || observation.metadata.exit !== 0 || observation.metadata.truncated !== false
    || typeof observation.args.command !== "string") return false;
  const argv = tokenizeAutomaticCommand(observation.args.command);
  if (!argv) return false;
  return isAutomaticJsonProducer(argv);
}
/** Command identity only; execution and output validation remain in the reducer. */
export function isAutomaticJsonProducer(argv: readonly string[]): boolean {
  const [executable, ...args] = argv, name = executable!.split(/[\\/]/).at(-1)!.replace(/\.exe$/i, "").toLowerCase();
  const pair = (flags: string[], value: string) => args.some((arg, i) => flags.includes(arg) && args[i + 1] === value);
  switch (name) {
    // User scripts only: package CLIs under node_modules (test runners, bundlers) keep their own exact families.
    case "node": return args.length > 0 && !args.some(arg => arg === "--test" || arg.startsWith("--test=") || arg.split(/[\\/]/).includes("node_modules"));
    case "python": case "python3": return args.length > 0 && !pair(["-m"], "pytest");
    case "jq": case "curl": return true;
    case "system_profiler": return args.includes("-json");
    case "npm": return ["ls", "list"].includes(args[0] ?? "") && args.includes("--json");
    case "docker": return pair(["--format"], "json") || pair(["--format"], "{{json .}}");
    case "kubectl": return pair(["-o", "--output"], "json");
    case "gh": return args[0] === "api";
    case "powershell": case "pwsh": return args.some(arg => /(?:^|\s)ConvertTo-Json(?:\s|$)/i.test(arg));
    default: return false;
  }
}

export interface JsonSection { readonly output: string; readonly start: number; readonly end: number }
interface JsonView {
  readonly output: string; readonly tool: string; readonly source: string;
  readonly section: JsonSection | undefined; parsed: boolean; root: JsonNode | undefined;
  /** Whole-section scan verdict, once known: parseJson acceptance, the protocol error envelope and the records. */
  checked: boolean; valid: boolean; envelope: boolean; records: JsonRecords | undefined;
}
/**
 * One section per observation, scanned (and, only if a caller asks for the tree, parsed) at most once:
 * auto-cdp and auto-json (and the wrapper check) see the same immutable text. Keyed weakly by the observation
 * and revalidated against its carrier facts, so a reused or mutated caller object never receives another
 * text's verdict or tree.
 */
const views = new WeakMap<object, JsonView>();
function sectionOf(output: string, tool: string, source: string): { section: JsonSection | undefined; records?: JsonRecords; envelope?: boolean } {
  if (overByteLimit(output)) return { section: undefined };
  const named = (name: string) => tool === name || tool.endsWith(`_${name}`);
  let start = 0, end = output.length;
  if (source === "mcp" && (named("browser_evaluate") || named("browser_run_code_unsafe")) && output.startsWith("### Result\n")) {
    start = "### Result\n".length; end = output.indexOf("\n### Ran Playwright code\n", start);
    if (end < start || output.length - end > 65536) return { section: undefined };
  } else if (source === "mcp" && named("evaluate_script") && output.startsWith("Script ran on page and returned:\n```json\n")) {
    start = "Script ran on page and returned:\n```json\n".length;
    const closing = output.endsWith("\n```\n") ? 5 : output.endsWith("\n```") ? 4 : 0;
    if (!closing) return { section: undefined };
    end -= closing;
  }
  const text = output.slice(start, end);
  if (!start) return { section: { output: text, start, end } };
  // A wrapped payload must be one whole JSON value; the scan decides it without a tree (refusing past the node limit early).
  const records = recordJson(text, 25000);
  return records ? { section: { output: text, start, end }, records, envelope: scanned.envelope } : { section: undefined };
}
function jsonView(observation: AutomaticObservation): JsonView {
  const { output, tool, source } = observation, hit = views.get(observation);
  if (hit && hit.output === output && hit.tool === tool && hit.source === source) return hit;
  const { section, records, envelope } = sectionOf(output, tool, source);
  const checked = records !== undefined;
  const view: JsonView = { output, tool, source, section, parsed: section === undefined, root: undefined, checked, valid: checked, envelope: envelope ?? false, records };
  views.set(observation, view);
  return view;
}
/** The parsed section payload (undefined when absent or malformed), parsed at most once per observation. */
export function jsonSectionRoot(observation: AutomaticObservation): { section: JsonSection; root: JsonNode | undefined } | undefined {
  const view = jsonView(observation);
  if (!view.section) return undefined;
  if (!view.parsed) { view.root = view.checked && !view.valid ? undefined : parseJson(view.section.output); view.parsed = true; }
  return { section: view.section, root: view.root };
}
/** The section with its whole-payload verdict (parseJson acceptance, protocol error envelope, records), scanned at most once. */
export function jsonSectionScan(observation: AutomaticObservation): { section: JsonSection; valid: boolean; envelope: boolean; records: JsonRecords | undefined } | undefined {
  const view = jsonView(observation), section = view.section;
  if (!section) return undefined;
  if (!view.checked) {
    view.records = recordJson(section.output, 25000);
    view.valid = view.records !== undefined; view.envelope = view.valid && scanned.envelope; view.checked = true;
  }
  return { section, valid: view.valid, envelope: view.envelope, records: view.records };
}

/** Exact native wrappers only. Payload spans are virtual UTF-16 offsets into the response. */
export function nativeJsonSection(observation: AutomaticObservation): { output: string; start: number; end: number } | undefined {
  const section = jsonView(observation).section;
  return section && { output: section.output, start: section.start, end: section.end };
}
export function nativeJsonReduction(observation: AutomaticObservation, section: { start: number; end: number }, reduction: Reduction): Reduction {
  const shift = ([start, end]: Span): Span => [start + section.start, end + section.start];
  const pieces: Piece[] = reduction.pieces.map(piece => Array.isArray(piece) ? shift(piece as Span) : piece);
  const required = reduction.required.map(shift);
  if (section.start) { const prefix: Span = [0, section.start]; pieces.unshift(prefix); required.push(prefix); }
  if (section.end < observation.output.length) {
    const suffix: Span = [section.end, observation.output.length]; pieces.push(suffix); required.push(suffix);
  }
  return { pieces, required };
}
/** Wrapper prefix span before payload emission (payload spans are emitted already shifted). */
export function wrapperPrefix(section: JsonSection, pieces: Piece[], required: Span[]): void {
  if (section.start) { const prefix: Span = [0, section.start]; pieces.push(prefix); required.push(prefix); }
}
export function wrapperSuffix(section: JsonSection, length: number, pieces: Piece[], required: Span[]): void {
  if (section.end < length) { const suffix: Span = [section.end, length]; pieces.push(suffix); required.push(suffix); }
}

/**
 * JSON and NDJSON share one global syntax-node budget, never one budget per record. The streaming scanner
 * validates, counts, recognizes the protocol error envelope and emits the lexical view in one pass per text.
 */
export const reduceAutomaticJson: AutomaticReducer = observation => {
  if (!jsonCarrier(observation) || overByteLimit(observation.output)) return;
  const view = jsonView(observation), section = view.section;
  if (!section) return;
  const { output } = section, pieces: Piece[] = [], required: Span[] = [];
  wrapperPrefix(section, pieces, required);
  const evidence = required.length;
  // A whole payload holds at most the 25,000 nodes it may count, so the shared budget cannot run out on it.
  if (view.checked && view.envelope) return;
  let whole = false;
  if (!view.checked || view.valid) {
    if (scanJson(output, section.start, 25000, pieces, required) >= 0) { if (scanned.envelope) return; whole = true; }
  }
  if (!whole) {
    // A single-line payload is its only record, and that record is the text that just failed to scan whole.
    if (!output.includes("\n")) return;
    // A wrapped section always scanned whole, so records are only ever unwrapped (offset 0) payloads.
    let offset = 0, records = 0, left = 25000;
    for (const line of output.split("\n")) {
      if (offset === output.length && line === "") break;
      if (++records > 25000) return;
      if (records > 1) pieces.push(newline);
      // Per record: parseJson's own 25,000-node limit, and whatever the shared budget has left.
      if (scanJson(line, section.start + offset, left < 25000 ? left : 25000, pieces, required) < 0 || scanned.envelope) return;
      left -= scanned.nodes;
      offset += line.length + 1;
    }
    if (output.endsWith("\n")) pieces.push(newline);
  }
  if (required.length === evidence) return;
  wrapperSuffix(section, observation.output.length, pieces, required);
  return { pieces, required };
};
