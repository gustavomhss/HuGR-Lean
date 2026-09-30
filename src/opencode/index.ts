import { filter } from "../core/engine.js";
import type { FilterResult, Observation } from "../core/types.js";
import { RawStore } from "../raw/index.js";
import { parseOptions, type PluginOptions } from "./config.js";

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
export type AfterHook = (input: unknown, output: unknown) => Promise<void>;
type Dependencies = { filter?: typeof filter; raw?: Pick<RawStore, "put"> };

/** Adapter changes only model-visible text; native command, title and metadata stay host-owned. */
export function createAfterHook(options: PluginOptions = {}, dependencies: Dependencies = {}): AfterHook {
  const process = dependencies.filter ?? filter;
  const store = options.raw ? dependencies.raw ?? new RawStore(options.raw) : undefined;
  return async (input, output) => {
    try {
      if (options.enabled === false || !isRecord(input) || input.tool !== "bash" || !isRecord(input.args) || typeof input.args.command !== "string" || !isRecord(output) || typeof output.output !== "string") return;
      const command = input.args.command;
      const literal = command.trimStart();
      if (options.excludeCommands?.some((prefix) => literal === prefix || (literal.startsWith(prefix) && /^[ \t]/.test(literal.slice(prefix.length))))) return;
      const original = output.output;
      const metadata = isRecord(output.metadata) ? output.metadata : {};
      const exit = metadata.exit;
      const observation: Observation = {
        source: "shell", command, output: original, presentation: "unknown",
        completeness: metadata.truncated === false ? "complete" : metadata.truncated === true ? "truncated" : "unknown",
        termination: typeof exit === "number" && Number.isSafeInteger(exit) && exit >= 0 ? { kind: "exited", code: exit } : { kind: "unknown" },
      };
      const result: FilterResult = process(observation, options.maxInputBytes === undefined ? {} : { maxInputBytes: options.maxInputBytes });
      if (!isRecord(result) || (result.status !== "reduced" && result.status !== "normalized") || typeof result.replacement !== "string") return;
      const before = Buffer.byteLength(original, "utf8"), after = Buffer.byteLength(result.replacement, "utf8");
      if (before !== result.inputBytes || after !== result.outputBytes || after >= before || !result.replacement.length || (result.status === "reduced" && (typeof result.profile !== "string" || !result.profile.length))) return;
      // Persist material changes only. IDs are inspected through CLI, never appended to tool output.
      if (store && before - after >= 1024 && (before - after) / before >= 0.1) await store.put(original);
      if (output.output === original) output.output = result.replacement;
    } catch {
      // Caller retains original; adapter failure never becomes host tool failure.
    }
  };
}

export default async function plugin(_context: unknown, value?: unknown): Promise<Record<string, AfterHook>> {
  try {
    const options = parseOptions(value);
    return options ? { "tool.execute.after": createAfterHook(options) } : {};
  } catch { return {}; }
}
