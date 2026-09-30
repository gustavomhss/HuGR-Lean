import { tokenizeCommand } from "./command.js";
import { normalize } from "./normalize.js";
import { profiles } from "../profiles/index.js";
import type { FilterOptions, FilterResult, Observation, Profile, Span } from "./types.js";

const MIN_LIMIT = 1024 * 1024;
const DEFAULT_LIMIT = 4 * MIN_LIMIT;
const MAX_LIMIT = 16 * MIN_LIMIT;
const FORMATTING = new Set(["", " ", "\n", ":\n", "- ", "+ "]);
const bytes = (text: string): number => Buffer.byteLength(text, "utf8");
function ensure(condition: unknown): asserts condition {
  if (!condition) throw new Error("Invalid filter input or reduction");
}
function record(value: unknown): asserts value is Record<string, unknown> {
  ensure(value !== null && typeof value === "object" && !Array.isArray(value));
}

function snapshot(value: Record<string, unknown>, output: unknown): Observation {
  const { source, command, termination, completeness, presentation } = value;
  ensure((source === "shell" || source === "other") && typeof command === "string" && typeof output === "string");
  ensure(completeness === "complete" || completeness === "truncated" || completeness === "unknown");
  ensure(presentation === "unknown" || presentation === "terminal-rendered");
  record(termination);
  const { kind, code } = termination;
  ensure(kind === "exited" || kind === "unknown" || kind === "timed_out");
  ensure(kind !== "exited" || (typeof code === "number" && Number.isSafeInteger(code) && code >= 0));
  const exit: Observation["termination"] = kind === "exited" ? { kind, code: code as number } : { kind };
  return Object.freeze({ source, command, output, termination: Object.freeze(exit), completeness, presentation });
}

function span(value: unknown, baseline: string): Span {
  ensure(Array.isArray(value) && value.length === 2);
  const [start, end] = value;
  ensure(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start < end && end <= baseline.length);
  for (const offset of [start, end]) {
    const left = baseline.charCodeAt(offset - 1), right = baseline.charCodeAt(offset);
    ensure(!(left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff));
  }
  return [start, end];
}

function render(value: unknown, baseline: string): string {
  record(value);
  const { pieces, required } = value;
  ensure(Array.isArray(pieces) && pieces.length > 0 && Array.isArray(required) && required.length > 0);
  const evidence: Span[] = [];
  let end = 0;
  for (const item of required) {
    const checked = span(item, baseline);
    ensure(checked[0] >= end);
    evidence.push(checked);
    end = checked[1];
  }
  const emitted: Span[] = [], parts: string[] = [];
  end = 0;
  let adjacent = false;
  for (const piece of pieces) {
    if (Array.isArray(piece)) {
      const checked = span(piece, baseline);
      ensure(checked[0] >= end);
      const previous = emitted[emitted.length - 1];
      if (adjacent && previous?.[1] === checked[0]) emitted[emitted.length - 1] = [previous[0], checked[1]];
      else emitted.push(checked);
      parts.push(baseline.slice(...checked));
      end = checked[1];
      adjacent = true;
    } else {
      record(piece);
      const { text } = piece;
      // Closed formatting vocabulary; all other content must be source slices.
      ensure(typeof text === "string" && FORMATTING.has(text));
      parts.push(text);
      if (text.length) adjacent = false;
    }
  }
  ensure(emitted.length > 0);
  let cursor = 0;
  for (const [start, stop] of evidence) {
    while (cursor < emitted.length && emitted[cursor]![1] <= start) cursor++;
    const covering = emitted[cursor];
    ensure(covering !== undefined && covering[0] <= start && covering[1] >= stop);
  }
  return parts.join("");
}

/** Pure post-execution filtering. failed_open never supplies a replacement. */
export function filter(observation: Observation, options: FilterOptions = {}): FilterResult {
  let inputBytes = 0;
  let reason = "invalid_observation";
  const unchanged = (status: "passthrough" | "failed_open", why: string): FilterResult =>
    ({ status, reason: why, inputBytes, outputBytes: inputBytes });
  try {
    record(observation);
    const output = observation.output;
    if (typeof output === "string") inputBytes = bytes(output);
    const frozen = snapshot(observation, output);
    reason = "invalid_options";
    record(options);
    const { maxInputBytes = DEFAULT_LIMIT, profiles: selected = profiles } = options;
    ensure(typeof maxInputBytes === "number" && Number.isSafeInteger(maxInputBytes) && maxInputBytes >= MIN_LIMIT && maxInputBytes <= MAX_LIMIT);
    ensure(Array.isArray(selected));
    const admitted: Profile[] = [];
    for (let i = 0, count = selected.length; i < count; i++) {
      const entry: unknown = selected[i];
      record(entry);
      const { id, match, reduce } = entry;
      ensure(typeof id === "string" && id.length > 0 && typeof match === "function" && typeof reduce === "function");
      admitted.push(Object.freeze({ id, match, reduce }) as Profile);
    }
    if (inputBytes > maxInputBytes) return unchanged("passthrough", "input_limit");
    if (frozen.completeness !== "complete" || frozen.termination.kind !== "exited")
      return unchanged("passthrough", "incomplete_observation");
    if (frozen.termination.code !== 0) return unchanged("passthrough", "nonzero_exit");
    if (frozen.source !== "shell") return unchanged("passthrough", "unsupported_source");
    const argv = tokenizeCommand(frozen.command);
    if (!argv) return unchanged("passthrough", "unsupported_command");
    reason = "profile_error";
    let matched: Profile | undefined;
    for (const entry of admitted) {
      const matches = entry.match(argv);
      ensure(typeof matches === "boolean");
      if (matches) {
        if (matched) return unchanged("failed_open", "overlapping_profiles");
        matched = entry;
      }
    }
    if (!matched) return unchanged("passthrough", "no_profile");
    const baseline = normalize(frozen.output, frozen.presentation);
    const reduction = matched.reduce(baseline, Object.freeze({ ...frozen, output: baseline }));
    if (reduction === undefined) return unchanged("passthrough", "unsupported_output");
    reason = "invalid_reduction";
    const replacement = render(reduction, baseline);
    const outputBytes = bytes(replacement), baselineBytes = bytes(baseline);
    if (outputBytes < baselineBytes)
      return { status: "reduced", replacement, profile: matched.id, inputBytes, outputBytes, reason: "profile_reduction" };
    if (baselineBytes < inputBytes)
      return { status: "normalized", replacement: baseline, inputBytes, outputBytes: baselineBytes, reason: "safe_presentation" };
    return unchanged("passthrough", "not_smaller");
  } catch {
    return unchanged("failed_open", reason);
  }
}
