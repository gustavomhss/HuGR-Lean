import type { Piece, Reduction, Span } from "./types.js";

export type JsonNode =
  | { readonly kind: "scalar"; readonly value: string | number | boolean | null; readonly span: Span }
  | { readonly kind: "array"; readonly items: readonly JsonNode[]; readonly span: Span }
  | { readonly kind: "object"; readonly entries: readonly { readonly name: string; readonly key: JsonNode; readonly value: JsonNode }[]; readonly span: Span };

/** Bounded, duplicate-key-rejecting JSON parser. Keeps original lexemes and UTF-16 spans. */
export function parseJson(text: string): JsonNode | undefined {
  try {
    // Pre-validation makes every lexeme below well-formed; the scanner only recovers spans, limits and duplicates.
    JSON.parse(text);
    const length = text.length;
    let pos = 0, count = 0, backslash = -1;
    const whitespace = (): void => {
      let code = text.charCodeAt(pos);
      while (code === 32 || code === 10 || code === 13 || code === 9) code = text.charCodeAt(++pos);
    };
    /** Advances past the string opening at pos; slice-decodes unless a backslash occurs before its closing quote. */
    const string = (): string => {
      const start = pos;
      let cursor = pos + 1, escaped = false;
      for (;;) {
        if (backslash < cursor) { backslash = text.indexOf("\\", cursor); if (backslash < 0) backslash = length; }
        const quote = text.indexOf('"', cursor);
        if (quote < 0) throw new Error("Invalid JSON string");
        if (quote < backslash) { pos = quote + 1; break; }
        escaped = true; cursor = backslash + 2;
      }
      return escaped ? JSON.parse(text.slice(start, pos)) as string : text.slice(start + 1, pos - 1);
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
            if (entries.length >= 8) { names = new Set(); for (const entry of entries) names.add(entry.name); names.add(name); }
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
        // Number() equals JSON.parse() on a validated JSON number lexeme (incl. -0, overflow to Infinity, huge integers).
        let next = text.charCodeAt(++pos);
        while ((next >= 48 && next <= 57) || next === 46 || next === 101 || next === 69 || next === 43 || next === 45) next = text.charCodeAt(++pos);
        scalar = Number(text.slice(start, pos));
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
