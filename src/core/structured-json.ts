import type { Piece, Reduction, Span } from "./types.js";

export type JsonNode =
  | { readonly kind: "scalar"; readonly value: string | number | boolean | null; readonly span: Span }
  | { readonly kind: "array"; readonly items: readonly JsonNode[]; readonly span: Span }
  | { readonly kind: "object"; readonly entries: readonly { readonly name: string; readonly key: JsonNode; readonly value: JsonNode }[]; readonly span: Span };

/** Control characters other than tab, line feed and carriage return (those three are searched natively). */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
/** Single-character JSON escapes by the code unit after the backslash. */
const ESCAPES: Readonly<Record<number, string>> = Object.freeze(Object.assign(Object.create(null) as Record<number, string>,
  { 34: '"', 92: "\\", 47: "/", 98: "\b", 102: "\f", 110: "\n", 114: "\r", 116: "\t" }));
/** Bounded, duplicate-key-rejecting JSON parser. Keeps original lexemes and UTF-16 spans. */
export function parseJson(text: string): JsonNode | undefined {
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

export function fields(node: JsonNode, allowed: readonly string[], required: readonly string[] = []): ReadonlyMap<string, JsonNode> | undefined {
  if (node.kind !== "object" || node.entries.some(entry => !allowed.includes(entry.name))) return undefined;
  const result = new Map(node.entries.map(entry => [entry.name, entry.value]));
  return required.every(name => result.has(name)) ? result : undefined;
}
export function scalar(node: JsonNode | undefined): string | number | boolean | null | undefined { return node?.kind === "scalar" ? node.value : undefined; }
/** Exact decimal check, adapted from structured-files.ts@1d28291 (MIT). No rounded fractions. */
export function nonnegativeInteger(node: JsonNode | undefined, output: string): number | undefined {
  const numeric = node?.kind === "scalar" ? node.value : undefined;
  if (typeof numeric !== "number" || !Number.isSafeInteger(numeric) || numeric < 0 || !node) return undefined;
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(output.slice(...node.span));
  if (!match) return undefined;
  let digits = (match[2]! + (match[3] ?? "")).replace(/^0+/, "");
  if (!digits) return numeric;
  if (match[1]) return undefined;
  const shift = Number(match[4] ?? 0) - (match[3]?.length ?? 0);
  if (!Number.isSafeInteger(shift)) return undefined;
  if (shift < 0) {
    const cut = -shift;
    if (cut >= digits.length || !/^0+$/.test(digits.slice(-cut))) return undefined;
    digits = digits.slice(0, -cut);
  } else {
    if (digits.length + shift > 16) return undefined;
    digits += "0".repeat(shift);
  }
  return digits.length <= 16 && BigInt(digits) <= BigInt(Number.MAX_SAFE_INTEGER) ? numeric : undefined;
}
export function compactPieces(node: JsonNode): Piece[] {
  if (node.kind === "scalar") return [node.span];
  const pieces: Piece[] = [{ text: node.kind === "array" ? "[" : "{" }];
  const values = node.kind === "array" ? node.items : node.entries;
  values.forEach((entry, index) => {
    if (index) pieces.push({ text: "," });
    if ("key" in entry) pieces.push(entry.key.span, { text: ":" }, ...compactPieces(entry.value));
    else pieces.push(...compactPieces(entry));
  });
  pieces.push({ text: node.kind === "array" ? "]" : "}" });
  return pieces;
}
export function valueSpans(node: JsonNode): Span[] {
  if (node.kind === "scalar") return [node.span];
  return node.kind === "array" ? node.items.flatMap(valueSpans) : node.entries.flatMap(entry => valueSpans(entry.value));
}
export function jsonReduction(node: JsonNode): Reduction { return { pieces: compactPieces(node), required: valueSpans(node).length ? valueSpans(node) : [node.span] }; }

/*
 * Streaming lexical scanner: the same acceptance, limits and duplicate-key rule as parseJson, without a tree.
 * One iterative pass validates a value, counts syntax nodes (every key and value, as parseJson admits them),
 * optionally emits the exact pieces and required spans of the lexical tree emission (shared formatting pieces,
 * a whitespace-free container collapsed into one source span, meaningful empty-container delimiters), and
 * recognizes the top-level protocol error envelope from the few members it needs.
 */
const formatting = (value: string): Piece => Object.freeze({ text: value });
/** Shared immutable formatting pieces: one allocation per token kind, never per emitted token. */
export const LEXICAL_TEXT = Object.freeze({ openArray: formatting("["), closeArray: formatting("]"), openObject: formatting("{"),
  closeObject: formatting("}"), comma: formatting(","), colon: formatting(":"), newline: formatting("\n") });
const { openArray: OPEN_ARRAY, closeArray: CLOSE_ARRAY, openObject: OPEN_OBJECT, closeObject: CLOSE_OBJECT, comma: COMMA, colon: COLON } = LEXICAL_TEXT;
/** Outcome of the latest successful scan: syntax nodes counted and whether the value is a protocol error envelope. */
export const scanned = { nodes: 0, envelope: false };
// Frames of open containers (at most 65: a container at depth 64 may still open, empty). Keys of open objects
// are a contiguous stack of source spans; an object beyond 16 keys switches to a Set of decoded names.
const FRAMES = 66;
const frameObject = new Uint8Array(FRAMES), frameClean = new Uint8Array(FRAMES), frameRole = new Uint8Array(FRAMES);
const frameStart = new Int32Array(FRAMES), framePiece = new Int32Array(FRAMES), frameRequired = new Int32Array(FRAMES);
const frameKeys = new Int32Array(FRAMES), frameKeyCount = new Int32Array(FRAMES);
/**
 * Per object: a 32-bit signature mask of its plain keys (body length, first and last unit) and whether any key
 * is escaped. Equal plain keys have equal signatures, so a plain key whose bit is clear, in an object of plain
 * keys only, repeats none of them and skips the comparisons.
 */
const frameMask = new Int32Array(FRAMES), frameEscaped = new Uint8Array(FRAMES);
const frameNames: (Set<string> | undefined)[] = Array.from({ length: FRAMES }, () => undefined);
let keyStarts = new Int32Array(256), keyEnds = new Int32Array(256), keyEscaped = new Uint8Array(256);
/** Whether the latest stringEnd crossed a backslash. */
let escapedString = false;
const hexValue = (code: number): number => code >= 48 && code <= 57 ? code - 48 : code >= 97 && code <= 102 ? code - 87 : code >= 65 && code <= 70 ? code - 55 : -1;
/*
 * Next-occurrence caches for long strings, as in parseJson: each holds the first index at or after the query
 * that computed it (or the length), so it stays exact for every later, larger query on the same text. A scan
 * of another text, or one starting before the latest query, starts over.
 */
let cacheText = "", cacheQuery = 0, nextBackslash = -1, nextNewline = -1, nextTab = -1, nextCarriage = -1, nextControl = -1;
function cacheFor(text: string, from: number): void {
  if (text === cacheText && from >= cacheQuery) return;
  cacheText = text; cacheQuery = from; nextBackslash = nextNewline = nextTab = nextCarriage = nextControl = -1;
}
/** Drops the cached text reference (whole-text scans do so themselves; range scans leave it to their caller). */
export function releaseScanCache(): void { cacheText = ""; cacheQuery = 0; }
const nextIndex = (text: string, unit: string, from: number): number => { const index = text.indexOf(unit, from); return index < 0 ? text.length : index; };
/**
 * End (after the closing quote) of the string opening at `at`, or -1. Accepts exactly what JSON.parse accepts:
 * any code unit from U+0020 except quote and backslash (lone surrogates included), and the escapes
 * \" \\ \/ \b \f \n \r \t and \u with exactly four hex digits. Native searches find the closing quote; the
 * cached next positions of each backslash and control character prove the body without visiting its units.
 */
function stringEnd(text: string, at: number): number {
  const index = at + 1;
  cacheQuery = index;
  if (nextBackslash < index) nextBackslash = nextIndex(text, "\\", index);
  const first = nextBackslash;
  let quote = text.indexOf('"', index);
  if (quote < 0) return -1;
  // Each backslash consumes the unit after it, so the closing quote is the first one not so consumed.
  for (let cursor = first + 2; quote > first; ) {
    if (nextBackslash < cursor) nextBackslash = nextIndex(text, "\\", cursor);
    quote = text.indexOf('"', cursor);
    if (quote < 0) return -1;
    if (quote < nextBackslash) break;
    cursor = nextBackslash + 2;
  }
  // No control character anywhere in the body [index, quote).
  if (nextNewline < index) nextNewline = nextIndex(text, "\n", index);
  if (nextTab < index) nextTab = nextIndex(text, "\t", index);
  if (nextCarriage < index) nextCarriage = nextIndex(text, "\r", index);
  if (nextControl < index) { CONTROL.lastIndex = index; nextControl = CONTROL.test(text) ? CONTROL.lastIndex - 1 : text.length; }
  if (nextNewline < quote || nextTab < quote || nextCarriage < quote || nextControl < quote) return -1;
  escapedString = first < quote;
  // Every escape before the closing quote: one of the simple escapes, or \u with four hex digits.
  for (let escape = first; escape < quote; ) {
    const code = text.charCodeAt(escape + 1);
    if (code === 117) {
      if ((hexValue(text.charCodeAt(escape + 2)) | hexValue(text.charCodeAt(escape + 3)) | hexValue(text.charCodeAt(escape + 4))
        | hexValue(text.charCodeAt(escape + 5))) < 0) return -1;
      escape = text.indexOf("\\", escape + 6);
    } else {
      if (ESCAPES[code] === undefined) return -1;
      escape = text.indexOf("\\", escape + 2);
    }
    if (escape < 0) break;
  }
  return quote + 1;
}
/** Decoded value of the valid string lexeme [start, end) (quotes included). */
export function decodeString(text: string, start: number, end: number): string {
  // Searches stay inside the body: a plain body is returned as is, never searched past its closing quote.
  const body = text.slice(start + 1, end - 1);
  let escape = body.indexOf("\\");
  if (escape < 0) return body;
  let decoded = "", from = 0;
  for (; escape >= 0; escape = body.indexOf("\\", from)) {
    decoded += body.slice(from, escape);
    const code = body.charCodeAt(escape + 1);
    if (code === 117) {
      decoded += String.fromCharCode(hexValue(body.charCodeAt(escape + 2)) * 4096 + hexValue(body.charCodeAt(escape + 3)) * 256
        + hexValue(body.charCodeAt(escape + 4)) * 16 + hexValue(body.charCodeAt(escape + 5)));
      from = escape + 6;
    } else { decoded += ESCAPES[code]!; from = escape + 2; }
  }
  return decoded + body.slice(from);
}
/** Whether the valid string lexeme [start, end) decodes to `name`; a plain lexeme is compared in place. */
export function stringIs(text: string, start: number, end: number, escaped: boolean, name: string): boolean {
  return escaped ? decodeString(text, start, end) === name : end - start - 2 === name.length && text.startsWith(name, start + 1);
}
function sameKey(text: string, slot: number, start: number, end: number, escaped: boolean): boolean {
  const otherStart = keyStarts[slot]!, otherEnd = keyEnds[slot]!;
  if (escaped || keyEscaped[slot]) return decodeString(text, otherStart, otherEnd) === decodeString(text, start, end);
  if (otherEnd - otherStart !== end - start) return false;
  for (let a = otherStart + 1, b = start + 1; b < end; a++, b++) if (text.charCodeAt(a) !== text.charCodeAt(b)) return false;
  return true;
}
function growKeys(): void {
  const starts = new Int32Array(keyStarts.length * 2), ends = new Int32Array(keyStarts.length * 2), escaped = new Uint8Array(keyStarts.length * 2);
  starts.set(keyStarts); ends.set(keyEnds); escaped.set(keyEscaped);
  keyStarts = starts; keyEnds = ends; keyEscaped = escaped;
}
/**
 * Values of a recording scan at depth <= 4, in document order: depth, start of the enclosing container (-1 at
 * the top level), key span (-1 for array items and the top-level value), value span and flags (KEY_ESCAPED,
 * VALUE_COMPACT: its lexical emission is the single span of its source).
 */
export interface JsonRecords {
  readonly count: number; readonly depth: Uint8Array; readonly parent: Int32Array; readonly keyStart: Int32Array; readonly keyEnd: Int32Array;
  readonly valueStart: Int32Array; readonly valueEnd: Int32Array; readonly flags: Uint8Array;
}
export const KEY_ESCAPED = 1, VALUE_COMPACT = 2;
const RECORD_DEPTH = 4;
const frameSlot = new Int32Array(FRAMES);
let recordCount = 0, recordDepth = new Uint8Array(256), recordParent = new Int32Array(256), recordKeyStart = new Int32Array(256),
  recordKeyEnd = new Int32Array(256), recordValueStart = new Int32Array(256), recordValueEnd = new Int32Array(256), recordFlags = new Uint8Array(256);
function growRecords(): void {
  const size = recordDepth.length * 2;
  const grow = <T extends Uint8Array | Int32Array>(values: T, next: T): T => { next.set(values); return next; };
  recordDepth = grow(recordDepth, new Uint8Array(size)); recordParent = grow(recordParent, new Int32Array(size));
  recordKeyStart = grow(recordKeyStart, new Int32Array(size)); recordKeyEnd = grow(recordKeyEnd, new Int32Array(size));
  recordValueStart = grow(recordValueStart, new Int32Array(size)); recordValueEnd = grow(recordValueEnd, new Int32Array(size));
  recordFlags = grow(recordFlags, new Uint8Array(size));
}
// Envelope members: of the top-level object, and of its "error" object.
const ERROR = 1, JSONRPC = 2, ID = 3, RESULT = 4, CODE = 5, MESSAGE = 6;

/**
 * Scans the JSON value starting exactly at `from` (whitespace before it is skipped) and returns the index after
 * it, or -1 when it is invalid, nests beyond depth 64 or counts more than `limit` syntax nodes. With `pieces`
 * and `required`, appends the lexical emission (spans shifted by `offset`); a failed scan appends nothing.
 * On success `scanned` holds the node count and the envelope verdict.
 */
export function scanJsonValue(text: string, from: number, offset: number, limit: number, pieces?: Piece[], required?: Span[]): number {
  return scanValue(text, from, offset, limit, pieces, required, false);
}
function scanValue(text: string, from: number, offset: number, limit: number, pieces: Piece[] | undefined, required: Span[] | undefined, record: boolean): number {
  const emit = pieces !== undefined && required !== undefined;
  const pieceBase = emit ? pieces.length : 0, requiredBase = emit ? required.length : 0;
  cacheFor(text, from);
  let pieceTop = pieceBase, requiredTop = requiredBase, pos = from, depth = 0, count = 0, keyTop = 0, state = 0;
  let keyStart = -1, keyEnd = -1, keyFlags = 0, slot = -1;
  if (record) recordCount = 0;
  let pending = 0, rootObject = false, errorObject = false, code = false, message = false, rpc = false, id = false, result = false;
  scan: for (;;) {
    if (state === 1 && depth === 0) {
      if (emit) { if (pieces.length !== pieceTop) pieces.length = pieceTop; if (required.length !== requiredTop) required.length = requiredTop; }
      scanned.nodes = count;
      scanned.envelope = rootObject && errorObject && code && message && (rpc || (id && !result));
      return pos;
    }
    let next = text.charCodeAt(pos);
    if (next === 32 || next === 10 || next === 13 || next === 9) {
      do next = text.charCodeAt(++pos); while (next === 32 || next === 10 || next === 13 || next === 9);
      if (depth) frameClean[depth - 1] = 0;
    }
    if (state === 0) {
      // A value at `depth` (one more than its enclosing container).
      if (depth > 64 || ++count > limit) break;
      const member = pending, start = pos;
      pending = 0;
      if (record) {
        if (depth <= RECORD_DEPTH) {
          if (recordCount === recordDepth.length) growRecords();
          slot = recordCount++;
          const keyed = depth > 0 && frameObject[depth - 1] === 1;
          recordDepth[slot] = depth; recordParent[slot] = depth ? frameStart[depth - 1]! : -1;
          recordKeyStart[slot] = keyed ? keyStart : -1; recordKeyEnd[slot] = keyed ? keyEnd : -1; recordFlags[slot] = keyed ? keyFlags : 0;
          recordValueStart[slot] = start;
        } else slot = -1;
      }
      if (next === 123 || next === 91) {
        let inner = text.charCodeAt(++pos), spaced = false;
        if (inner === 32 || inner === 10 || inner === 13 || inner === 9) {
          do inner = text.charCodeAt(++pos); while (inner === 32 || inner === 10 || inner === 13 || inner === 9);
          spaced = true;
        }
        if (member === ERROR && next === 123) errorObject = true;
        else if (member === RESULT) result = true;
        if (inner === next + 2) {
          // Empty: one span when it is exactly two units, else both delimiters (the parent is then not compact).
          pos++;
          if (emit) {
            if (spaced) {
              const open: Span = [start + offset, start + offset + 1], close: Span = [pos + offset - 1, pos + offset];
              pieces[pieceTop++] = open; required[requiredTop++] = open; pieces[pieceTop++] = close; required[requiredTop++] = close;
            } else { const span: Span = [start + offset, pos + offset]; pieces[pieceTop++] = span; required[requiredTop++] = span; }
          }
          if (spaced && depth) frameClean[depth - 1] = 0;
          if (slot >= 0) { recordValueEnd[slot] = pos; if (!spaced) recordFlags[slot] = recordFlags[slot]! | VALUE_COMPACT; }
          state = 1; continue;
        }
        const object = next === 123;
        if (object && depth === 0) rootObject = true;
        frameObject[depth] = object ? 1 : 0; frameClean[depth] = spaced ? 0 : 1;
        frameRole[depth] = object ? (depth === 0 ? 1 : member === ERROR ? 2 : 0) : 0;
        frameStart[depth] = start; framePiece[depth] = pieceTop; frameRequired[depth] = requiredTop;
        frameKeys[depth] = keyTop; frameKeyCount[depth] = 0; frameNames[depth] = undefined; frameMask[depth] = 0; frameEscaped[depth] = 0; frameSlot[depth] = record ? slot : -1;
        if (emit) pieces[pieceTop++] = object ? OPEN_OBJECT : OPEN_ARRAY;
        depth++;
        state = object ? 2 : 0; continue;
      }
      if (next === 34) {
        pos = stringEnd(text, pos);
        if (pos < 0) break;
        if (member === JSONRPC) rpc = stringIs(text, start, pos, escapedString, "2.0");
        else if (member === MESSAGE) message = true;
      } else if (next === 116) { if (!text.startsWith("true", pos)) break; pos += 4; }
      else if (next === 102) { if (!text.startsWith("false", pos)) break; pos += 5; }
      else if (next === 110) { if (!text.startsWith("null", pos)) break; pos += 4; }
      else {
        // -?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?; whatever follows must be a delimiter (checked next).
        if (next === 45) next = text.charCodeAt(++pos);
        if (next === 48) next = text.charCodeAt(++pos);
        else if (next >= 49 && next <= 57) do next = text.charCodeAt(++pos); while (next >= 48 && next <= 57);
        else break;
        if (next === 46) {
          next = text.charCodeAt(++pos);
          if (!(next >= 48 && next <= 57)) break;
          do next = text.charCodeAt(++pos); while (next >= 48 && next <= 57);
        }
        if (next === 101 || next === 69) {
          next = text.charCodeAt(++pos);
          if (next === 43 || next === 45) next = text.charCodeAt(++pos);
          if (!(next >= 48 && next <= 57)) break;
          do next = text.charCodeAt(++pos); while (next >= 48 && next <= 57);
        }
        if (member === ID) id = true;
        else if (member === CODE) code = true;
      }
      if (member === RESULT) result = true;
      if (emit) { const span: Span = [start + offset, pos + offset]; pieces[pieceTop++] = span; required[requiredTop++] = span; }
      if (slot >= 0) { recordValueEnd[slot] = pos; recordFlags[slot] = recordFlags[slot]! | VALUE_COMPACT; }
      state = 1; continue;
    }
    if (state === 1) {
      // After a value inside a container: a comma or the container's close.
      const top = depth - 1, object = frameObject[top] === 1;
      if (next === 44) { pos++; if (emit) pieces[pieceTop++] = COMMA; state = object ? 2 : 0; continue; }
      if (next !== (object ? 125 : 93)) break;
      pos++;
      if (frameClean[top]) {
        // Compact container: its whole source is one span, replacing the children's emission.
        if (emit) {
          pieceTop = framePiece[top]!; requiredTop = frameRequired[top]!;
          const span: Span = [frameStart[top]! + offset, pos + offset]; pieces[pieceTop++] = span; required[requiredTop++] = span;
        }
      }
      else { if (emit) pieces[pieceTop++] = object ? CLOSE_OBJECT : CLOSE_ARRAY; if (top) frameClean[top - 1] = 0; }
      if (record) { const owner = frameSlot[top]!; if (owner >= 0) { recordValueEnd[owner] = pos; if (frameClean[top]) recordFlags[owner] = recordFlags[owner]! | VALUE_COMPACT; } }
      keyTop = frameKeys[top]!; frameNames[top] = undefined; depth = top;
      continue;
    }
    // A key of the object at depth - 1, admitted at `depth` like parseJson; rejected by decoded name if repeated.
    if (depth > 64 || ++count > limit || next !== 34) break;
    keyStart = pos;
    pos = stringEnd(text, pos);
    if (pos < 0) break;
    keyEnd = pos;
    const escaped = escapedString, top = depth - 1, keys = frameKeyCount[top]!;
    keyFlags = escaped ? KEY_ESCAPED : 0;
    let names = frameNames[top];
    if (names) {
      const name = decodeString(text, keyStart, pos);
      if (names.has(name)) break;
      names.add(name);
    } else {
      const bit = escaped ? 0 : 1 << ((pos - keyStart + text.charCodeAt(keyStart + 1) * 7 + text.charCodeAt(pos - 2) * 13) & 31);
      if (escaped || frameEscaped[top] || (frameMask[top]! & bit) !== 0) {
        for (let slot = frameKeys[top]!, last = slot + keys; slot < last; slot++) if (sameKey(text, slot, keyStart, pos, escaped)) break scan;
      }
      if (escaped) frameEscaped[top] = 1; else frameMask[top] = frameMask[top]! | bit;
      if (keys >= 16) {
        names = frameNames[top] = new Set();
        for (let slot = frameKeys[top]!, last = slot + keys; slot < last; slot++) names.add(decodeString(text, keyStarts[slot]!, keyEnds[slot]!));
        names.add(decodeString(text, keyStart, pos));
      } else {
        if (keyTop === keyStarts.length) growKeys();
        keyStarts[keyTop] = keyStart; keyEnds[keyTop] = pos; keyEscaped[keyTop++] = escaped ? 1 : 0;
      }
    }
    frameKeyCount[top] = keys + 1;
    const role = frameRole[top];
    if (role === 1) {
      pending = stringIs(text, keyStart, pos, escaped, "error") ? ERROR : stringIs(text, keyStart, pos, escaped, "jsonrpc") ? JSONRPC
        : stringIs(text, keyStart, pos, escaped, "id") ? ID : stringIs(text, keyStart, pos, escaped, "result") ? RESULT : 0;
    } else if (role === 2) pending = stringIs(text, keyStart, pos, escaped, "code") ? CODE : stringIs(text, keyStart, pos, escaped, "message") ? MESSAGE : 0;
    if (emit) { const span: Span = [keyStart + offset, pos + offset]; pieces[pieceTop++] = span; required[requiredTop++] = span; }
    next = text.charCodeAt(pos);
    if (next === 32 || next === 10 || next === 13 || next === 9) {
      do next = text.charCodeAt(++pos); while (next === 32 || next === 10 || next === 13 || next === 9);
      frameClean[top] = 0;
    }
    if (next !== 58) break;
    pos++;
    if (emit) pieces[pieceTop++] = COLON;
    state = 0;
  }
  if (emit) { pieces.length = pieceBase; required.length = requiredBase; }
  return -1;
}
/** A whole JSON text (whitespace around one value): the scan of parseJson acceptance, or -1. */
export function scanJson(text: string, offset: number, limit: number, pieces?: Piece[], required?: Span[]): number {
  const pieceBase = pieces?.length ?? 0, requiredBase = required?.length ?? 0;
  const end = scanValue(text, 0, offset, limit, pieces, required, false);
  releaseScanCache();
  if (end < 0) return -1;
  let pos = end, next = text.charCodeAt(pos);
  while (next === 32 || next === 10 || next === 13 || next === 9) next = text.charCodeAt(++pos);
  if (pos === text.length) return end;
  if (pieces !== undefined && required !== undefined) { pieces.length = pieceBase; required.length = requiredBase; }
  return -1;
}
/** scanJson without emission that also returns the records of every value at depth <= 4, or undefined. */
export function recordJson(text: string, limit: number): JsonRecords | undefined {
  const end = scanValue(text, 0, 0, limit, undefined, undefined, true);
  releaseScanCache();
  if (end < 0) return undefined;
  let pos = end, next = text.charCodeAt(pos);
  while (next === 32 || next === 10 || next === 13 || next === 9) next = text.charCodeAt(++pos);
  if (pos !== text.length) return undefined;
  const count = recordCount;
  return { count, depth: recordDepth.slice(0, count), parent: recordParent.slice(0, count), keyStart: recordKeyStart.slice(0, count),
    keyEnd: recordKeyEnd.slice(0, count), valueStart: recordValueStart.slice(0, count), valueEnd: recordValueEnd.slice(0, count), flags: recordFlags.slice(0, count) };
}
