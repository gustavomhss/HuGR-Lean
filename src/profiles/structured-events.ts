import { compactPieces, fields, parseJson, scalar, valueSpans } from "../core/structured-json.js";
import type { StructuredReducer } from "../core/structured-types.js";
import type { Piece, Span } from "../core/types.js";

const KEYS = ["time", "level", "source", "message", "details"] as const;

/** Ordered event view. Each '=' represents exactly one lexical repetition. */
export const reduceEvents: StructuredReducer = (output) => {
  const root = parseJson(output);
  if (root?.kind !== "array" || root.items.length === 0) return undefined;
  const pieces: Piece[] = [], required: Span[] = [];
  let width: number | undefined, previous: string | undefined;
  for (const row of root.items) {
    const values = fields(row, KEYS, KEYS.slice(0, 4));
    if (!values || row.kind !== "object") return undefined;
    const names = row.entries.map(entry => entry.name);
    if (names.some((name, index) => name !== KEYS[index])) return undefined;
    if (width !== undefined && names.length !== width) return undefined;
    const time = scalar(values.get("time"));
    if (typeof time !== "string" && !(typeof time === "number" && Number.isFinite(time))) return undefined;
    if (["level", "source", "message"].some(name => typeof scalar(values.get(name)) !== "string")) return undefined;
    if (width === undefined) {
      width = names.length;
      row.entries.forEach((entry, index) => {
        if (index) pieces.push({ text: "\t" });
        pieces.push(entry.key.span);
        required.push(entry.key.span);
      });
      pieces.push({ text: "\n" });
    }
    const cells = row.entries.map(entry => compactPieces(entry.value));
    const lexical = cells.map(cell => cell.map(piece => Array.isArray(piece)
      ? output.slice(piece[0], piece[1]) : (piece as { readonly text: string }).text).join("")).join("\t");
    if (lexical === previous) pieces.push({ text: "=" }, { text: "\n" });
    else {
      cells.forEach((cell, index) => {
        if (index) pieces.push({ text: "\t" });
        pieces.push(...cell);
        required.push(...valueSpans(row.entries[index]!.value));
      });
      pieces.push({ text: "\n" });
    }
    previous = lexical;
  }
  return { pieces, required };
};
