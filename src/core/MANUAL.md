# Core manual

```ts
import { filter, type Observation } from "hugr-lean/core";
const observation: Observation = {
  source: "shell", command: "cargo test", output: capturedText,
  termination: { kind: "exited", code: 0 },
  completeness: "complete", presentation: "unknown",
};
const result = filter(observation);
const text = "replacement" in result ? result.replacement : observation.output;
```
- `filter(observation, options = {})` is synchronous; supply actual execution facts, never infer success from text.
- `maxInputBytes` defaults to 4 MiB; safe integers from 1–16 MiB inclusive are valid. Larger input passes through; invalid options fail open.
- `profiles` defaults to the internal registry; callers may supply a readonly `Profile[]`. Overlapping matches fail open before reduction.
- `getProfiles()` returns a fresh frozen array of detached frozen built-in records; their `match` and `reduce` functions are the actual registry functions. Hosts may select records without mutating defaults.
- `tokenizeCommand(command)` exposes the existing narrow literal invocation grammar: frozen argv or `undefined`. It neither parses general shell syntax nor rewrites commands. Check uniqueness against all built-ins before applying host enable/disable settings.
- `reduced` returns `replacement`, `profile`, byte metrics, and reason; `normalized` returns a smaller admitted SGR baseline without a profile field.
- `passthrough` and `failed_open` return metrics/reason without replacement. Core catches malformed input and parser errors; the caller keeps its original.
- `Observation` also permits source `other`, termination `unknown`/`timed_out`, completeness `unknown`/`truncated`, and presentation `terminal-rendered`; only complete shell exit 0 qualifies.
- A `Profile` supplies `id`, `match(argv)`, and `reduce(output, observation)`: return `undefined` to decline, or ordered `pieces` and nonempty ordered `required` spans.
- Spans are nonempty half-open UTF-16 indices, without split surrogate pairs, overlap, or reordered evidence; required spans must be emitted intact.
- Fixed text vocabulary is only `""`, `" "`, `"\n"`, `":\n"`, `"- "`, `"+ "`. All other content is source-backed; final acceptance uses UTF-8 bytes.
- Reasons include `input_limit`, `incomplete_observation`, `nonzero_exit`, `unsupported_command`, `no_profile`, `unsupported_output`, `not_smaller`, and validation/profile failures; see [engine](engine.ts) and [tests](../../tests/core.test.ts).
