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
