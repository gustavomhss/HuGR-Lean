import { fields, parseJson, scalar, valueSpans } from "../core/structured-json.js";
import type { JsonNode } from "../core/structured-json.js";
import type { StructuredReducer } from "../core/structured-types.js";
import type { Piece, Span } from "../core/types.js";

const order = ["path", "type", "size", "modified", "target"] as const;

// Check the exact decimal lexeme too: Number can round a fraction to a safe integer.
function safeSize(node: JsonNode, output: string): boolean {
  const value = scalar(node);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return false;
  const token = output.slice(...node.span);
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  if (!match) return false;
  let digits = (match[2]! + (match[3] ?? "")).replace(/^0+/, "");
  if (!digits) return true;
  if (match[1]) return false;
  const shift = Number(match[4] ?? 0) - (match[3]?.length ?? 0);
  if (!Number.isSafeInteger(shift)) return false;
  if (shift < 0) {
    const cut = -shift;
    if (cut >= digits.length || !/^0+$/.test(digits.slice(-cut))) return false;
    digits = digits.slice(0, -cut);
  } else {
    if (digits.length + shift > 16) return false;
    digits += "0".repeat(shift);
  }
  return digits.length <= 16 && BigInt(digits) <= BigInt(Number.MAX_SAFE_INTEGER);
}

/** Complete file-record view; dynamic content is always an original JSON token. */
export const reduceFiles: StructuredReducer = output => {
  const root = parseJson(output);
  if (root?.kind !== "array" || root.items.length === 0) return undefined;
  const pieces: Piece[] = [], required: Span[] = [];
  let columns: readonly string[] | undefined;
  for (const row of root.items) {
    const values = fields(row, order, ["path", "type"]);
    if (!values || row.kind !== "object") return undefined;
    const names = row.entries.map(entry => entry.name);
    if (names.some((name, index) => index > 0 && order.indexOf(name as typeof order[number]) <= order.indexOf(names[index - 1] as typeof order[number]))) return undefined;
    if (columns && (names.length !== columns.length || names.some((name, index) => name !== columns![index]))) return undefined;
    const type = scalar(values.get("type"));
    if (typeof scalar(values.get("path")) !== "string" || !["file", "directory", "symlink"].includes(type as string)) return undefined;
    if (values.has("size") && !safeSize(values.get("size")!, output)) return undefined;
    for (const name of ["modified", "target"]) {
      if (values.has(name) && typeof scalar(values.get(name)) !== "string") return undefined;
    }
    if (type === "symlink" && !values.has("target")) return undefined;
    if (!columns) {
      columns = names;
      row.entries.forEach((entry, index) => {
        if (index) pieces.push({ text: "\t" });
        pieces.push(entry.key.span);
        required.push(entry.key.span);
      });
    }
    pieces.push({ text: "\n" });
    row.entries.forEach((entry, index) => {
      if (index) pieces.push({ text: "\t" });
      pieces.push(entry.value.span);
      required.push(...valueSpans(entry.value));
    });
  }
  return { pieces, required };
};
