import type { FilterResult } from "./types.js";
import { renderPieces } from "./structured-render.js";
import { structuredFormats, type StructuredFilterOptions, type StructuredObservation } from "./structured-types.js";
import { structuredReducers } from "./structured-registry.js";

const FORMATTING = new Set(["", " ", "\t", "\n", ":", ",", "[", "]", "{", "}", "-", "=", ": ", '"scope":']);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function ensure(condition: unknown): asserts condition { if (!condition) throw new Error("Invalid structured observation or reduction"); }
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
    ensure(record(reduction));
    const { pieces, required: evidence } = reduction;
    // Shared allocation-light renderer; any of its failures (thrown) still fails open below.
    const replacement = renderPieces(output, pieces, evidence, FORMATTING), outputBytes = Buffer.byteLength(replacement, "utf8");
    if (!replacement.length || outputBytes >= inputBytes) return unchanged("passthrough", "not_smaller");
    return { status: "reduced", profile: `structured-${format}`, reason: "structured_reduction", replacement, inputBytes, outputBytes };
  } catch { return unchanged("failed_open", "invalid_structured_input_or_reduction"); }
}
