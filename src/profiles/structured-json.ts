import { compactPieces, parseJson, type JsonNode } from "../core/structured-json.js";
import type { StructuredReducer } from "../core/structured-types.js";
import type { Piece, Span } from "../core/types.js";

/** Lossless lexical compaction: admission and limits belong to the shared parser. */
export const reduceJson: StructuredReducer = output => {
  const root = parseJson(output);
  if (!root) return undefined;
  const pieces: Piece[] = [], required: Span[] = [];
  function emit(node: JsonNode): void {
    if (node.kind === "scalar") {
      pieces.push(...compactPieces(node));
      required.push(node.span);
      return;
    }
    const values = node.kind === "array" ? node.items : node.entries;
    // Empty containers still carry meaning. Keep their source punctuation as evidence,
    // rather than requiring the whitespace-bearing span that compaction removes.
    const opening: Span = [node.span[0], node.span[0] + 1];
    const closing: Span = [node.span[1] - 1, node.span[1]];
    pieces.push(opening);
    if (!values.length) required.push(opening, closing);
    values.forEach((entry, index) => {
      if (index) pieces.push({ text: "," });
      if ("key" in entry) {
        emit(entry.key);
        pieces.push({ text: ":" });
        emit(entry.value);
      } else emit(entry);
    });
    pieces.push(closing);
  }
  emit(root);
  return { pieces, required };
};
