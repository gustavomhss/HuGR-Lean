import type { Reduction, Span } from "../core/types.js";

/** Remove only JSON layout after a profile validates its complete native schema. */
export function jsonLayout(output: string, admit: (value: unknown) => boolean): Reduction | undefined {
  let value: unknown;
  try { value = JSON.parse(output); } catch { return undefined; }
  if (!admit(value)) return undefined;
  const pieces: Span[] = [];
  let quoted = false, escaped = false, start = 0;
  for (let i = 0; i < output.length; i++) {
    const character = output[i]!;
    if (!quoted && (character === " " || character === "\t" || character === "\r" || character === "\n")) {
      if (start < i) pieces.push([start, i]);
      start = i + 1;
    } else if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
  }
  if (start < output.length) pieces.push([start, output.length]);
  if (!pieces.length) return undefined;
  const compact = pieces.map((span) => output.slice(...span)).join("");
  // A conservative canonical subset detects duplicate keys without a second JSON parser.
  // Alternate escapes/number spellings/property ordering remain exact, not silently normalized.
  if (JSON.stringify(value) !== compact || compact.length === output.length) return undefined;
  return { pieces, required: pieces };
}
