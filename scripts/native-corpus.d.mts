import type { Observation } from "../src/core/types.js";
export interface NativeCorpusCase {
  name: string;
  family: string;
  status: "reduced" | "passthrough";
  scope?: "exact-corpus";
  expected: string;
  provenance: string;
  observation: Observation;
}
export type NativeCorpus = NativeCorpusCase[] & { exactFamilies: string[] };
export function readNativeCorpus(root: string): Promise<NativeCorpus>;
export function assertCorpusCoverage(profiles: readonly { id: string; match: Function; reduce: Function }[], cases: NativeCorpusCase[], exactFamilies?: string[], context?: string): string[];
