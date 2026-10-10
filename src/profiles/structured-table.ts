import { fields, parseJson, scalar, valueSpans } from "../core/structured-json.js";
import type { StructuredReducer } from "../core/structured-types.js";
import type { Piece } from "../core/types.js";

/** Exact interchange table only; every header and cell keeps its source lexeme. */
export const reduceTable: StructuredReducer = output => {
  const node = parseJson(output);
  if (!node) return undefined;
  const table = fields(node, ["columns", "rows"], ["columns", "rows"]);
  const columns = table?.get("columns"), rows = table?.get("rows");
  if (columns?.kind !== "array" || rows?.kind !== "array" || !columns.items.length) return undefined;
  const names = new Set<string>();
  for (const column of columns.items) {
    const name = scalar(column);
    if (typeof name !== "string" || !name.length || names.has(name)) return undefined;
    names.add(name);
  }
  for (const row of rows.items) {
    if (row.kind !== "array" || row.items.length !== columns.items.length || row.items.some(cell => cell.kind !== "scalar")) return undefined;
  }
  const pieces: Piece[] = [];
  const append = (spans: ReturnType<typeof valueSpans>) => {
    spans.forEach((span, index) => {
      if (index) pieces.push({ text: "\t" });
      pieces.push(span);
    });
    pieces.push({ text: "\n" });
  };
  append(valueSpans(columns));
  for (const row of rows.items) append(valueSpans(row));
  return { pieces, required: [...valueSpans(columns), ...valueSpans(rows)] };
};
