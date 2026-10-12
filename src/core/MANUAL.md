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
- `reduced` returns `replacement`, `profile`, byte metrics, and reason; `normalized` returns a smaller admitted SGR baseline without a profile field.
- `passthrough` and `failed_open` return metrics/reason without replacement. Core catches malformed input and parser errors; the caller keeps its original.
- `Observation` also permits source `other`, termination `unknown`/`timed_out`, completeness `unknown`/`truncated`, and presentation `terminal-rendered`; only complete shell exit 0 qualifies.
- A `Profile` supplies `id`, `match(argv)`, and `reduce(output, observation)`: return `undefined` to decline, or ordered `pieces` and nonempty ordered `required` spans.
- Spans are nonempty half-open UTF-16 indices, without split surrogate pairs, overlap, or reordered evidence; required spans must be emitted intact.
- Fixed text vocabulary is only `""`, `" "`, `"\n"`, `":\n"`, `"- "`, `"+ "`. All other content is source-backed; final acceptance uses UTF-8 bytes.
- `filterAutomatic(observation, options = {})` takes `AutomaticObservation` `{ source: "native"|"mcp", tool, output, args, metadata, status, completeness }`; only `status: "success"` with `completeness: "complete"` is eligible. Options: `maxInputBytes` (same bounds), `reducers` (default automatic registry), `legacyFilter` (default `filter`), `enabledFamilies` (optional allowlist including `legacy:<profile-id>`).
- Observation fields are read once into frozen copies; reducers see only that snapshot. Metadata with `truncated` present and not `false`, or `exit` present and not `0`, returns `contradictory_tool_facts`. Native `bash` also needs `exit === 0`, `truncated === false` and a string `args.command` (`missing_shell_facts`); any legacy result other than `no_profile`/`unsupported_command` passthrough is returned, and a recognized legacy family is terminal even when disabled or the injected legacy filter returns `no_profile`.
- Classify before settings with `classifyAutomatic`; select public `automaticReducers` leaf entries by stable ID. Disabled families never reach broader reducers. See the complete [host integration contract](../../docs/HOST-INTEGRATION.md).
- `filterAutomaticMcp({ tool, args }, decoded, options)` returns aggregate `result`, text `blocks` attribution, validated `originalText` and candidate `content` only on reduction. Packet validation, homogeneous classification, rollback and host commit responsibilities are described in [host integration](../../docs/HOST-INTEGRATION.md).
- Automatic results are `reduced` with `profile` set to the reducer ID and reason `automatic_native_view`; otherwise `unsupported_or_not_smaller`, `incomplete_or_failed_tool`, `input_limit`, or `failed_open` `invalid_automatic_input_or_reduction`. The shared renderer reads `pieces`/`required`/`text` once and adds fixed tokens such as `\t`, `,`, brackets, `"columns":`, `"rows":`, `"cellEncoding":"optional"` and `text` to the vocabulary.
- Reasons include `input_limit`, `incomplete_observation`, `nonzero_exit`, `unsupported_command`, `no_profile`, `unsupported_output`, `not_smaller`, and validation/profile failures; see [engine](engine.ts) and [tests](../../tests/core.test.ts).
