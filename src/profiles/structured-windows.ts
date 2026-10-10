import { compactPieces, fields, parseJson, scalar, valueSpans } from "../core/structured-json.js";
import type { StructuredReducer } from "../core/structured-types.js";
import type { Piece, Span } from "../core/types.js";

const requiredFields = ["id", "app", "title", "focused", "bounds"] as const;
const allowedFields = [...requiredFields, "state"];

/** HuGR-Lean window interchange records, not a native GUI integration. */
export const reduceWindows: StructuredReducer = output => {
  const root = parseJson(output);
  if (root?.kind !== "array" || root.items.length === 0) return undefined;
  const pieces: Piece[] = [];
  const required: Span[] = [];
  let width = 0;
  for (const [index, row] of root.items.entries()) {
    const values = fields(row, allowedFields, requiredFields);
    if (!values || row.kind !== "object") return undefined;
    const names = row.entries.map(entry => entry.name);
    if (names.some((name, column) => name !== allowedFields[column])) return undefined;
    if (index === 0) width = names.length;
    else if (names.length !== width) return undefined;
    if (typeof scalar(values.get("id")) !== "string"
      || typeof scalar(values.get("app")) !== "string"
      || typeof scalar(values.get("title")) !== "string"
      || typeof scalar(values.get("focused")) !== "boolean") return undefined;
    const bounds = values.get("bounds");
    if (bounds?.kind !== "array" || bounds.items.length !== 4
      || bounds.items.some(item => typeof scalar(item) !== "number" || !Number.isFinite(scalar(item)))) return undefined;
    const state = values.get("state");
    if (state && (state.kind !== "array" || state.items.some(item => typeof scalar(item) !== "string"))) return undefined;
    if (index === 0) {
      row.entries.forEach((entry, column) => {
        if (column) pieces.push({ text: "\t" });
        pieces.push(entry.key.span);
        required.push(entry.key.span);
      });
    }
    pieces.push({ text: "\n" });
    row.entries.forEach((entry, column) => {
      if (column) pieces.push({ text: "\t" });
      pieces.push(...compactPieces(entry.value));
      required.push(...valueSpans(entry.value));
    });
  }
  return { pieces, required };
};
