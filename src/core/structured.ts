import type { FilterResult, Span } from "./types.js";
import { structuredFormats, type StructuredFilterOptions, type StructuredObservation } from "./structured-types.js";
import { structuredReducers } from "./structured-registry.js";

const FORMATTING = new Set(["", " ", "\t", "\n", ":", ",", "[", "]", "{", "}", "-", "=", ": ", '"scope":']);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function ensure(condition: unknown): asserts condition { if (!condition) throw new Error("Invalid structured observation or reduction"); }
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

/** Explicit structured-output opt-in. Never routes existing shell calls by JSON sniffing. */
export function filterStructured(observation: StructuredObservation, options: StructuredFilterOptions = {}): FilterResult {
  let inputBytes = 0;
  const unchanged = (status: "passthrough" | "failed_open", reason: string): FilterResult => ({ status, reason, inputBytes, outputBytes: inputBytes });
  try {
    ensure(record(observation));
    const { output, format, completeness, termination, scopeRef } = observation;
    if (typeof output === "string") inputBytes = Buffer.byteLength(output, "utf8");
    ensure(typeof output === "string" && structuredFormats.includes(format));
    ensure(["complete", "truncated", "unknown"].includes(completeness));
    ensure(scopeRef === undefined || (typeof scopeRef === "string" && scopeRef.length > 0));
    ensure(record(termination));
    const { kind, code } = termination as { readonly kind: unknown; readonly code?: unknown };
    ensure(typeof kind === "string" && ["exited", "unknown", "timed_out"].includes(kind));
    ensure(kind !== "exited" || (typeof code === "number" && Number.isSafeInteger(code) && code >= 0));
    ensure(record(options));
    const { maxInputBytes = 4 * 1024 * 1024, reducers = structuredReducers } = options;
    ensure(typeof maxInputBytes === "number" && Number.isSafeInteger(maxInputBytes) && maxInputBytes >= 1024 * 1024 && maxInputBytes <= 16 * 1024 * 1024 && record(reducers));
    if (inputBytes > maxInputBytes) return unchanged("passthrough", "input_limit");
    if (completeness !== "complete" || kind !== "exited") return unchanged("passthrough", "incomplete_observation");
    if (code !== 0) return unchanged("passthrough", "nonzero_exit");
    if (format === "accessibility-scope" ? scopeRef === undefined : scopeRef !== undefined) return unchanged("passthrough", "invalid_scope");
    const reducer = reducers[format];
    if (reducer === undefined) return unchanged("passthrough", "unsupported_format");
    ensure(typeof reducer === "function");
    const frozen = Object.freeze({ output, format, completeness, termination: Object.freeze({ kind: "exited" as const, code }), ...(scopeRef === undefined ? {} : { scopeRef }) });
    const reduction = reducer(output, frozen);
    if (reduction === undefined) return unchanged("passthrough", "unsupported_output");
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
    const replacement = parts.join(""), outputBytes = Buffer.byteLength(replacement, "utf8");
    if (!replacement.length || outputBytes >= inputBytes) return unchanged("passthrough", "not_smaller");
    return { status: "reduced", profile: `structured-${format}`, reason: "structured_reduction", replacement, inputBytes, outputBytes };
  } catch { return unchanged("failed_open", "invalid_structured_input_or_reduction"); }
}
