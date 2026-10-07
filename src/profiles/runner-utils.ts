import type { Line, Observation, Profile, Reduction } from "../core/types.js";

export type Parser = (output: string) => Reduction | undefined;

export function uint(value: string | undefined): number | undefined {
  if (value === undefined || !/^(?:0|[1-9]\d*)$/.test(value)) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
}

export function reduction(kept: readonly Line[]): Reduction {
  const spans = kept.map((line) => line.span);
  return { pieces: spans, required: spans };
}

export function blankEnd(rows: readonly Line[], start: number): boolean {
  return rows.slice(start).every((line) => line.text === "");
}

export function nativeProfile(id: string, match: Profile["match"], parse: Parser): Profile {
  return {
    id, match,
    reduce(output: string, observation: Observation) {
      if (observation.source !== "shell" || observation.completeness !== "complete" ||
          observation.termination.kind !== "exited" || observation.termination.code !== 0 ||
          /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]|\r(?!\n)/.test(output)) return undefined;
      return parse(output);
    },
  };
}
