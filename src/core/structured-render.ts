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

/** Module-private sentinel: no piece can carry it, so the first text is always checked. */
const NONE = Symbol("none");
/** Pair storage grows by doubling; spans index a JS string, so every value fits in an Int32. */
function grow(values: Int32Array): Int32Array { const next = new Int32Array(values.length * 2); next.set(values); return next; }
/**
 * Sorts (starts, ends) pairs by start. Coverage depends only on the multiset of pairs, so tie order is free.
 * Nearly sorted input (local inversions, e.g. a reordered row) costs one insertion pass; beyond a linear move
 * budget the remaining work falls back to a comparison sort.
 */
function sortPairs(starts: Int32Array, ends: Int32Array, count: number): void {
  let budget = 8 * count + 64;
  for (let index = 1; index < count; index++) {
    const start = starts[index]!;
    if (starts[index - 1]! <= start) continue;
    const end = ends[index]!;
    let at = index - 1;
    while (at >= 0 && starts[at]! > start && budget > 0) { starts[at + 1] = starts[at]!; ends[at + 1] = ends[at]!; at--; budget--; }
    starts[at + 1] = start; ends[at + 1] = end;
    if (budget === 0) {
      const order = Array.from({ length: count }, (_, position) => position).sort((a, b) => starts[a]! - starts[b]!);
      const sortedStarts = order.map(position => starts[position]!), sortedEnds = order.map(position => ends[position]!);
      starts.set(sortedStarts); ends.set(sortedEnds);
      return;
    }
  }
}

/**
 * Shared intact-evidence renderer core. Output text is assembled from coalesced source runs: consecutive
 * contiguous spans, and formatting text identical to the source at the run's end, become one slice.
 * Evidence coverage keeps the original rule (each required span within one emitted adjacent-span run):
 * every required span is read and bounds-checked once, then both span lists are sorted by start and one
 * linear merge tracks the farthest emitted end among emitted starts <= each required start.
 */
export function renderPieces(output: string, pieces: unknown, evidence: unknown, formatting: ReadonlySet<string>): string {
  let pieceCount = 0;
  ensure(Array.isArray(pieces) && (pieceCount = pieces.length) > 0 && Array.isArray(evidence) && evidence.length > 0);
  let starts: Int32Array = new Int32Array(pieceCount), ends: Int32Array = new Int32Array(pieceCount), count = 0;
  // Callers pass module-private, never-mutated whitelists, so a text equal to the last admitted one is admitted.
  let adjacent = false, ordered = true, rendered = "", runStart = -1, runEnd = -1, admitted: unknown = NONE;
  for (const piece of pieces as unknown[]) {
    if (Array.isArray(piece)) {
      ensure(piece.length === 2);
      const [rawStart, rawEnd] = piece as unknown[];
      checkBounds(rawStart, rawEnd, output);
      const start = rawStart as number, end = rawEnd as number;
      if (adjacent && ends[count - 1] === start) ends[count - 1] = end;
      else {
        if (count > 0 && start < starts[count - 1]!) ordered = false;
        if (count === starts.length) { starts = grow(starts); ends = grow(ends); }
        starts[count] = start; ends[count++] = end;
      }
      if (runEnd === start) runEnd = end;
      else {
        if (runStart >= 0) rendered += output.slice(runStart, runEnd);
        runStart = start; runEnd = end;
      }
      adjacent = true;
    } else {
      ensure(record(piece));
      const { text: value } = piece;
      if (value !== admitted) { ensure(typeof value === "string" && formatting.has(value)); admitted = value; }
      const text = admitted as string;
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
  ensure(count > 0);
  if (!ordered) sortPairs(starts, ends, count);
  const total = evidence.length, requiredStarts = new Int32Array(total), requiredEnds = new Int32Array(total);
  let required = 0, requiredOrdered = true, sparse = false;
  for (let index = 0; index < total; index++) {
    const span: unknown = evidence[index];
    if (span === undefined && !(index in evidence)) { sparse = true; continue; }
    ensure(Array.isArray(span) && span.length === 2);
    const [rawStart, rawEnd] = span as unknown[];
    checkBounds(rawStart, rawEnd, output);
    const start = rawStart as number;
    if (required > 0 && start < requiredStarts[required - 1]!) requiredOrdered = false;
    requiredStarts[required] = start; requiredEnds[required++] = rawEnd as number;
  }
  if (!requiredOrdered) sortPairs(requiredStarts, requiredEnds, required);
  let cursor = 0, farthest = -1;
  for (let index = 0; index < required; index++) {
    const start = requiredStarts[index]!;
    while (cursor < count && starts[cursor]! <= start) { const end = ends[cursor++]!; if (end > farthest) farthest = end; }
    ensure(farthest >= requiredEnds[index]!);
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
