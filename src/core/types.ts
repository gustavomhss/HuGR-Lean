export interface Observation {
  readonly source: "shell" | "other";
  readonly command: string;
  readonly output: string;
  readonly termination: { readonly kind: "exited"; readonly code: number } | { readonly kind: "unknown" | "timed_out" };
  readonly completeness: "complete" | "truncated" | "unknown";
  readonly presentation: "unknown" | "terminal-rendered";
}

/** Half-open JavaScript string offsets, never UTF-8 byte offsets. */
export type Span = readonly [number, number];
/** Dynamic content must be a source span. Text pieces are fixed formatting only. */
export type Piece = Span | { readonly text: string };
export interface Reduction {
  readonly pieces: readonly Piece[];
  readonly required: readonly Span[];
}
export interface Profile {
  readonly id: string;
  readonly match: (argv: readonly string[]) => boolean;
  readonly reduce: (output: string, observation: Observation) => Reduction | undefined;
}
export interface FilterOptions {
  readonly maxInputBytes?: number;
  readonly profiles?: readonly Profile[];
}
export type FilterResult = {
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly reason: string;
} & (
  | { readonly status: "reduced" | "normalized"; readonly replacement: string; readonly profile?: string }
  | { readonly status: "passthrough" | "failed_open" }
);
export interface Line { readonly text: string; readonly span: Span }
