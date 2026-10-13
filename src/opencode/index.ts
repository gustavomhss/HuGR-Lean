import { filter } from "../core/engine.js";
import { filterStructured } from "../core/structured.js";
import { filterAutomatic } from "../core/automatic.js";
import { filterMcpResult } from "./automatic-mcp.js";
import type { FilterResult, Observation } from "../core/types.js";
import { RawStore, recallLines } from "../raw/index.js";
import { recoveryLine, summarize } from "../core/summarize.js";
import { parseOptions, type PluginOptions } from "./config.js";

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
export type AfterHook = (input: unknown, output: unknown) => Promise<void>;
type Dependencies = { filter?: typeof filter; structuredFilter?: typeof filterStructured; automaticFilter?: typeof filterAutomatic; raw?: Pick<RawStore, "put"> };

/** Adapter changes only model-visible text; native command, title and metadata stay host-owned. */
export function createAfterHook(options: PluginOptions = {}, dependencies: Dependencies = {}): AfterHook {
  const process = dependencies.filter ?? filter;
  const processStructured = dependencies.structuredFilter ?? filterStructured;
  const processAutomatic = dependencies.automaticFilter ?? filterAutomatic;
  const summarizing = options.mode !== "lossless";
  const store = summarizing ? summaryStore(options, dependencies.raw) : options.raw ? dependencies.raw ?? new RawStore(options.raw) : undefined;
  return async (input, output) => {
    try {
      if (options.enabled === false || !isRecord(input) || !isRecord(output)) return;
      // Read caller-owned fields once; every decision and the core see the same frozen values.
      const original = output.output;
      if (typeof original !== "string") {
        if (options.automatic !== false) await filterMcpResult(input, output, processAutomatic, options.maxInputBytes, options.raw && store ? text => store.put(text) : undefined);
        return;
      }
      const { tool, args: actualArgs } = input, actualMetadata = output.metadata;
      const args = isRecord(actualArgs) ? Object.freeze({ ...actualArgs }) : undefined;
      const metadata: Readonly<Record<string, unknown>> = isRecord(actualMetadata) ? Object.freeze({ ...actualMetadata }) : {};
      const exit = metadata.exit;
      const limits = options.maxInputBytes === undefined ? {} : { maxInputBytes: options.maxInputBytes };
      const lossless = (): FilterResult | undefined => {
        if (tool === "bash") {
          const command = args!.command as string;
          const observation: Observation = {
            source: "shell", command, output: original, presentation: "unknown",
            completeness: metadata.truncated === false ? "complete" : metadata.truncated === true ? "truncated" : "unknown",
            termination: typeof exit === "number" && Number.isSafeInteger(exit) && exit >= 0 ? { kind: "exited", code: exit } : { kind: "unknown" },
          };
          let result = process(observation, limits);
          if (options.automatic !== false && result.status === "passthrough" && ["no_profile", "unsupported_command"].includes(result.reason) && exit === 0 && metadata.truncated === false) {
            const legacy = result;
            result = processAutomatic({ source: "native", tool: "bash", output: original, args: args!, metadata,
              status: "success", completeness: "complete" }, { ...limits, legacyFilter: () => legacy });
          }
          return result;
        }
        const binding = options.structuredTools?.find((entry) => entry.tool === tool);
        if (binding) {
          if (exit !== 0 || metadata.truncated !== false) return;
          const scopeRef = binding.format === "accessibility-scope" && args ? args.scopeRef : undefined;
          if (binding.format === "accessibility-scope" && (typeof scopeRef !== "string" || !scopeRef.length)) return;
          return processStructured({ format: binding.format, output: original,
            termination: { kind: "exited", code: 0 }, completeness: "complete",
            ...(typeof scopeRef === "string" ? { scopeRef } : {}) }, limits);
        }
        if (options.automatic === false || typeof tool !== "string" || !["glob", "grep", "read"].includes(tool) ||
            metadata.truncated !== false || !args) return;
        return processAutomatic({ source: "native", tool, output: original, args, metadata,
          status: "success", completeness: "complete" }, limits);
      };
      if (tool === "bash") {
        if (!args || typeof args.command !== "string") return;
        const literal = args.command.trimStart();
        if (options.excludeCommands?.some((prefix) => literal === prefix || (literal.startsWith(prefix) && /^[ \t]/.test(literal.slice(prefix.length))))) return;
      }
      const before = Buffer.byteLength(original, "utf8");
      let text = original, stored: string | undefined;
      const result = lossless();
      if (isRecord(result) && (result.status === "reduced" || result.status === "normalized") && typeof result.replacement === "string") {
        const after = Buffer.byteLength(result.replacement, "utf8");
        if (before === result.inputBytes && after === result.outputBytes && after < before && result.replacement.length && (result.status !== "reduced" || (typeof result.profile === "string" && result.profile.length))) {
          // Opt-in `raw` persists material lossless changes; the ID is reused if a summary follows.
          if (options.raw && store && before - after >= 1024 && (before - after) / before >= 0.1) stored = await store.put(original);
          text = result.replacement;
        }
      }
      if (summarizing && typeof tool === "string" && SUMMARIZED.includes(tool) && !options.structuredTools?.some((entry) => entry.tool === tool)) {
        const summary = summarize({ tool, output: text, ...(args ? { args } : {}), metadata }, options.summarize);
        if (summary.status === "rewritten") text = summary.replacement;
        else if (summary.status === "summarized" && store) {
          // The complete original, before any rewrite, is what recall returns. Storage failure keeps `text`.
          try { text = summary.replacement + recoveryLine(stored ?? await store.put(original)); } catch { /* keep text */ }
        }
      }
      if (text !== original && Buffer.byteLength(text, "utf8") < before && output.output === original) output.output = text;
    } catch {
      // Caller retains original; adapter failure never becomes host tool failure.
    }
  };
}

const SUMMARIZED = ["bash", "read", "webfetch"];

/** Summaries need recovery: an explicit `raw: false` leaves only lossless rewrites. Eviction keeps it working when full. */
function summaryStore(options: PluginOptions, injected?: Pick<RawStore, "put">): Pick<RawStore, "put"> | undefined {
  if (options.raw === false) return undefined;
  return injected ?? new RawStore({ evict: true, ...(options.raw ?? {}) });
}

/** OpenCode plugin tool; legacy JSON-schema args keep this package free of a zod dependency. */
export function createRecallTool(store: Pick<RawStore, "get">) {
  return {
    description: "Fetch the complete original output of a tool call that HuGR-Lean summarized. Pass the id from its last line `[full output: lean recall <id>]`. Optionally pass lines as a 1-based inclusive range like \"120-240\" (empty string for everything).",
    args: {
      id: { type: "string", description: "32 hex characters from the recovery line" },
      lines: { type: "string", description: "Optional line range such as 120-240, 120- or 120; empty for the whole output" },
    },
    async execute(args: unknown): Promise<string> {
      const { id, lines } = isRecord(args) ? args : {};
      if (typeof id !== "string") throw new TypeError("id is required");
      if (lines !== undefined && typeof lines !== "string") throw new TypeError("lines must be a string");
      const text = await store.get(id.trim());
      if (text === undefined) return "unavailable: the original expired or was evicted from the local store";
      return recallLines(text, lines);
    },
  };
}

export type Hooks = { "tool.execute.after"?: AfterHook; tool?: { lean_recall: ReturnType<typeof createRecallTool> } };

export default async function plugin(_context: unknown, value?: unknown): Promise<Hooks> {
  try {
    const options = parseOptions(value);
    if (!options) return {};
    const store = options.mode !== "lossless" && options.enabled !== false && options.raw !== false ? new RawStore({ evict: true, ...(options.raw ?? {}) }) : undefined;
    const hook = createAfterHook(options, store ? { raw: store } : {});
    return store ? { "tool.execute.after": hook, tool: { lean_recall: createRecallTool(store) } } : { "tool.execute.after": hook };
  } catch { return {}; }
}
