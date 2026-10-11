import { tokenizeAutomaticCommand } from "../src/core/automatic-command.js";
import type { JsonNode } from "../src/core/structured-json.js";
import type { AutomaticObservation, AutomaticReducer } from "../src/core/automatic-types.js";
import type { Piece, Reduction, Span } from "../src/core/types.js";

/*
 * Reference tree path for tests/perf-stream-equivalence.test.ts (kept apart for the 750-line structure limit).
 * The implementations below are copied verbatim from git f729c4b (perf/round3):
 *   src/core/structured-json.ts   blob 7e29c7ab4e6095d67e8e56a8bde658a71f94c6ab (CONTROL, ESCAPES, parseJson, scalar)
 *   src/profiles/auto-json.ts     blob 1f9012185776c8fcc59082f328f230e370500675 (whole module)
 *   src/profiles/auto-cdp.ts      blob 370f499414eba2b536894cf0a3e8b9936ac7b97e (whole module)
 *   src/opencode/automatic-mcp.ts blob f8800a056cc0dbf2933a50237018c5e25b67f711 (record, mayBeEnvelope, errorText)
 * Modification record: import lines removed (each module body is wrapped in a closure that receives the
 * reference bindings it imported), `export` keywords dropped, bodies re-indented. Same license (MIT, this repo).
 */
export const ref = (() => {
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
