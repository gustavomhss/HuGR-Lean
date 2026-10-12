import type { FilterOptions } from "./types.js";
import type { filter } from "./engine.js";
import type { Reduction } from "./types.js";

/** Facts from the host's completed native tool or decoded successful MCP call. */
export interface AutomaticObservation {
  readonly source: "native" | "mcp";
  readonly tool: string;
  readonly output: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly status: "success" | "failure" | "unknown";
  readonly completeness: "complete" | "truncated" | "unknown";
}
export type AutomaticReducer = (observation: AutomaticObservation) => Reduction | undefined;
export interface AutomaticEntry { readonly id: string; readonly reduce: AutomaticReducer }
export type AutomaticFamilyId =
  | "native-glob" | "native-grep" | "native-read-directory"
  | "cli-ps" | "cli-ls" | "cli-json-producers" | "cli-ffmpeg"
  | "mcp-browser-snapshot" | "mcp-devtools-snapshot" | "mcp-cdp-accessibility" | "mcp-json"
  | `legacy:${string}`;
export interface AutomaticFamilyEntry extends AutomaticEntry {
  readonly id: AutomaticFamilyId;
  /** True when evidence such as intermediate progress is intentionally dropped. */
  readonly lossy: boolean;
}
export interface AutomaticOptions extends Pick<FilterOptions, "maxInputBytes"> {
  readonly reducers?: readonly AutomaticEntry[];
  /** Classify before selecting. Omitted enables every family, including legacy shell profiles. */
  readonly enabledFamilies?: readonly AutomaticFamilyId[];
  readonly legacyFilter?: typeof filter;
}
