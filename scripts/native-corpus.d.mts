import type { Observation } from "../src/core/types.js";
export interface NativeCorpusCase {
  name: string;
  family: string;
  status: "reduced" | "passthrough";
  expected: string;
  provenance: string;
  observation: Observation;
}
export function readNativeCorpus(root: string): Promise<NativeCorpusCase[]>;
