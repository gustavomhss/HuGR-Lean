import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";
import { tokenizeAutomaticCommand } from "../src/core/automatic-command.js";
import { parseJson as liveParseJson, recordJson, scanJson, scanJsonValue, scanned, type JsonNode } from "../src/core/structured-json.js";
import { renderReduction } from "../src/core/structured-render.js";
import { filterAutomatic } from "../src/core/automatic.js";
import { automaticReducers } from "../src/core/automatic-registry.js";
import type { AutomaticEntry, AutomaticObservation, AutomaticReducer } from "../src/core/automatic-types.js";
import type { Piece, Reduction, Span } from "../src/core/types.js";
import * as next from "../src/profiles/auto-json.js";
import { reduceAutomaticCdp } from "../src/profiles/auto-cdp.js";
import { errorText } from "../src/opencode/automatic-mcp.js";

/*
 * Differential oracle for the round-4 streaming rewrite (no JsonNode tree on the auto-json, auto-cdp and MCP
 * error paths). REFERENCE: the tree-path implementations below are copied verbatim from git f729c4b (perf/round3):
 *   src/core/structured-json.ts   blob 7e29c7ab4e6095d67e8e56a8bde658a71f94c6ab (CONTROL, ESCAPES, parseJson, scalar)
 *   src/profiles/auto-json.ts     blob 1f9012185776c8fcc59082f328f230e370500675 (whole module)
 *   src/profiles/auto-cdp.ts      blob 370f499414eba2b536894cf0a3e8b9936ac7b97e (whole module)
 *   src/opencode/automatic-mcp.ts blob f8800a056cc0dbf2933a50237018c5e25b67f711 (record, mayBeEnvelope, errorText)
 * Modification record: import lines removed (each module body is wrapped in a closure that receives the
 * reference bindings it imported), `export` keywords dropped, bodies re-indented. Same license (MIT, this repo).
 * Observable result: undefined-ness and the rendered bytes; the new reductions must also be piece-for-piece and
 * span-for-span identical (which implies the required-coverage superset, also checked independently).
 */
const ref = (() => {
  const core = (() => {
    const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
    /** Single-character JSON escapes by the code unit after the backslash. */
    const ESCAPES: Readonly<Record<number, string>> = Object.freeze(Object.assign(Object.create(null) as Record<number, string>,
      { 34: '"', 92: "\\", 47: "/", 98: "\b", 102: "\f", 110: "\n", 114: "\r", 116: "\t" }));
    /** Bounded, duplicate-key-rejecting JSON parser. Keeps original lexemes and UTF-16 spans. */
    function parseJson(text: string): JsonNode | undefined {
      try {
        // The scanner is the validator (RFC 8259, exactly JSON.parse acceptance): structure and literals below,
        // strict number syntax, and per string either JSON.parse of an escaped lexeme (which rejects bad escapes
        // and controls) or a plain body free of control characters. It also recovers spans, limits and duplicates.
        const length = text.length;
        let pos = 0, count = 0, backslash = -1, newline = -1, tab = -1, carriage = -1, control = -1;
        const whitespace = (): void => {
          let code = text.charCodeAt(pos);
          while (code === 32 || code === 10 || code === 13 || code === 9) code = text.charCodeAt(++pos);
        };
        /** Index of the next `unit` at or after `from`, or length. */
        const next = (unit: string, from: number): number => { const index = text.indexOf(unit, from); return index < 0 ? length : index; };
        /**
         * Advances past the string opening at pos. A short plain body (most keys) is proven inline: closing quote
         * first, no escape or control character. Longer bodies use native searches with cached next positions of
         * each backslash and control character. A plain body is sliced; an escaped lexeme (the unit after each
         * backslash is skipped, as JSON tokenizes) is decoded by JSON.parse, which rejects bad escapes and controls.
         */
        const string = (): string => {
          const start = pos;
          let at = pos + 1;
          for (const stop = Math.min(length, pos + 17); at < stop; at++) {
            const code = text.charCodeAt(at);
            if (code === 34) { pos = at + 1; return text.slice(start + 1, at); }
            if (code < 32) throw new Error("Invalid JSON string");
            if (code === 92) break;
          }
          if (backslash < at) backslash = next("\\", at);
          const first = backslash;
          let quote = text.indexOf('"', at);
          if (quote < 0) throw new Error("Invalid JSON string");
          for (let cursor = first + 2; quote > first; ) {
            if (backslash < cursor) backslash = next("\\", cursor);
            quote = text.indexOf('"', cursor);
            if (quote < 0) throw new Error("Invalid JSON string");
            if (quote < backslash) break;
            cursor = backslash + 2;
          }
          // No control character anywhere in [at, quote); [start + 1, at) was proven inline.
          if (newline < at) newline = next("\n", at);
          if (tab < at) tab = next("\t", at);
          if (carriage < at) carriage = next("\r", at);
          if (control < at) { CONTROL.lastIndex = at; control = CONTROL.test(text) ? CONTROL.lastIndex - 1 : length; }
          if (newline < quote || tab < quote || carriage < quote || control < quote) throw new Error("Invalid JSON string");
          pos = quote + 1;
          if (quote < first) return text.slice(start + 1, quote);
          // Escapes: \" \\ \/ \b \f \n \r \t and \u with exactly four hex digits (any code unit, lone surrogates too).
          let decoded = "", from = start + 1;
          for (let escape = first; escape < quote; escape = text.indexOf("\\", from)) {
            if (escape < 0 || escape > quote) break;
            decoded += text.slice(from, escape);
            const code = text.charCodeAt(escape + 1);
            from = escape + 2;
            if (code === 117) {
              let unit = 0;
              for (; from < escape + 6; from++) {
                const hex = text.charCodeAt(from);
                unit = unit * 16 + (hex >= 48 && hex <= 57 ? hex - 48 : hex >= 97 && hex <= 102 ? hex - 87 : hex >= 65 && hex <= 70 ? hex - 55 : NaN);
              }
              if (!(unit >= 0)) throw new Error("Invalid JSON escape");
              decoded += String.fromCharCode(unit);
            } else {
              const simple = ESCAPES[code];
              if (simple === undefined) throw new Error("Invalid JSON escape");
              decoded += simple;
            }
          }
          return decoded + text.slice(from, quote);
        };
        const digit = (at: number): boolean => { const code = text.charCodeAt(at); return code >= 48 && code <= 57; };
        /** Advances pos past the digit run starting at `at`; returns the code unit after it. */
        const digits = (at: number): number => {
          let code = text.charCodeAt(at);
          while (code >= 48 && code <= 57) code = text.charCodeAt(++at);
          pos = at; return code;
        };
        const admit = (depth: number): void => { if (depth > 64 || ++count > 25000) throw new Error("JSON admission limit"); };
        function value(depth: number): JsonNode {
          admit(depth);
          whitespace();
          const start = pos, code = text.charCodeAt(pos);
          if (code === 123) {
            const entries: { name: string; key: JsonNode; value: JsonNode }[] = [];
            let names: Set<string> | undefined;
            pos++; whitespace();
            if (text.charCodeAt(pos) !== 125) for (;;) {
              admit(depth + 1); whitespace();
              if (text.charCodeAt(pos) !== 34) throw new Error("Invalid JSON key");
              const keyStart = pos, name = string();
              // Small objects compare names linearly; larger ones switch to a Set. Both reject by decoded name.
              if (names) { if (names.has(name)) throw new Error("Invalid JSON key"); names.add(name); }
              else {
                for (let index = 0; index < entries.length; index++) if (entries[index]!.name === name) throw new Error("Invalid JSON key");
                if (entries.length >= 16) { names = new Set(); for (const entry of entries) names.add(entry.name); names.add(name); }
              }
              const key: JsonNode = { kind: "scalar", value: name, span: [keyStart, pos] };
              whitespace();
              if (text.charCodeAt(pos++) !== 58) throw new Error("Invalid JSON colon");
              entries.push({ name, key, value: value(depth + 1) });
              whitespace();
              const next = text.charCodeAt(pos);
              if (next === 125) break;
              if (next !== 44) throw new Error("Invalid JSON comma");
              pos++;
            }
            pos++;
            return { kind: "object", entries, span: [start, pos] };
          }
          if (code === 91) {
            const items: JsonNode[] = [];
            pos++; whitespace();
            if (text.charCodeAt(pos) !== 93) for (;;) {
              items.push(value(depth + 1));
              whitespace();
              const next = text.charCodeAt(pos);
              if (next === 93) break;
              if (next !== 44) throw new Error("Invalid JSON comma");
              pos++;
            }
            pos++;
            return { kind: "array", items, span: [start, pos] };
          }
          let scalar: string | number | boolean | null;
          if (code === 34) scalar = string();
          else if (code === 116 && text.startsWith("true", pos)) { scalar = true; pos += 4; }
          else if (code === 102 && text.startsWith("false", pos)) { scalar = false; pos += 5; }
          else if (code === 110 && text.startsWith("null", pos)) { scalar = null; pos += 4; }
          else if (code === 45 || (code >= 48 && code <= 57)) {
            // -?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?; the caller rejects anything but a delimiter after it.
            if (code === 45) pos++;
            let next = text.charCodeAt(pos), integer = 0, exact = true;
            if (next === 48) next = text.charCodeAt(++pos);
            else if (next >= 49 && next <= 57) {
              const from = pos;
              do { integer = integer * 10 + next - 48; next = text.charCodeAt(++pos); } while (next >= 48 && next <= 57);
              exact = pos - from <= 15;
            } else throw new Error("Invalid JSON number");
            if (next === 46) { exact = false; if (!digit(pos + 1)) throw new Error("Invalid JSON number"); next = digits(pos + 2); }
            if (next === 101 || next === 69) {
              exact = false;
              next = text.charCodeAt(++pos);
              if (next === 43 || next === 45) pos++;
              if (!digit(pos)) throw new Error("Invalid JSON number");
              digits(pos + 1);
            }
            // An integer lexeme of at most 15 digits is exact as accumulated (sign applied last, so "-0" is -0);
            // otherwise Number() equals JSON.parse() on a valid JSON number lexeme (overflow, huge integers).
            scalar = exact ? (code === 45 ? -integer : integer) : Number(text.slice(start, pos));
          } else throw new Error("Invalid JSON value");
          return { kind: "scalar", value: scalar, span: [start, pos] };
        }
        const result = value(0); whitespace();
        return pos === length ? result : undefined;
      } catch { return undefined; }
    }

    function scalar(node: JsonNode | undefined): string | number | boolean | null | undefined { return node?.kind === "scalar" ? node.value : undefined; }
    return { parseJson, scalar };
  })();
  const json = (() => {
    const { parseJson, scalar } = core;

    // Shared immutable formatting pieces: one allocation per token kind, never per emitted token.
    const text = (value: string): Piece => Object.freeze({ text: value });
    const JSON_TEXT = Object.freeze({ openArray: text("["), closeArray: text("]"), openObject: text("{"), closeObject: text("}"),
      comma: text(","), colon: text(":"), newline: text("\n") });
    const { openArray, closeArray, openObject, closeObject, comma, colon, newline } = JSON_TEXT;
    const MAX_BYTES = 16 * 1024 * 1024;
    /** UTF-8 bytes never exceed 3 per UTF-16 unit, so the exact byte count is only needed near the limit. */
    function overByteLimit(output: string): boolean {
      return output.length * 3 > MAX_BYTES && Buffer.byteLength(output, "utf8") > MAX_BYTES;
    }

    /**
     * Lexical emission with an optional global node budget (every key and value costs one, pre-order).
     * A subtree whose source already has no whitespace outside tokens (lexical length equals its span length)
     * is emitted and required as ONE source span: same rendered bytes, every token still declared evidence.
     * Returns the lexical length, or -1 when the budget is exhausted.
     */
    function emitLexical(node: JsonNode, pieces: Piece[], required: Span[], offset = 0, budget?: { left: number }): number {
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
    function lexicalJson(node: JsonNode, pieces: Piece[], required: Span[]): void {
      emitLexical(node, pieces, required);
    }

    function jsonField(node: JsonNode, name: string): JsonNode | undefined {
      if (node.kind !== "object") return undefined;
      for (const entry of node.entries) if (entry.name === name) return entry.value;
      return undefined;
    }
    function protocolError(node: JsonNode): boolean {
      const error = jsonField(node, "error");
      return error?.kind === "object" && typeof scalar(jsonField(error, "code")) === "number"
        && typeof scalar(jsonField(error, "message")) === "string"
        && (scalar(jsonField(node, "jsonrpc")) === "2.0"
          || (typeof scalar(jsonField(node, "id")) === "number" && !jsonField(node, "result")));
    }
    function jsonCarrier(observation: AutomaticObservation): boolean {
      if (observation.status !== "success" || observation.completeness !== "complete") return false;
      if (observation.source === "mcp") return true;
      if (observation.tool !== "bash" || observation.metadata.exit !== 0 || observation.metadata.truncated !== false
        || typeof observation.args.command !== "string") return false;
      const argv = tokenizeAutomaticCommand(observation.args.command);
      if (!argv) return false;
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

    interface JsonSection { readonly output: string; readonly start: number; readonly end: number }
    interface JsonView {
      readonly output: string; readonly tool: string; readonly source: string;
      readonly section: JsonSection | undefined; parsed: boolean; root: JsonNode | undefined;
    }
    /**
     * One section and one parse per observation: auto-cdp and auto-json (and the wrapper check) see the same
     * immutable text. Keyed weakly by the observation and revalidated against its carrier facts, so a reused
     * or mutated caller object can never receive another text's tree.
     */
    const views = new WeakMap<object, JsonView>();
    function sectionOf(output: string, tool: string, source: string): { section: JsonSection | undefined; root?: JsonNode } {
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
      const root = parseJson(text);
      return root ? { section: { output: text, start, end }, root } : { section: undefined };
    }
    function jsonView(observation: AutomaticObservation): JsonView {
      const { output, tool, source } = observation, hit = views.get(observation);
      if (hit && hit.output === output && hit.tool === tool && hit.source === source) return hit;
      const { section, root } = sectionOf(output, tool, source);
      const view: JsonView = { output, tool, source, section, parsed: root !== undefined || section === undefined, root };
      views.set(observation, view);
      return view;
    }
    /** The parsed section payload (undefined when absent or malformed), parsed at most once per observation. */
    function jsonSectionRoot(observation: AutomaticObservation): { section: JsonSection; root: JsonNode | undefined } | undefined {
      const view = jsonView(observation);
      if (!view.section) return undefined;
      if (!view.parsed) { view.root = parseJson(view.section.output); view.parsed = true; }
      return { section: view.section, root: view.root };
    }

    /** Exact native wrappers only. Payload spans are virtual UTF-16 offsets into the response. */
    function nativeJsonSection(observation: AutomaticObservation): { output: string; start: number; end: number } | undefined {
      const section = jsonView(observation).section;
      return section && { output: section.output, start: section.start, end: section.end };
    }
    function nativeJsonReduction(observation: AutomaticObservation, section: { start: number; end: number }, reduction: Reduction): Reduction {
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
    function wrapperPrefix(section: JsonSection, pieces: Piece[], required: Span[]): void {
      if (section.start) { const prefix: Span = [0, section.start]; pieces.push(prefix); required.push(prefix); }
    }
    function wrapperSuffix(section: JsonSection, length: number, pieces: Piece[], required: Span[]): void {
      if (section.end < length) { const suffix: Span = [section.end, length]; pieces.push(suffix); required.push(suffix); }
    }

    /** JSON and NDJSON share one global syntax-node budget, never one budget per record. */
    const reduceAutomaticJson: AutomaticReducer = observation => {
      if (!jsonCarrier(observation) || overByteLimit(observation.output)) return;
      const parsed = jsonSectionRoot(observation);
      if (!parsed) return;
      const { section, root: whole } = parsed, { output } = section, pieces: Piece[] = [], required: Span[] = [];
      const budget = { left: 25000 };
      wrapperPrefix(section, pieces, required);
      const evidence = required.length;
      if (whole) {
        if (protocolError(whole) || emitLexical(whole, pieces, required, section.start, budget) < 0) return;
      } else {
        // A single-line payload is its only record, and that record is the text that just failed to parse whole.
        if (!output.includes("\n")) return;
        // A wrapped section always parsed whole, so records are only ever unwrapped (offset 0) payloads.
        let offset = 0, records = 0;
        for (const line of output.split("\n")) {
          if (offset === output.length && line === "") break;
          if (++records > 25000) return;
          const node = parseJson(line);
          if (!node || protocolError(node)) return;
          if (records > 1) pieces.push(newline);
          if (emitLexical(node, pieces, required, section.start + offset, budget) < 0) return;
          offset += line.length + 1;
        }
        if (output.endsWith("\n")) pieces.push(newline);
      }
      if (required.length === evidence) return;
      wrapperSuffix(section, observation.output.length, pieces, required);
      return { pieces, required };
    };
    return { JSON_TEXT, overByteLimit, emitLexical, lexicalJson, jsonField, protocolError, jsonCarrier, jsonSectionRoot, nativeJsonSection,
      nativeJsonReduction, wrapperPrefix, wrapperSuffix, reduceAutomaticJson };
  })();
  const cdp = (() => {
    const { scalar } = core;
    const { JSON_TEXT, emitLexical, jsonCarrier, jsonField, jsonSectionRoot, overByteLimit, protocolError, wrapperPrefix, wrapperSuffix } = json;

    const { openArray, closeArray, openObject, closeObject, comma, colon } = JSON_TEXT;
    const columnsLabel: Piece = Object.freeze({ text: '"columns":' }), rowsLabel: Piece = Object.freeze({ text: '"rows":' });
    const cellEncoding: Piece = Object.freeze({ text: '"cellEncoding":"optional"' });

    /** Native AX nodes only; sparse cells preserve absence separately from null/empty values. */
    const reduceAutomaticCdp: AutomaticReducer = observation => {
      if (!jsonCarrier(observation) || overByteLimit(observation.output)) return;
      const parsed = jsonSectionRoot(observation);
      if (!parsed) return;
      const { section, root } = parsed, source = section.output;
      if (!root || protocolError(root)) return;
      const result = jsonField(root, "result");
      const accessibility = jsonField(root, "accessibility");
      const nodes = jsonField(root, "nodes") ?? (jsonField(root, "id") ? result && jsonField(result, "nodes") : undefined)
        ?? (accessibility && jsonField(accessibility, "nodes"));
      if (nodes?.kind !== "array" || nodes.items.length === 0) return;
      // One pass per node: unique nonempty string nodeId, boolean ignored, consistent key lexemes and field order.
      // Per key name: its first key node and lexeme, successor names (field-order edges) and in-degree.
      interface Column { readonly key: JsonNode; readonly lexeme: string; readonly plain: boolean; readonly next: Set<string>; incoming: number; last: string | undefined }
      const ids = new Set<string>(), keys = new Map<string, Column>();
      for (const node of nodes.items) {
        if (node.kind !== "object") return;
        let previous: Column | undefined, nodeId: JsonNode | undefined, ignored: JsonNode | undefined;
        for (const entry of node.entries) {
          const name = entry.name;
          if (name === "nodeId") nodeId = entry.value;
          else if (name === "ignored") ignored = entry.value;
          // Sparse rows must reconstruct each node's original field order and key lexemes. A key lexeme exactly
          // two units longer than its decoded name has no escape, so it is `"name"`; equal-length ones are equal.
          let known = keys.get(name);
          const [start, end] = entry.key.span;
          if (known) {
            if (end - start !== known.lexeme.length || (!known.plain && !source.startsWith(known.lexeme, start))) return;
          } else {
            const lexeme = source.slice(start, end);
            known = { key: entry.key, lexeme, plain: lexeme.length === name.length + 2, next: new Set(), incoming: 0, last: undefined };
            keys.set(name, known);
          }
          // `last` is the latest successor already recorded, so repeated field sequences skip the set lookup.
          if (previous !== undefined && previous.last !== name) {
            if (!previous.next.has(name)) { previous.next.add(name); known.incoming++; }
            previous.last = name;
          }
          previous = known;
        }
        const id = scalar(nodeId);
        if (typeof id !== "string" || !id.length || ids.has(id) || typeof scalar(ignored) !== "boolean") return;
        ids.add(id);
      }
      const ready = [...keys.keys()].filter(name => keys.get(name)!.incoming === 0), columns: { name: string; key: JsonNode }[] = [];
      for (let i = 0; i < ready.length; i++) {
        const name = ready[i]!, column = keys.get(name)!; columns.push({ name, key: column.key });
        for (const next of column.next) {
          const successor = keys.get(next)!;
          if (--successor.incoming === 0) ready.push(next);
        }
      }
      if (columns.length !== keys.size) return;
      // Bound sparse expansion as well as parser work.
      if (columns.length * nodes.items.length > 25000) return;
      const rows = nodes.items, offset = section.start, pieces: Piece[] = [], required: Span[] = [];
      const [nodesStart, nodesEnd] = nodes.span;
      wrapperPrefix(section, pieces, required);
      const lexical = (node: JsonNode) => { emitLexical(node, pieces, required, offset); };
      function table(): boolean {
        pieces.push(openObject, columnsLabel, openArray);
        for (let i = 0; i < columns.length; i++) { if (i) pieces.push(comma); lexical(columns[i]!.key); }
        pieces.push(closeArray, comma, rowsLabel, openArray);
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]!;
          if (row.kind !== "object") return false;
          // Topological columns respect every row's field order, so each row's entries appear in column order.
          const entries = row.entries;
          let next = 0;
          if (i) pieces.push(comma);
          pieces.push(openArray);
          for (let j = 0; j < columns.length; j++) {
            if (j) pieces.push(comma);
            pieces.push(openArray);
            const entry = entries[next];
            if (entry !== undefined && entry.name === columns[j]!.name) { lexical(entry.value); next++; }
            pieces.push(closeArray);
          }
          if (next !== entries.length) return false;
          pieces.push(closeArray);
        }
        pieces.push(closeArray, comma, cellEncoding, closeObject);
        return true;
      }
      // Only objects enclosing the nodes array are walked; every other value is plain lexical evidence.
      function emit(node: JsonNode): boolean {
        if (node === nodes) return table();
        if (node.kind !== "object" || !node.entries.length || node.span[0] > nodesStart || node.span[1] < nodesEnd) { lexical(node); return true; }
        pieces.push(openObject);
        for (let i = 0; i < node.entries.length; i++) {
          const entry = node.entries[i]!;
          if (i) pieces.push(comma);
          lexical(entry.key); pieces.push(colon);
          if (!emit(entry.value)) return false;
        }
        pieces.push(closeObject);
        return true;
      }
      if (!emit(root)) return;
      wrapperSuffix(section, observation.output.length, pieces, required);
      return { pieces, required };
    };
    return { reduceAutomaticCdp };
  })();
  const mcp = (() => {
    const { parseJson } = core;
    const { protocolError } = json;
    const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
    // A protocol error envelope is a top-level JSON object with an "error" member. Without the literal key
    // spelling or a \u escape (the only JSON escape that can spell letters), no parse can find one.
    function mayBeEnvelope(text: string): boolean {
      let index = 0;
      for (let code = text.charCodeAt(0); code === 32 || code === 9 || code === 10 || code === 13; code = text.charCodeAt(++index));
      return text.charCodeAt(index) === 123 && (text.includes('"error"') || text.includes("\\u"));
    }
    /** Host clipping notice, JSON-RPC error envelope or a Playwright `### Error` line outside fences. */
    function errorText(text: string): boolean {
      if (/^\.\.\.(?:output truncated|\d+ (?:lines|bytes) truncated)\.\.\./.test(text)) return true;
      if (mayBeEnvelope(text)) {
        const json = parseJson(text);
        if (json && protocolError(json)) return true;
      }
      // Line scan without splitting: a fence line is ``` followed by no further backtick on that line.
      let fenced = false;
      for (let start = 0; start <= text.length;) {
        let end = text.indexOf("\n", start);
        if (end < 0) end = text.length;
        if (text.startsWith("```", start)) {
          const tick = text.indexOf("`", start + 3);
          if (tick < 0 || tick >= end) fenced = !fenced;
        } else if (!fenced && end - start === 9 && text.startsWith("### Error", start)) return true;
        start = end + 1;
      }
      return false;
    }
    return { errorText };
  })();
  return { parseJson: core.parseJson, emitLexical: json.emitLexical, protocolError: json.protocolError, reduceAutomaticJson: json.reduceAutomaticJson,
    reduceAutomaticCdp: cdp.reduceAutomaticCdp, errorText: mcp.errorText, nativeJsonSection: json.nativeJsonSection };
})();

// ---- differential harness ----
type Obs = AutomaticObservation;
const success = { status: "success", completeness: "complete" } as const;
const mcp = (output: string, tool = "unknown_inventory"): Obs => ({ source: "mcp", tool, output, args: {}, metadata: {}, ...success });
const bash = (command: string, output: string, metadata: Record<string, unknown> = { exit: 0, truncated: false }): Obs =>
  ({ source: "native", tool: "bash", output, args: { command }, metadata, ...success });
const stats = { texts: 0, valid: 0, envelopes: 0, observations: 0, json: 0, cdp: 0, errorTexts: 0, errorPositive: 0 };
const SENTINEL: Piece = Object.freeze({ text: "" });

function outcome(reduction: Reduction | undefined, output: string): string {
  if (reduction === undefined) return "undefined";
  try { return `render:${renderReduction(output, reduction)}`; } catch { return "invalid"; }
}
/** Every byte the reference declared required is still required by the new reduction. */
function covers(nextSpans: readonly Span[], reference: readonly Span[]): boolean {
  const merged: [number, number][] = [];
  for (const [start, end] of [...nextSpans].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end); else merged.push([start, end]);
  }
  return reference.every(([start, end]) => merged.some(span => span[0] <= start && span[1] >= end));
}
function nodeCount(node: JsonNode): number {
  if (node.kind === "scalar") return 1;
  if (node.kind === "array") return 1 + node.items.reduce((sum, item) => sum + nodeCount(item), 0);
  return 1 + node.entries.reduce((sum, entry) => sum + 1 + nodeCount(entry.value), 0);
}
/** Expected records: every value at depth <= 4 in pre-order, with key span, enclosing start and compactness. */
function expectedRecords(text: string, root: JsonNode): number[][] {
  const rows: number[][] = [];
  const visit = (node: JsonNode, depth: number, parent: number, key: JsonNode | undefined): void => {
    if (depth > 4) return;
    const pieces: Piece[] = [], required: Span[] = [];
    ref.emitLexical(node, pieces, required);
    const compact = pieces.length === 1 && Array.isArray(pieces[0]) && (pieces[0] as Span)[0] === node.span[0] && (pieces[0] as Span)[1] === node.span[1];
    const escaped = key !== undefined && text.slice(...key.span).includes("\\");
    rows.push([depth, parent, key ? key.span[0] : -1, key ? key.span[1] : -1, node.span[0], node.span[1], (escaped ? 1 : 0) | (compact ? 2 : 0)]);
    if (node.kind === "array") for (const item of node.items) visit(item, depth + 1, node.span[0], undefined);
    else if (node.kind === "object") for (const entry of node.entries) visit(entry.value, depth + 1, node.span[0], entry.key);
  };
  visit(root, 0, -1, undefined);
  return rows;
}
function subnodes(node: JsonNode, into: JsonNode[], limit: number): JsonNode[] {
  if (into.length >= limit) return into;
  into.push(node);
  if (node.kind === "array") for (const item of node.items) subnodes(item, into, limit);
  else if (node.kind === "object") for (const entry of node.entries) subnodes(entry.value, into, limit);
  return into;
}

/** Scanner level: acceptance, exact node count and limit edge, envelope verdict, lexical emission, records, ranges. */
function checkText(text: string, label: string): void {
  stats.texts++;
  const tree = ref.parseJson(text), offset = 1 + (text.length % 7);
  const pieces: Piece[] = [SENTINEL], required: Span[] = [[0, 1]];
  const end = scanJson(text, offset, 25000, pieces, required);
  if (!tree) {
    if (end !== -1) assert.fail(`${label}: scanner accepted what the tree parser refuses: ${JSON.stringify(text.slice(0, 120))}`);
    assert.ok(pieces.length === 1 && pieces[0] === SENTINEL && required.length === 1, `${label}: failed scan left emission behind`);
    assert.equal(scanJson(text, 0, 25000), -1, label);
    assert.equal(recordJson(text, 25000), undefined, label);
    return;
  }
  stats.valid++;
  if (end < 0) assert.fail(`${label}: scanner refused what the tree parser accepts: ${JSON.stringify(text.slice(0, 120))}`);
  const expectedPieces: Piece[] = [SENTINEL], expectedRequired: Span[] = [[0, 1]];
  ref.emitLexical(tree, expectedPieces, expectedRequired, offset);
  assert.equal(JSON.stringify(pieces), JSON.stringify(expectedPieces), `${label}: pieces differ`);
  assert.equal(JSON.stringify(required), JSON.stringify(expectedRequired), `${label}: required differ`);
  const nodes = nodeCount(tree), envelope = ref.protocolError(tree);
  assert.equal(scanned.nodes, nodes, `${label}: node count`);
  assert.equal(scanned.envelope, envelope, `${label}: envelope verdict`);
  if (envelope) stats.envelopes++;
  assert.ok(scanJson(text, 0, nodes) >= 0 && scanned.nodes === nodes && scanned.envelope === envelope, `${label}: exact limit admits`);
  assert.equal(scanJson(text, 0, nodes - 1), -1, `${label}: one node over the limit refuses`);
  const records = recordJson(text, 25000);
  assert.ok(records, `${label}: records`);
  const rows = expectedRecords(text, tree);
  assert.equal(records.count, rows.length, `${label}: record count`);
  for (let i = 0; i < rows.length; i++) {
    const actual: number[] = [records.depth[i]!, records.parent[i]!, records.keyStart[i]!, records.keyEnd[i]!, records.valueStart[i]!, records.valueEnd[i]!, records.flags[i]!];
    if (actual.join() !== rows[i]!.join()) assert.fail(`${label}: record ${i} ${actual.join()} != ${rows[i]!.join()}`);
  }
  // Range scans (as auto-cdp emits cells): each value's own lexical emission, ending at its span end.
  for (const node of subnodes(tree, [], 40)) {
    const rangePieces: Piece[] = [], rangeRequired: Span[] = [], treePieces: Piece[] = [], treeRequired: Span[] = [];
    assert.equal(scanJsonValue(text, node.span[0], offset, Infinity, rangePieces, rangeRequired), node.span[1], `${label}: range end`);
    ref.emitLexical(node, treePieces, treeRequired, offset);
    assert.equal(JSON.stringify(rangePieces) + JSON.stringify(rangeRequired), JSON.stringify(treePieces) + JSON.stringify(treeRequired), `${label}: range emission`);
  }
}

const pairs: [string, AutomaticReducer, AutomaticReducer][] = [["auto-cdp", ref.reduceAutomaticCdp, reduceAutomaticCdp], ["auto-json", ref.reduceAutomaticJson, next.reduceAutomaticJson]];
const referenceRegistry: AutomaticEntry[] = automaticReducers.map(entry =>
  ({ id: entry.id, reduce: entry.id === "auto-cdp" ? ref.reduceAutomaticCdp : entry.id === "auto-json" ? ref.reduceAutomaticJson : entry.reduce }));
/** Reducer level: both reducers in registry order on one shared object per side, then reversed on fresh objects. */
function checkObservation(observation: Obs, label: string, endToEnd = false): void {
  stats.observations++;
  const left = Object.freeze({ ...observation }), right = Object.freeze({ ...observation });
  const reversedLeft = Object.freeze({ ...observation }), reversedRight = Object.freeze({ ...observation });
  const compare = (id: string, expected: Reduction | undefined, actual: Reduction | undefined, order: string) => {
    const a = outcome(expected, observation.output), b = outcome(actual, observation.output);
    if (a !== b) assert.fail(`${label} ${id} ${order}: reference ${a.slice(0, 160)} != new ${b.slice(0, 160)}`);
    if (expected && actual) {
      if (JSON.stringify(expected) !== JSON.stringify(actual)) assert.fail(`${label} ${id} ${order}: reduction differs`);
      assert.ok(covers(actual.required, expected.required), `${label} ${id}: required evidence weakened`);
      if (order === "registry") id === "auto-cdp" ? stats.cdp++ : stats.json++;
    }
  };
  for (const [id, reference, current] of pairs) compare(id, reference(left), current(right), "registry");
  for (const [id, reference, current] of [...pairs].reverse()) compare(id, reference(reversedLeft), current(reversedRight), "reversed");
  assert.equal(JSON.stringify(next.nativeJsonSection(right)), JSON.stringify(ref.nativeJsonSection(left)), `${label}: native section`);
  if (endToEnd) {
    const expected = filterAutomatic(observation, { reducers: referenceRegistry }), actual = filterAutomatic(observation);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) assert.fail(`${label}: filterAutomatic differs`);
  }
}
function checkErrorText(text: string, label: string): void {
  stats.errorTexts++;
  const expected = ref.errorText(text);
  if (errorText(text) !== expected) assert.fail(`${label}: errorText ${!expected} != reference ${expected}: ${JSON.stringify(text.slice(0, 120))}`);
  if (expected) stats.errorPositive++;
}

// ---- seeded generators ----
function rng(seed: number) {
  let state = seed >>> 0;
  const nextValue = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (n: number) => Math.floor(nextValue() * n), pick = <T>(list: readonly T[]): T => list[int(list.length)]!;
  return { int, pick, chance: (p: number) => nextValue() < p };
}
type R = ReturnType<typeof rng>;
const SPACES = [" ", "\n", "\t", "\r", "\r\n", "  ", "\n    ", "\n\t", " \r\n "];
/** Not JSON whitespace: NBSP, BOM, VT, FF, LINE SEPARATOR, IDEOGRAPHIC SPACE, NEL, NUL. */
const BAD_SPACES = [" ", "﻿", "\u000b", "\u000c", " ", "　", "\u0085", "\u0000"];
const BODY = ["a", "abc", "with space", "path/to/file.txt", "é", "東京", "😀", " ", " ", "\u007f", "\ud800", "\udfff", "x".repeat(40),
  "\\\"", "\\\\", "\\/", "\\b", "\\f", "\\n", "\\r", "\\t", "\\u00e9", "\\u00E9", "\\uD83D\\uDE00", "\\ud800", "\\u0000", "\\u0022", "\\u005c", "\\u0061"];
const BAD_BODY = ["\\x", "\\u12G4", "\\u12", "\\'", "\\", "\u0001", "\t", "\n", "\r", "\u001f", "\\U0041", "\\u{41}"];
const NUMBERS = ["0", "-0", "1", "42", "-17", "1.5", "-0.0", "1e3", "1E+3", "1e-3", "2.5E-10", "9007199254740993", "123456789012345678901234567890",
  "1e400", "-1e400", "0.1", "100", "123456789012345", "1234567890123456"];
const BAD_NUMBERS = ["01", "-01", "1.", ".5", "-", "+1", "1e", "1e+", "1.e3", "Infinity", "NaN", "0x10", "1_000", "--1", "1.2.3", "00",
  "1e.5", "1E.5", "1e+-1", "1ee1", "-.5", "1.5e", "0.e1", "1e+.5", "-e1", "1.5E+"];
const KEYS = ['"a"', '"\\u0061"', '"b"', '"ab1b"', '"ab2b"', '"ab1B"', '"aXb"', '""', '"error"', '"\\u0065rror"', '"err\\u006fr"', '"jsonrpc"', '"id"', '"\\u0069d"',
  '"result"', '"code"', '"message"', '"m\\u0065ssage"', '"nodes"', '"n\\u006fdes"', '"data"', '"k"', '"averyveryverylongkeyname"', '"averyveryverylongkeynamf"', '"😀"', '"\\uD83D\\uDE00"'];
function stringToken(r: R, bad: boolean): string {
  let body = "";
  for (let i = 0, n = r.int(4); i < n; i++) body += r.pick(BODY);
  if (bad) body += r.pick(BAD_BODY);
  return `"${body}"`;
}
interface Style { ws: () => string; bad: number }
function style(r: R): Style {
  const kind = r.int(4), bad = r.chance(0.08) ? 0.01 : 0;
  const base = kind === 0 ? () => "" : kind === 1 ? () => (r.chance(0.7) ? " " : "\n  ") : kind === 2 ? () => r.pick(["", "", "", ...SPACES]) : () => (r.chance(0.5) ? "" : " ");
  return { ws: () => (bad && r.chance(bad) ? r.pick(BAD_SPACES) : base()), bad };
}
/** Random JSON text with whitespace at every token boundary; `bad` occasionally plants an invalid token. */
function randomJson(r: R, depth: number, s: Style, maxDepth = 5): string {
  const bad = s.bad > 0 && r.chance(0.02);
  const roll = r.int(depth >= maxDepth ? 4 : 10);
  if (roll === 0) return bad ? r.pick(BAD_NUMBERS) : r.pick(NUMBERS);
  if (roll <= 2) return stringToken(r, bad);
  if (roll === 3) return bad ? r.pick(["tru", "nul", "True", "nulll", "falsey"]) : r.pick(["true", "false", "null"]);
  const count = r.chance(0.15) ? 0 : 1 + r.int(r.chance(0.1) ? 20 : 4), parts: string[] = [];
  if (roll <= 6) {
    for (let i = 0; i < count; i++) parts.push(s.ws() + randomJson(r, depth + 1, s, maxDepth) + s.ws());
    return `[${parts.join(",") || s.ws()}${bad ? "," : ""}]`;
  }
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    let key = r.chance(0.7) ? r.pick(KEYS) : stringToken(r, false);
    // Mostly unique keys; sometimes an exact repeat or an escaped alias of an earlier key (both duplicates).
    if (keys.includes(key) && !r.chance(0.1)) key = `"u${depth}_${i}"`;
    keys.push(key);
    parts.push(`${s.ws()}${key}${s.ws()}:${s.ws()}${randomJson(r, depth + 1, s, maxDepth)}${s.ws()}`);
  }
  return `{${parts.join(",") || s.ws()}}`;
}
/** Top-level members that make, or nearly make, a protocol error envelope, in random order. */
function envelope(r: R, s: Style): string {
  const members: string[] = [];
  const code = r.pick(["1", "-32600", "1.5", "-0", "1e3", "-32601", "2", '"1"', "null", "true"]), message = r.pick(['"bad"', '""', '"\\u0062ad"', '"x y"', '"bad"', "1", "null", "[]"]);
  const errorValue = r.pick([`{"code":${code},"message":${message}}`, `{"code":${code},"message":${message}}`, `{"message":${message},"code":${code}}`,
    `{ "message" : ${message} , "code" : ${code} , "data" : ${randomJson(r, 2, s)} }`, `{"code":${code},"data":null,"message":${message}}`,
    `{"c\\u006fde":${code},"message":${message}}`, `{"code":${code}}`, `{"message":${message}}`, `{}`, `[]`, `"error"`, "null", `{"code":${code},"message":${message},"code":1}`]);
  if (r.chance(0.9)) members.push(`${r.pick(['"error"', '"\\u0065rror"', '"error"'])}:${errorValue}`);
  if (r.chance(0.5)) members.push(`${r.pick(['"jsonrpc"', '"js\\u006enrpc"'])}:${r.pick(['"2.0"', '"\\u0032.0"', '"2.00"', "2.0", '"1.0"', '"2.0 "'])}`);
  if (r.chance(0.6)) members.push(`${r.pick(['"id"', '"\\u0069d"'])}:${r.pick(["1", "0", "-1", "1.5e2", '"1"', "null", "{}"])}`);
  if (r.chance(0.3)) members.push(`"result":${r.pick(["null", "false", "{}", "0", randomJson(r, 2, s)])}`);
  if (r.chance(0.4)) members.push(`"extra":${randomJson(r, 2, s)}`);
  for (let i = members.length - 1; i > 0; i--) { const j = r.int(i + 1); [members[i], members[j]] = [members[j]!, members[i]!]; }
  const object = `{${members.map(member => s.ws() + member.replace(":", s.ws() + ":" + s.ws()) + s.ws()).join(",")}}`;
  return r.chance(0.05) ? `[${object}]` : r.chance(0.05) ? `{"nested":${object}}` : object;
}
/** A valid envelope, or the same with exactly one near miss (half each). */
function envelopeCase(r: R, s: Style): string {
  const errorKey = r.pick(['"error"', '"\\u0065rror"', '"err\\u006Fr"']), code = r.pick(["-32600", "1", "0", "-0", "1.5e3"]), message = r.pick(['"bad"', '""', '"\\u0062ad 😀"']);
  const members = new Map<string, string>([[errorKey, r.chance(0.5) ? `{"code":${code},"message":${message}}` : `{ "message" : ${message}, "data" : [1, {"code":"x"}], "code" : ${code} }`]]);
  const route = r.int(3);
  if (route !== 1) members.set(r.pick(['"jsonrpc"', '"js\\u006Enrpc"']), r.pick(['"2.0"', '"\\u0032.0"', '"2\\u002e0"']));
  if (route !== 0) members.set(r.pick(['"id"', '"\\u0069d"']), r.pick(["1", "0", "-7", "2.5", "1e2"]));
  if (route === 2 && r.chance(0.5)) members.set('"result"', "null");
  if (r.chance(0.3)) members.set('"extra"', randomJson(r, 2, s));
  let text = `{${[...members].map(([key, value]) => `${s.ws()}${key}${s.ws()}:${s.ws()}${value}${s.ws()}`).join(",")}}`;
  if (r.chance(0.5)) {
    const misses: (() => string)[] = [
      () => text.replace(`"code":${code}`, `"code":"${code}"`).replace(`"code" : ${code}`, `"code" : "${code}"`),
      () => text.replace(`"message":${message}`, '"message":1').replace(`"message" : ${message}`, '"message" : null'),
      () => text.replace(/"2(?:\.|\\u002e)0"|"\\u0032\.0"/, '"2.00"').replace(/(\{|,)\s*"(?:id|\\u0069d)"\s*:\s*[-0-9.e]+/, "$1\"id\":\"1\""),
      () => route === 1 ? text.replace(/\}$/, ',"result":0}') : text.replace(/"2(?:\.|\\u002e)0"|"\\u0032\.0"/, '"1.0"'),
      () => `[${text}]`, () => `{"wrapped":${text}}`, () => text.replace(errorKey, '"errors"'), () => text.replace(/\}$/, `,${errorKey}:{}}`),
      () => text.replace(/^\{/, "{ \"error\" : [ ] ,").replace(errorKey, '"other"'), () => text + " x", () => "\ufeff" + text];
    text = r.pick(misses)();
  }
  return text;
}
function mutate(r: R, text: string): string {
  const at = r.int(text.length + 1);
  switch (r.int(10)) {
    case 0: return text.slice(0, at) + r.pick([...SPACES, ...BAD_SPACES]) + text.slice(at);
    case 1: return text.slice(0, at) + text.slice(at + 1);
    case 2: return text.slice(0, at);
    case 3: return text + r.pick(["x", " x", "}", "]", ",", "\u0000", "﻿", " 1", '""']);
    case 4: return r.pick(["﻿", " ", "\u000b", "\u000c"]) + text;
    case 5: return text.slice(0, at) + r.pick(["\\", '"', "{", "[", ",", ":", "\\u", "0", "-", "e", "\u0001"]) + text.slice(at);
    case 6: return text.replace(/"[a-z]/, match => `"\\u00${match.charCodeAt(1).toString(16)}`);
    default: return text;
  }
}
function nested(depth: number, object: boolean, empty: boolean, space: string): string {
  const open = object ? `{${space}"k"${space}:${space}` : `[${space}`, close = object ? `${space}}` : `${space}]`;
  return open.repeat(depth) + (empty ? (object ? `{${space}}` : `[${space}]`) : `${space}0${space}`) + close.repeat(depth);
}
const JSON_COMMANDS = ["curl -fsS http://127.0.0.1/x", "jq . file.json", "node script.js", "python3 script.py", "gh api user", "kubectl get pods -o json",
  "docker ps --format json", "npm ls --json", "system_profiler -json", "pwsh -Command ConvertTo-Json", "git status", "node --test x.js"];
/** One payload under every carrier family: unknown MCP, curl-style shell, and the three exact native wrappers. */
function carriers(r: R, payload: string): Obs[] {
  return [mcp(payload), bash(r.pick(JSON_COMMANDS), payload, r.chance(0.95) ? { exit: 0, truncated: false } : { exit: 1, truncated: false }),
    mcp(`### Result\n${payload}\n### Ran Playwright code\n\`\`\`js\nreturn x;\n\`\`\``, r.pick(["browser_evaluate", "pw_browser_run_code_unsafe", "browser_run_code_unsafe"])),
    mcp(`Script ran on page and returned:\n\`\`\`json\n${payload}${r.pick(["\n```\n", "\n```"])}`, r.pick(["evaluate_script", "x_evaluate_script"]))];
}
function serialize(value: unknown, ws: () => string): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => ws() + serialize(item, ws) + ws()).join(",") || ws()}]`;
  return `{${Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => `${ws()}${JSON.stringify(k)}${ws()}:${ws()}${serialize(v, ws)}${ws()}`).join(",") || ws()}}`;
}
/** CDP AX node lists: placements, field order, aliases, ids, ignored flags, envelopes; compact, pretty or mixed. */
function cdpPayload(r: R): string {
  const FIELDS = ["nodeId", "ignored", "ignoredReasons", "role", "name", "properties", "parentId", "childIds", "backendDOMNodeId", "value", "extension"];
  const values: unknown[] = [false, 0, "", null, {}, [], { type: "role", value: "button" }, [{ name: "hidden", value: { type: "boolean", value: false } }], "😀", 9, "a\nb", { deep: { deeper: [1, { x: [] }] } }];
  const length = r.chance(0.03) ? 0 : 1 + r.int(r.chance(0.1) ? 40 : 6), nodes: unknown[] = [];
  for (let n = 0; n < length; n++) {
    if (r.chance(0.01)) { nodes.push(r.pick([[], "node", null, 1])); continue; }
    const node: Record<string, unknown> = {};
    for (const field of FIELDS) {
      if (field === "nodeId") node.nodeId = r.chance(0.97) ? String(r.chance(0.97) ? n + 1 : 1) : r.pick(["", 7, undefined, null, ["1"]]);
      else if (field === "ignored") { if (r.chance(0.97)) node.ignored = r.chance(0.95) ? r.chance(0.5) : r.pick(["false", 0, null]); }
      else if (r.chance(0.5)) node[field] = r.pick(values);
    }
    if (r.chance(0.1)) { const keys = Object.keys(node); const k = keys[r.int(keys.length)]; if (k) { const v = node[k]; delete node[k]; node[k] = v; } }
    nodes.push(node);
  }
  const envelopeValue: unknown = r.pick([() => ({ nodes }), () => ({ id: 4, result: { nodes, extra: [] }, sessionId: "s" }), () => ({ result: { nodes } }),
    () => ({ accessibility: { nodes, tree: "full" }, control: { hasMore: true } }), () => ({ jsonrpc: "2.0", id: 1, result: { nodes } }),
    () => ({ id: 1, error: { code: -1, message: "bad" } }), () => ({ hugr: { nodes } }), () => ({ nodes: null, accessibility: { nodes } }),
    () => ({ id: null, result: { nodes }, accessibility: { nodes: [] } }), () => ({ result: [], accessibility: { nodes } }), () => ({ before: [1, 2], nodes, after: { a: "b" } }),
    () => ({ id: 3, result: "x", accessibility: { nodes } }), () => [{ nodes }], () => ({ jsonrpc: "2.0", error: { code: -1, message: "bad" }, nodes }),
    () => ({ id: 2, error: { code: 1, message: "m" }, accessibility: { nodes } }), () => ({ id: 2, error: { code: "1", message: "m" }, accessibility: { nodes } })])();
  const kind = r.int(3), ws = style(r).ws;
  let text = kind === 0 ? JSON.stringify(envelopeValue) : kind === 1 ? JSON.stringify(envelopeValue, null, r.pick([1, 2, "\t"])) : serialize(envelopeValue, ws);
  if (r.chance(0.15)) { const key = `"${r.pick([...FIELDS, "nodes", "id", "result", "accessibility"])}":`; const at = text.lastIndexOf(key); if (at >= 0) text = `${text.slice(0, at)}"\\u00${key.charCodeAt(1).toString(16)}${key.slice(2)}${text.slice(at + key.length)}`; }
  if (r.chance(0.05)) { const key = `"${r.pick(FIELDS)}":`; const at = text.indexOf(key); if (at >= 0) text = `${text.slice(0, at)}"\\u00${key.charCodeAt(1).toString(16)}${key.slice(2)}${text.slice(at + key.length)}`; }
  if (r.chance(0.1)) {
    // Escaped key spellings per occurrence: equal decoded names whose lexemes differ only in hex case refuse.
    const key = r.pick(["role", "name", "value", "extension", "parentId"]), hex = key.charCodeAt(0).toString(16);
    text = text.replaceAll(`"${key}":`, () => `"\\u00${r.chance(0.5) ? hex : hex.toUpperCase()}${key.slice(1)}":`);
  }
  if (r.chance(0.04)) text = mutate(r, text);
  return text;
}
function cdpCarrier(r: R, text: string): Obs {
  return r.chance(0.3) ? mcp(`### Result\n${text}\n### Ran Playwright code\n\`\`\`js\nreturn x;\n\`\`\``, "browser_run_code_unsafe")
    : r.chance(0.2) ? bash("node ax.js", text) : r.chance(0.1) ? mcp(`Script ran on page and returned:\n\`\`\`json\n${text}\n\`\`\``, "evaluate_script") : mcp(text, "cdp");
}

// ---- fixed corpora ----
const ROOT = new URL("../fixtures/", import.meta.url);
function jsonFixtureFiles(directory: URL, into: URL[] = []): URL[] {
  for (const name of readdirSync(directory).sort()) {
    const url = new URL(name, directory);
    if (statSync(url).isDirectory()) jsonFixtureFiles(new URL(`${name}/`, directory), into);
    else if (/\.(?:json|jsonl|ndjson)$/.test(name)) into.push(url);
  }
  return into;
}
/** Strings embedded in a fixture that carry JSON or NDJSON (captured tool outputs, MCP text blocks). */
function embedded(value: unknown, into: Set<string>): void {
  if (typeof value === "string") { const trimmed = value.trimStart(); if ((trimmed.startsWith("{") || trimmed.startsWith("[") || value.startsWith("### Result\n") || value.startsWith("Script ran on page")) && value.length < 600000) into.add(value); }
  else if (Array.isArray(value)) for (const item of value) embedded(item, into);
  else if (value !== null && typeof value === "object") for (const item of Object.values(value)) embedded(item, into);
}
/** Real MCP captures: every tools/call text block with its exact tool name, a prefixed alias and an unknown tool. */
function captureBlocks(text: string): { tool: string; text: string }[] {
  const blocks: { tool: string; text: string }[] = [];
  let capture: { records?: { direction: string; message: { id?: number; method?: string; params?: { name?: string }; result?: { content?: { type: string; text?: string }[] } } }[] };
  try { capture = JSON.parse(text); } catch { return blocks; }
  const calls = new Map<number, string>();
  for (const record of capture.records ?? []) {
    const message = record.message;
    if (record.direction === "send" && message.method === "tools/call" && message.id !== undefined) calls.set(message.id, message.params?.name ?? "");
    if (record.direction !== "receive" || message.id === undefined || !calls.has(message.id)) continue;
    for (const block of message.result?.content ?? []) if (block.type === "text" && block.text !== undefined) blocks.push({ tool: calls.get(message.id)!, text: block.text });
  }
  return blocks;
}

test("fixtures: every JSON-bearing fixture, embedded capture and MCP text block matches the tree path", () => {
  const r = rng(0xf17e);
  const strings = new Set<string>();
  let files = 0, blocks = 0;
  for (const url of jsonFixtureFiles(ROOT)) {
    const text = readFileSync(url, "utf8"), label = url.pathname.slice(ROOT.pathname.length);
    files++;
    checkText(text, label); checkErrorText(text, label);
    for (const observation of carriers(r, text)) checkObservation(observation, label, true);
    if (url.pathname.endsWith(".jsonl") || url.pathname.endsWith(".ndjson")) {
      for (const line of text.split("\n")) if (line) { try { embedded(JSON.parse(line), strings); } catch { /* not JSON */ } }
    } else { try { embedded(JSON.parse(text), strings); } catch { /* not JSON */ } }
    for (const block of captureBlocks(text)) {
      blocks++;
      for (const tool of [block.tool, `capture_${block.tool}`, "unknown"]) checkObservation(mcp(block.text, tool), `${label} ${tool}`, true);
      checkErrorText(block.text, `${label} block`);
    }
  }
  for (const state of ["before", "modal"]) {
    const input = readFileSync(new URL(`automatic/browser/native/cdp-${state}.json`, ROOT), "utf8");
    for (const text of [input, JSON.stringify(JSON.parse(input)), JSON.stringify(JSON.parse(input), null, 2)]) {
      checkText(text, `cdp-${state}`);
      for (const observation of [mcp(text, "cdp"), cdpCarrier(r, text), bash("node ax.js", text)]) checkObservation(observation, `cdp-${state}`, true);
    }
  }
  let count = 0;
  for (const text of [...strings].sort()) {
    if (++count > 4000) break;
    checkText(text, "embedded"); checkErrorText(text, "embedded");
    checkObservation(mcp(text), "embedded"); checkObservation(bash("curl -fsS http://127.0.0.1/x", text), "embedded curl");
  }
  assert.ok(files >= 500 && blocks >= 20 && count >= 50, `${files} files, ${blocks} MCP blocks, ${count} embedded payloads`);
});

test("boundaries: nesting 63/64/65, node counts 24,999/25,000/25,001, NDJSON budget, whitespace, BOM and trailing junk", () => {
  const texts: string[] = [];
  for (const depth of [62, 63, 64, 65]) for (const object of [false, true]) for (const empty of [false, true]) for (const space of ["", " ", "\n "]) texts.push(nested(depth, object, empty, space));
  for (const n of [24997, 24998, 24999, 25000]) for (const space of ["", " ", "\n"]) {
    texts.push(`[${space}${Array(n).fill("1").join(`${space},${space}`)}${space}]`); // n + 1 nodes
    texts.push(`[${Array(n - 1).fill('"s"').join(",")},[]]`); // n + 1 nodes, empty tail
  }
  for (const keys of [12498, 12499, 12500]) for (const tail of ["", ',"z":[1]', ',"z":{}', ',"z":[ ]']) {
    texts.push(`{${Array.from({ length: keys }, (_, i) => `"k${i}":${i % 3 ? "null" : i}`).join(",")}${tail}}`);
  }
  // NDJSON: 25,000 one-node records admit, 25,001 refuse; three-node records against the shared budget.
  for (const lines of [24999, 25000, 25001]) for (const end of ["", "\n"]) texts.push(Array(lines).fill("1").join("\n") + end);
  for (const [lines, last] of [[8333, "1"], [8333, "[1]"], [8333, "[1,1]"], [8332, "[1,1]"]] as const) texts.push(Array(lines).fill("[1,1]").join("\n") + `\n${last}\n`);
  const small = ['{"a":1}', "[1, 2]", '"x"', "0", "{ }", "[ ]", "true"];
  for (const value of small) {
    for (const space of [...SPACES, ...BAD_SPACES]) texts.push(space + value, value + space, value.replace(/[,:]/, match => space + match + space));
    for (const junk of ["x", " x", "}", "]", ",", "\u0000", " 1", '""', "\n{}", "{}"]) texts.push(value + junk);
    texts.push("﻿" + value, "﻿ " + value);
  }
  // CDP at the node limit: few cells, one long value (10 + n and 14 + (n - 4) nodes).
  for (const n of [24989, 24990, 24991]) for (const indent of [0, 1]) {
    texts.push(JSON.stringify({ nodes: [{ nodeId: "1", ignored: false, v: Array(n).fill(1) }] }, null, indent));
    texts.push(JSON.stringify({ id: 1, result: { nodes: [{ nodeId: "1", ignored: true, v: Array(n - 4).fill(0) }] } }, null, indent));
  }
  for (const text of texts) {
    const wrapped = mcp(`### Result\n${text}\n### Ran Playwright code\n`, "browser_run_code_unsafe");
    checkText(text, `boundary ${text.length}`);
    for (const observation of [mcp(text), bash("jq . big.json", text), wrapped, mcp(text, "cdp")]) checkObservation(observation, `boundary ${text.length}`, true);
    checkErrorText(text, "boundary");
  }
  // Positive controls for the arithmetic above: exactly 25,000 nodes admit, 25,001 refuse.
  for (const [n, admitted] of [[24999, true], [25000, false]] as const) {
    const text = `[ ${Array(n).fill("1").join(" , ")} ]`;
    assert.equal(next.reduceAutomaticJson(Object.freeze(mcp(text))) !== undefined, admitted, `json at ${n + 1} nodes`);
  }
  for (const [n, admitted] of [[24990, true], [24991, false]] as const) {
    const text = JSON.stringify({ nodes: [{ nodeId: "1", ignored: false, v: Array(n).fill(1) }] }, null, 1);
    assert.equal(reduceAutomaticCdp(Object.freeze(mcp(text, "cdp"))) !== undefined, admitted, `cdp at ${10 + n} nodes`);
  }
  // Duplicate keys around the 16-key switch to a Set, exact and through escaped aliases, plus signature collisions.
  for (let keys = 14; keys <= 19; keys++) for (const duplicate of ['"k3"', '"\\u006b3"', '"k3 "', '"k' + (keys - 1) + '"', '"\\u006b' + (keys - 1) + '"', '"ab1b"', '"ab2b"', '"ab1B"', '"ab\\u0031b"']) {
    const members = Array.from({ length: keys }, (_, i) => `"k${i}":${i}`);
    if (keys % 2) members.splice(2, 0, '"ab1b":0');
    const text = `{${members.join(",")},${duplicate}:true}`;
    checkText(text, `duplicates ${keys} ${duplicate}`); checkObservation(mcp(text), `duplicates ${keys}`, true);
  }
});

test("seeded: generated JSON, NDJSON, envelopes and mutations under every carrier, scanner and errorText", () => {
  const r = rng(0x5eed2026);
  for (let i = 0; i < 64000; i++) {
    const s = style(r);
    let payload: string;
    const kind = r.int(10);
    if (kind < 5) payload = randomJson(r, 0, s);
    else if (kind < 7) payload = envelope(r, s);
    else if (kind < 9) payload = Array.from({ length: 1 + r.int(5) }, () => r.chance(0.2) ? envelope(r, s).replace(/[\r\n]/g, " ") : randomJson(r, 1, s).replace(/[\r\n]/g, " "))
      .join(r.pick(["\n", "\r\n", "\n\n", "\n \n"])) + r.pick(["", "\n", "\n\n"]);
    else payload = randomJson(r, 0, s, 8);
    if (r.chance(0.25)) payload = mutate(r, payload);
    if (r.chance(0.1)) payload = r.pick(SPACES) + payload + r.pick(SPACES);
    const label = `seeded#${i}`;
    checkText(payload, label);
    checkErrorText(payload, label);
    const observations = carriers(r, payload);
    checkObservation(observations[0]!, label, i % 16 === 0);
    checkObservation(observations[1 + r.int(3)]!, label, i % 16 === 8);
    if (i % 4 === 0) checkErrorText(observations[2]!.output, `${label} wrapped`);
  }
  // Envelopes and near misses on their own: positive controls for the verdict and for errorText.
  for (let i = 0; i < 12000; i++) {
    const payload = envelopeCase(r, style(r)), label = `envelope#${i}`;
    checkText(payload, label); checkErrorText(payload, label);
    checkObservation(r.chance(0.5) ? mcp(payload) : bash("curl -fsS http://127.0.0.1/rpc", payload), label);
  }
});

test("seeded CDP: placements, aliases, ids and whitespace under every carrier", () => {
  const r = rng(0xc0d9);
  for (let i = 0; i < 12000; i++) {
    const text = cdpPayload(r), label = `cdp#${i}`;
    checkText(text, label);
    checkObservation(cdpCarrier(r, text), label, i % 8 === 0);
    if (i % 3 === 0) checkObservation(mcp(text, "cdp"), `${label} plain`);
  }
  // Cell bound and compactness: compact rows reuse recorded spans; spaced rows go through range scans.
  for (const [columns, rows] of [[25, 1000], [23, 1087], [20, 1250], [20, 1251]] as const) for (const indent of [0, 1]) {
    const text = JSON.stringify({ nodes: Array.from({ length: rows }, (_, i) => ({ nodeId: String(i + 1), ignored: false, [`k${i % (columns - 2)}`]: i % 3 ? null : { v: [i, " "] } })) }, null, indent);
    checkText(text, `cells ${columns}x${rows}`); checkObservation(mcp(text, "cdp"), `cells ${columns}x${rows} ${indent}`, true);
  }
});

test("state: memo reuse, interleaved texts and failed scans leave no state behind", () => {
  const r = rng(0x57a7e);
  // A reused, mutated observation object never receives another text's verdict, records or tree.
  const observation = { ...mcp('{ "nodes": [ { "nodeId": "1", "ignored": false } ] }', "cdp") };
  const reference = { ...observation };
  for (let i = 0; i < 3000; i++) {
    const payload = r.chance(0.5) ? cdpPayload(r) : randomJson(r, 0, style(r));
    const wrapped = r.chance(0.3), tool = wrapped ? "browser_evaluate" : r.pick(["cdp", "unknown"]);
    observation.output = reference.output = wrapped ? `### Result\n${payload}\n### Ran Playwright code\n` : payload;
    (observation as { tool: string }).tool = (reference as { tool: string }).tool = tool;
    for (const [id, expected, current] of pairs) {
      const a = outcome(expected(reference), reference.output), b = outcome(current(observation), observation.output);
      if (a !== b) assert.fail(`memo ${id} #${i}: ${a.slice(0, 120)} != ${b.slice(0, 120)}`);
    }
    // Interleaving: a failing scan of another text, then range scans of this text, keep results exact.
    scanJson(payload.slice(0, payload.length >> 1), 0, 25000, [], []);
    const tree = ref.parseJson(payload);
    if (tree) for (const node of subnodes(tree, [], 12)) {
      const pieces: Piece[] = [], required: Span[] = [], expectedPieces: Piece[] = [], expectedRequired: Span[] = [];
      scanJsonValue(payload, node.span[0], 0, Infinity, pieces, required); ref.emitLexical(node, expectedPieces, expectedRequired);
      assert.equal(JSON.stringify(pieces) + JSON.stringify(required), JSON.stringify(expectedPieces) + JSON.stringify(expectedRequired), `interleaved #${i}`);
    }
  }
  // The live tree path stays available and identical (jsonSectionRoot still parses on demand).
  for (const text of ['{"a":[1, 2]}', "[1,", '### Result\n{ "z" : 1 }\n### Ran Playwright code\n']) {
    const o = Object.freeze(mcp(text, "browser_evaluate")), root = next.jsonSectionRoot(o)?.root;
    assert.equal(JSON.stringify(root), JSON.stringify(ref.parseJson(next.nativeJsonSection(o)?.output ?? "") ?? undefined), text);
    assert.equal(JSON.stringify(liveParseJson(text)), JSON.stringify(ref.parseJson(text)), text);
  }
});

test("totals: at least 200,000 differential cases with substantial admitted and positive shares", () => {
  const total = stats.texts + stats.observations + stats.errorTexts;
  console.log(`stream differential: ${JSON.stringify({ total, ...stats })}`);
  assert.ok(total >= 200000, `only ${total} cases`);
  assert.ok(stats.valid >= 20000 && stats.envelopes >= 2000 && stats.json >= 20000 && stats.cdp >= 2000 && stats.errorPositive >= 2000,
    `positive controls too small: ${JSON.stringify(stats)}`);
});
