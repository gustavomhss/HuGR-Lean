import { fields, parseJson, scalar } from "../core/structured-json.js";
import type { StructuredReducer } from "../core/structured-types.js";
import type { Piece, Span } from "../core/types.js";

/** HuGR-Lean progress-v1 only; retained events and envelope stay verbatim. */
export const reduceProgress: StructuredReducer = output => {
  const root = parseJson(output);
  if (!root) return undefined;
  const envelope = fields(root, ["schema", "events"], ["schema", "events"]);
  if (scalar(envelope?.get("schema")) !== "hugr-lean/progress-v1") return undefined;
  const events = envelope?.get("events");
  if (events?.kind !== "array") return undefined;

  let unit: string | undefined, total: number | undefined, current = -1;
  let lastProgress = -1, hasResult = false;
  const progress = new Set<number>();
  for (const [index, event] of events.items.entries()) {
    const common = fields(event, ["kind", "current", "total", "unit", "message"], ["kind"]);
    const kind = scalar(common?.get("kind"));
    if (kind === "progress") {
      const values = fields(event, ["kind", "current", "total", "unit"], ["kind", "current", "total", "unit"]);
      const next = scalar(values?.get("current")), limit = scalar(values?.get("total"));
      const label = scalar(values?.get("unit"));
      if (typeof next !== "number" || !Number.isSafeInteger(next) || next < 0 ||
          typeof limit !== "number" || !Number.isSafeInteger(limit) || limit <= 0 || next > limit ||
          typeof label !== "string" || next < current ||
          (total !== undefined && total !== limit) || (unit !== undefined && unit !== label)) return undefined;
      current = next; total = limit; unit = label;
      lastProgress = index; progress.add(index);
    } else if (kind === "result" || kind === "warning" || kind === "diagnostic") {
      const values = fields(event, ["kind", "message"], ["kind", "message"]);
      if (typeof scalar(values?.get("message")) !== "string") return undefined;
      if (kind === "result") hasResult = true;
    } else return undefined;
  }
  if (lastProgress < 0 || current !== total || !hasResult) return undefined;

  const prefix: Span = [0, events.span[0] + 1];
  const suffix: Span = [events.span[1] - 1, output.length];
  const pieces: Piece[] = [prefix], required: Span[] = [prefix, suffix];
  for (const [index, event] of events.items.entries()) {
    if (progress.has(index) && index !== lastProgress) continue;
    if (required.length > 2) pieces.push({ text: "," });
    pieces.push(event.span); required.push(event.span);
  }
  pieces.push(suffix);
  return { pieces, required };
};
