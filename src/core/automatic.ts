import { filter } from "./engine.js";
import { tokenizeAutomaticCommand } from "./automatic-command.js";
import { profiles } from "../profiles/index.js";
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
    const { truncated, exit } = frozen.metadata;
    if ((truncated !== undefined && truncated !== false) || (exit !== undefined && exit !== 0)) return unchanged("passthrough", "contradictory_tool_facts");
    if (source === "native" && tool === "bash") {
      if (frozen.metadata.exit !== 0 || frozen.metadata.truncated !== false || typeof frozen.args.command !== "string") return unchanged("passthrough", "missing_shell_facts");
      const legacy = legacyFilter({ source: "shell", command: frozen.args.command, output,
        termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" }, { maxInputBytes });
      if (legacy.status !== "passthrough" || !["no_profile", "unsupported_command"].includes(legacy.reason)) return legacy;
      const argv = tokenizeAutomaticCommand(frozen.args.command);
      if (!argv || (legacy.reason === "unsupported_command" && profiles.some(profile => profile.match(argv)))) return legacy;
    }
    for (const entry of reducers) {
      ensure(record(entry));
      const { id, reduce } = entry;
      ensure(typeof id === "string" && id.length > 0 && typeof reduce === "function");
      const reduction = reduce(frozen);
      if (!reduction) continue;
      const replacement = renderReduction(output, reduction), outputBytes = Buffer.byteLength(replacement, "utf8");
      if (replacement.length && outputBytes < inputBytes) return { status: "reduced", profile: id, reason: "automatic_native_view", replacement, inputBytes, outputBytes };
    }
    return unchanged("passthrough", "unsupported_or_not_smaller");
  } catch { return unchanged("failed_open", "invalid_automatic_input_or_reduction"); }
}
