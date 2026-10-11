import type { Reduction, Span } from "./types.js";

// Fixed representation syntax only. Every input-specific label/value remains a source span.
const FORMATTING = new Set(["", " ", "\t", "\n", ":", ",", "[", "]", "{", "}", "-", "=", ": ", '"scope":', '"columns":', '"rows":', '"cellEncoding":"optional"', "text"]);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function ensure(condition: unknown): asserts condition { if (!condition) throw new Error("Invalid source-backed reduction"); }
const splitsPair = (output: string, index: number): boolean => {
  const left = output.charCodeAt(index - 1);
  if (!(left >= 0xd800 && left <= 0xdbff)) return false;
  const right = output.charCodeAt(index);
  return right >= 0xdc00 && right <= 0xdfff;
};
/** Validates destructured span bounds without allocating; callers read length once and destructure once. */
function checkBounds(start: unknown, end: unknown, output: string): void {
  ensure(Number.isSafeInteger(start) && Number.isSafeInteger(end));
  const from = start as number, to = end as number;
  ensure(from >= 0 && from < to && to <= output.length && !splitsPair(output, from) && !splitsPair(output, to));
}
/** Reproduces the original iteration over a sparse required list: its hole is read as undefined and destructured. */
function holeFailure(): never {
  for (const [start] of [undefined] as unknown as Span[]) void start;
  throw new Error("Invalid source-backed reduction");
}

/**
 * Shared intact-evidence renderer core. Output text is assembled from coalesced source runs: consecutive
 * contiguous spans, and formatting text identical to the source at the run's end, become one slice.
 * Evidence coverage keeps the original rule (each required span within one emitted adjacent-span run).
 */
export function renderPieces(output: string, pieces: unknown, evidence: unknown, formatting: ReadonlySet<string>): string {
  ensure(Array.isArray(pieces) && pieces.length > 0 && Array.isArray(evidence) && evidence.length > 0);
  const starts: number[] = [], ends: number[] = [];
  let adjacent = false, ordered = true, rendered = "", runStart = -1, runEnd = -1;
  for (const piece of pieces as unknown[]) {
    if (Array.isArray(piece)) {
      ensure(piece.length === 2);
      const [rawStart, rawEnd] = piece as unknown[];
      checkBounds(rawStart, rawEnd, output);
      const start = rawStart as number, end = rawEnd as number;
      const last = starts.length - 1;
      if (adjacent && ends[last] === start) ends[last] = end;
      else {
        if (last >= 0 && start < starts[last]!) ordered = false;
        starts.push(start); ends.push(end);
      }
      if (runEnd === start) runEnd = end;
      else {
        if (runStart >= 0) rendered += output.slice(runStart, runEnd);
        runStart = start; runEnd = end;
      }
      adjacent = true;
    } else {
      ensure(record(piece));
      const { text } = piece;
      ensure(typeof text === "string" && formatting.has(text));
      if (text.length) {
        adjacent = false;
        if (runStart >= 0 && output.startsWith(text, runEnd)) runEnd += text.length;
        else {
          if (runStart >= 0) { rendered += output.slice(runStart, runEnd); runStart = runEnd = -1; }
          rendered += text;
        }
      }
    }
  }
  if (runStart >= 0) rendered += output.slice(runStart, runEnd);
  const count = starts.length;
  ensure(count > 0);
  if (!ordered) {
    const order = starts.map((_, index) => index).sort((a, b) => starts[a]! - starts[b]!);
    const sortedStarts = order.map(index => starts[index]!), sortedEnds = order.map(index => ends[index]!);
    for (let index = 0; index < count; index++) { starts[index] = sortedStarts[index]!; ends[index] = sortedEnds[index]!; }
  }
  // farthest = largest emitted end among emitted starts <= the required start (original sweep, any required order).
  const total = evidence.length;
  let cursor = 0, farthest = -1, previous = -1, sparse = false, prefix: number[] | undefined;
  for (let index = 0; index < total; index++) {
    const span: unknown = evidence[index];
    if (span === undefined && !(index in evidence)) { sparse = true; continue; }
    ensure(Array.isArray(span) && span.length === 2);
    const [rawStart, rawEnd] = span as unknown[];
    checkBounds(rawStart, rawEnd, output);
    const start = rawStart as number, end = rawEnd as number;
    if (start < previous) {
      if (!prefix) { prefix = []; let max = -1; for (let at = 0; at < count; at++) prefix.push(max = Math.max(max, ends[at]!)); }
      let low = 0, high = count;
      while (low < high) { const middle = (low + high) >>> 1; if (starts[middle]! <= start) low = middle + 1; else high = middle; }
      cursor = low; farthest = low ? prefix[low - 1]! : -1;
    }
    while (cursor < count && starts[cursor]! <= start) farthest = Math.max(farthest, ends[cursor++]!);
    ensure(farthest >= end);
    previous = start;
  }
  if (sparse) holeFailure();
  return rendered;
}

/** Shared intact-evidence renderer; execution admission stays with each caller. */
export function renderReduction(output: string, reduction: Reduction): string {
  ensure(record(reduction));
  const { pieces, required: evidence } = reduction;
  return renderPieces(output, pieces, evidence, FORMATTING);
}
