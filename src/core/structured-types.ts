import type { Observation, Reduction } from "./types.js";

export const structuredFormats = Object.freeze(["json", "table", "progress", "processes", "files", "windows", "events", "accessibility", "accessibility-properties", "accessibility-scope"] as const);
export type StructuredFormat = typeof structuredFormats[number];
export interface StructuredObservation {
  readonly format: StructuredFormat;
  readonly output: string;
  readonly termination: Observation["termination"];
  readonly completeness: Observation["completeness"];
  readonly scopeRef?: string;
}
export type StructuredReducer = (output: string, observation: StructuredObservation) => Reduction | undefined;
export interface StructuredFilterOptions {
  readonly maxInputBytes?: number;
  /** Explicit reducer injection for conformance tests or caller-owned formats. */
  readonly reducers?: Partial<Record<StructuredFormat, StructuredReducer>>;
}
