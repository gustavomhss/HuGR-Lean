import type { Reduction, Span } from "./types.js";

// Fixed representation syntax only. Every input-specific label/value remains a source span.
const FORMATTING = new Set(["", " ", "\t", "\n", ":", ",", "[", "]", "{", "}", "-", "=", ": ", '"scope":', '"columns":', '"rows":', '"cellEncoding":"optional"', "text"]);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function ensure(condition: unknown): asserts condition { if (!condition) throw new Error("Invalid source-backed reduction"); }
function checkedSpan(value: unknown, output: string): Span {
  ensure(Array.isArray(value) && value.length === 2);
  const [start, end] = value;
  ensure(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start < end && end <= output.length);
  for (const index of [start, end]) {
    const left = output.charCodeAt(index - 1), right = output.charCodeAt(index);
    ensure(!(left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff));
  }
  return [start, end];
}

/** Shared intact-evidence renderer; execution admission stays with each caller. */
export function renderReduction(output: string, reduction: Reduction): string {
  ensure(record(reduction) && Array.isArray(reduction.pieces) && reduction.pieces.length > 0 && Array.isArray(reduction.required) && reduction.required.length > 0);
  const emitted: [number, number][] = [], parts: string[] = [];
  let adjacent = false;
  for (const piece of reduction.pieces) {
    if (Array.isArray(piece)) {
      const span = checkedSpan(piece, output), last = emitted[emitted.length - 1];
      if (adjacent && last?.[1] === span[0]) last[1] = span[1];
      else emitted.push([span[0], span[1]]);
      parts.push(output.slice(...span)); adjacent = true;
    } else {
      ensure(record(piece) && typeof piece.text === "string" && FORMATTING.has(piece.text));
      parts.push(piece.text); if (piece.text.length) adjacent = false;
    }
  }
  ensure(emitted.length > 0);
  emitted.sort((a, b) => a[0] - b[0]);
  const required = reduction.required.map(span => checkedSpan(span, output)).sort((a, b) => a[0] - b[0]);
  let cursor = 0, farthest = -1;
  for (const [start, end] of required) {
    while (cursor < emitted.length && emitted[cursor]![0] <= start) farthest = Math.max(farthest, emitted[cursor++]![1]);
    ensure(farthest >= end);
  }
  return parts.join("");
}
