import { filter } from "./engine.js";
import { tokenizeCommand } from "./command.js";
import { renderReduction } from "./structured-render.js";
import { automaticReducers } from "./automatic-registry.js";
import type { AutomaticObservation, AutomaticOptions } from "./automatic-types.js";
import type { FilterResult } from "./types.js";

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function ensure(condition: unknown): asserts condition { if (!condition) throw new Error("Invalid automatic observation"); }

/** Default model-visible views. Never guesses shell success or bypasses a legacy grammar refusal. */
export function filterAutomatic(observation: AutomaticObservation, options: AutomaticOptions = {}): FilterResult {
  let inputBytes = 0;
  const unchanged = (status: "passthrough" | "failed_open", reason: string): FilterResult => ({ status, reason, inputBytes, outputBytes: inputBytes });
  try {
    ensure(record(observation));
    const { source, tool, output, args, metadata, status, completeness } = observation;
    if (typeof output === "string") inputBytes = Buffer.byteLength(output, "utf8");
    ensure(["native", "mcp"].includes(source) && typeof tool === "string" && tool.length > 0 && typeof output === "string");
    ensure(record(args) && record(metadata) && ["success", "failure", "unknown"].includes(status) && ["complete", "truncated", "unknown"].includes(completeness));
    ensure(record(options));
    const { maxInputBytes = 4 * 1024 * 1024, reducers = automaticReducers, legacyFilter = filter } = options;
    ensure(typeof maxInputBytes === "number" && Number.isSafeInteger(maxInputBytes) && maxInputBytes >= 1024 * 1024 && maxInputBytes <= 16 * 1024 * 1024 && Array.isArray(reducers) && typeof legacyFilter === "function");
    if (inputBytes > maxInputBytes) return unchanged("passthrough", "input_limit");
    if (status !== "success" || completeness !== "complete") return unchanged("passthrough", "incomplete_or_failed_tool");
    const frozen = Object.freeze({ source, tool, output, status, completeness, args: Object.freeze({ ...args }), metadata: Object.freeze({ ...metadata }) });
    if (source === "native" && tool === "bash") {
      if (frozen.metadata.exit !== 0 || frozen.metadata.truncated !== false || typeof frozen.args.command !== "string") return unchanged("passthrough", "missing_shell_facts");
      const legacy = legacyFilter({ source: "shell", command: frozen.args.command, output,
        termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" }, { maxInputBytes });
      if (legacy.status !== "passthrough" || legacy.reason !== "no_profile") return legacy;
      if (!tokenizeCommand(frozen.args.command)) return unchanged("passthrough", "unsupported_command");
    }
    for (const entry of reducers) {
      ensure(record(entry) && typeof entry.id === "string" && entry.id.length > 0 && typeof entry.reduce === "function");
      const reduction = entry.reduce(frozen);
      if (!reduction) continue;
      const replacement = renderReduction(output, reduction), outputBytes = Buffer.byteLength(replacement, "utf8");
      if (replacement.length && outputBytes < inputBytes) return { status: "reduced", profile: entry.id, reason: "automatic_native_view", replacement, inputBytes, outputBytes };
    }
    return unchanged("passthrough", "unsupported_or_not_smaller");
  } catch { return unchanged("failed_open", "invalid_automatic_input_or_reduction"); }
}
