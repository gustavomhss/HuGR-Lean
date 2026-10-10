import type { RawOptions } from "../raw/index.js";
import { structuredFormats, type StructuredFormat } from "../core/structured-types.js";

export interface PluginOptions {
  readonly enabled?: boolean;
  readonly automatic?: boolean;
  readonly excludeCommands?: readonly string[];
  readonly maxInputBytes?: number;
  readonly raw?: false | RawOptions;
  readonly structuredTools?: readonly { readonly tool: string; readonly format: StructuredFormat }[];
}

export function parseOptions(value: unknown): PluginOptions | undefined {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const options = value as Record<string, unknown>;
  if (Object.keys(options).some((key) => !["enabled", "automatic", "excludeCommands", "maxInputBytes", "raw", "structuredTools"].includes(key))) return undefined;
  if (options.automatic !== undefined && typeof options.automatic !== "boolean") return undefined;
  if (options.structuredTools !== undefined) {
    if (!Array.isArray(options.structuredTools)) return undefined;
    const tools = new Set<string>();
    for (const binding of options.structuredTools) {
      if (binding === null || typeof binding !== "object" || Array.isArray(binding) ||
        Object.keys(binding).some((key) => !["tool", "format"].includes(key)) ||
        typeof binding.tool !== "string" || !binding.tool.trim().length || binding.tool === "bash" ||
        tools.has(binding.tool) || !structuredFormats.includes(binding.format)) return undefined;
      tools.add(binding.tool);
    }
  }
  if (options.enabled !== undefined && typeof options.enabled !== "boolean") return undefined;
  if (options.excludeCommands !== undefined && (!Array.isArray(options.excludeCommands) || options.excludeCommands.some((item) => typeof item !== "string" || !item.length))) return undefined;
  if (options.maxInputBytes !== undefined && (!Number.isSafeInteger(options.maxInputBytes) || (options.maxInputBytes as number) < 1024 * 1024 || (options.maxInputBytes as number) > 16 * 1024 * 1024)) return undefined;
  if (options.raw !== undefined && options.raw !== false) {
    if (options.raw === null || typeof options.raw !== "object" || Array.isArray(options.raw)) return undefined;
    const raw = options.raw as Record<string, unknown>;
    if (Object.keys(raw).some((key) => !["directory", "maxBytes", "ttlMs"].includes(key))) return undefined;
    if (raw.directory !== undefined && (typeof raw.directory !== "string" || !raw.directory.length)) return undefined;
    for (const key of ["maxBytes", "ttlMs"]) if (raw[key] !== undefined && (!Number.isSafeInteger(raw[key]) || (raw[key] as number) <= 0)) return undefined;
  }
  return Object.freeze({ ...options,
    ...(Array.isArray(options.structuredTools) ? { structuredTools: Object.freeze(options.structuredTools.map(({ tool, format }) => Object.freeze({ tool, format }))) } : {}),
    ...(Array.isArray(options.excludeCommands) ? { excludeCommands: Object.freeze([...options.excludeCommands]) } : {}),
    ...(options.raw && typeof options.raw === "object" ? { raw: Object.freeze({ ...options.raw }) } : {}) }) as PluginOptions;
}
