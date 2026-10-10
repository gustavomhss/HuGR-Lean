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
