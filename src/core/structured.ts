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
    ensure(record(termination) && ["exited", "unknown", "timed_out"].includes(termination.kind));
    ensure(termination.kind !== "exited" || (Number.isSafeInteger(termination.code) && termination.code >= 0));
    ensure(record(options));
    const { maxInputBytes = 4 * 1024 * 1024, reducers = structuredReducers } = options;
    ensure(typeof maxInputBytes === "number" && Number.isSafeInteger(maxInputBytes) && maxInputBytes >= 1024 * 1024 && maxInputBytes <= 16 * 1024 * 1024 && record(reducers));
    if (inputBytes > maxInputBytes) return unchanged("passthrough", "input_limit");
    if (completeness !== "complete" || termination.kind !== "exited") return unchanged("passthrough", "incomplete_observation");
    if (termination.code !== 0) return unchanged("passthrough", "nonzero_exit");
    if (format === "accessibility-scope" ? scopeRef === undefined : scopeRef !== undefined) return unchanged("passthrough", "invalid_scope");
    const reducer = reducers[format];
    if (reducer === undefined) return unchanged("passthrough", "unsupported_format");
    ensure(typeof reducer === "function");
    const frozen = Object.freeze({ output, format, completeness, termination: Object.freeze({ kind: "exited" as const, code: termination.code }), ...(scopeRef === undefined ? {} : { scopeRef }) });
    const reduction = reducer(output, frozen);
    if (reduction === undefined) return unchanged("passthrough", "unsupported_output");
    ensure(record(reduction) && Array.isArray(reduction.pieces) && reduction.pieces.length > 0 && Array.isArray(reduction.required) && reduction.required.length > 0);
    const emitted: Span[] = [], parts: string[] = [];
    for (const piece of reduction.pieces) {
      if (Array.isArray(piece)) { const span = checkedSpan(piece, output); emitted.push(span); parts.push(output.slice(...span)); }
      else { ensure(record(piece) && typeof piece.text === "string" && FORMATTING.has(piece.text)); parts.push(piece.text); }
    }
    ensure(emitted.length > 0);
    emitted.sort((a, b) => a[0] - b[0]);
    const coverage: [number, number][] = [];
    for (const [start, end] of emitted) {
      const last = coverage[coverage.length - 1];
      if (last && start <= last[1]) last[1] = Math.max(last[1], end);
      else coverage.push([start, end]);
    }
    const required = reduction.required.map(span => checkedSpan(span, output)).sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (const [start, end] of required) {
      while (cursor < coverage.length && coverage[cursor]![1] <= start) cursor++;
      ensure(coverage[cursor] !== undefined && coverage[cursor]![0] <= start && coverage[cursor]![1] >= end);
    }
    const replacement = parts.join(""), outputBytes = Buffer.byteLength(replacement, "utf8");
    if (!replacement.length || outputBytes >= inputBytes) return unchanged("passthrough", "not_smaller");
    return { status: "reduced", profile: `structured-${format}`, reason: "structured_reduction", replacement, inputBytes, outputBytes };
  } catch { return unchanged("failed_open", "invalid_structured_input_or_reduction"); }
}
