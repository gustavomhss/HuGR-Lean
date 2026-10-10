import { filter } from "../core/engine.js";
import { filterStructured } from "../core/structured.js";
import { filterAutomatic } from "../core/automatic.js";
import { filterMcpResult } from "./automatic-mcp.js";
import type { FilterResult, Observation } from "../core/types.js";
import { RawStore } from "../raw/index.js";
import { parseOptions, type PluginOptions } from "./config.js";

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
export type AfterHook = (input: unknown, output: unknown) => Promise<void>;
type Dependencies = { filter?: typeof filter; structuredFilter?: typeof filterStructured; automaticFilter?: typeof filterAutomatic; raw?: Pick<RawStore, "put"> };

/** Adapter changes only model-visible text; native command, title and metadata stay host-owned. */
export function createAfterHook(options: PluginOptions = {}, dependencies: Dependencies = {}): AfterHook {
  const process = dependencies.filter ?? filter;
  const processStructured = dependencies.structuredFilter ?? filterStructured;
  const processAutomatic = dependencies.automaticFilter ?? filterAutomatic;
  const store = options.raw ? dependencies.raw ?? new RawStore(options.raw) : undefined;
  return async (input, output) => {
    try {
      if (options.enabled === false || !isRecord(input) || !isRecord(output)) return;
      if (typeof output.output !== "string") {
        if (options.automatic !== false) await filterMcpResult(input, output, processAutomatic, options.maxInputBytes, store ? text => store.put(text) : undefined);
        return;
      }
      const original = output.output;
      const metadata = isRecord(output.metadata) ? output.metadata : {};
      const exit = metadata.exit;
      const limits = options.maxInputBytes === undefined ? {} : { maxInputBytes: options.maxInputBytes };
      let result: FilterResult;
      if (input.tool === "bash") {
        if (!isRecord(input.args) || typeof input.args.command !== "string") return;
        const command = input.args.command, literal = command.trimStart();
        if (options.excludeCommands?.some((prefix) => literal === prefix || (literal.startsWith(prefix) && /^[ \t]/.test(literal.slice(prefix.length))))) return;
        const observation: Observation = {
          source: "shell", command, output: original, presentation: "unknown",
          completeness: metadata.truncated === false ? "complete" : metadata.truncated === true ? "truncated" : "unknown",
          termination: typeof exit === "number" && Number.isSafeInteger(exit) && exit >= 0 ? { kind: "exited", code: exit } : { kind: "unknown" },
        };
        result = process(observation, limits);
        if (options.automatic !== false && result.status === "passthrough" && ["no_profile", "unsupported_command"].includes(result.reason) && exit === 0 && metadata.truncated === false) {
          result = processAutomatic({ source: "native", tool: "bash", output: original, args: input.args, metadata,
            status: "success", completeness: "complete" }, { ...limits, legacyFilter: () => result });
        }
      } else {
        const binding = options.structuredTools?.find(({ tool }) => tool === input.tool);
        if (binding) {
          if (exit !== 0 || metadata.truncated !== false) return;
          const scopeRef = binding.format === "accessibility-scope" && isRecord(input.args) ? input.args.scopeRef : undefined;
          if (binding.format === "accessibility-scope" && (typeof scopeRef !== "string" || !scopeRef.length)) return;
          result = processStructured({ format: binding.format, output: original,
            termination: { kind: "exited", code: 0 }, completeness: "complete",
            ...(typeof scopeRef === "string" ? { scopeRef } : {}) }, limits);
        } else {
          if (options.automatic === false || !["glob", "grep", "read", "list_mcp_resources", "list_mcp_resource_templates"].includes(input.tool as string) ||
              metadata.truncated !== false || !isRecord(input.args)) return;
          result = processAutomatic({ source: "native", tool: input.tool as string, output: original, args: input.args, metadata,
            status: "success", completeness: "complete" }, limits);
        }
      }
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
