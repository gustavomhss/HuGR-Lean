import type { Piece, Reduction, Span } from "./types.js";

export type JsonNode =
  | { readonly kind: "scalar"; readonly value: string | number | boolean | null; readonly span: Span }
  | { readonly kind: "array"; readonly items: readonly JsonNode[]; readonly span: Span }
  | { readonly kind: "object"; readonly entries: readonly { readonly name: string; readonly key: JsonNode; readonly value: JsonNode }[]; readonly span: Span };

/** Bounded, duplicate-key-rejecting JSON parser. Keeps original lexemes and UTF-16 spans. */
export function parseJson(text: string): JsonNode | undefined {
  try {
    JSON.parse(text);
    let pos = 0, count = 0;
    const whitespace = () => { while (/[\t\n\r ]/.test(text[pos] ?? "x")) pos++; };
    function value(depth: number): JsonNode {
      if (depth > 64 || ++count > 25000) throw new Error("JSON admission limit");
      whitespace();
      const start = pos, token = text[pos++];
      if (token === "{" || token === "[") {
        const entries: { name: string; key: JsonNode; value: JsonNode }[] = [], items: JsonNode[] = [], names = new Set<string>();
        const close = token === "{" ? "}" : "]";
        whitespace();
        while (text[pos] !== close) {
          if (token === "{") {
            const key = value(depth + 1);
            if (key.kind !== "scalar" || typeof key.value !== "string" || names.has(key.value)) throw new Error("Invalid JSON key");
            names.add(key.value); whitespace();
            if (text[pos++] !== ":") throw new Error("Invalid JSON colon");
            entries.push({ name: key.value, key, value: value(depth + 1) });
          } else items.push(value(depth + 1));
          whitespace();
          if (text[pos] === close) break;
          if (text[pos++] !== ",") throw new Error("Invalid JSON comma");
          whitespace();
        }
        pos++;
        return token === "{" ? { kind: "object", entries, span: [start, pos] } : { kind: "array", items, span: [start, pos] };
      }
      if (token === '"') {
        while (pos < text.length) {
          const char = text[pos++];
          if (char === "\\") pos++;
          else if (char === '"') break;
        }
      } else while (pos < text.length && !/[\t\n\r ,\]}]/.test(text[pos]!)) pos++;
      return { kind: "scalar", value: JSON.parse(text.slice(start, pos)) as string | number | boolean | null, span: [start, pos] };
    }
    const result = value(0); whitespace();
    return pos === text.length ? result : undefined;
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
