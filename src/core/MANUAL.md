# Core manual

Requires Node 22+, not OpenCode. Install `hugr-lean` and import from `hugr-lean/core`;
the package root exports the OpenCode plugin instead. All functions below are pure and
synchronous. `RawStore` is a separate I/O API.

## Conservative filtering

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
- `filterAutomatic(observation, options = {})` takes `AutomaticObservation` `{ source: "native"|"mcp", tool, output, args, metadata, status, completeness }`; only `status: "success"` with `completeness: "complete"` is eligible. Options: `maxInputBytes` (same bounds), `reducers` (default automatic registry), `legacyFilter` (default `filter`).
- Observation fields are read once into frozen copies; reducers see only that snapshot. Metadata with `truncated` present and not `false`, or `exit` present and not `0`, returns `contradictory_tool_facts`. Native `bash` also needs `exit === 0`, `truncated === false` and a string `args.command` (`missing_shell_facts`); any legacy result other than `no_profile`/`unsupported_command` passthrough is returned, and a legacy-matched argv is never re-admitted.
- Automatic results are `reduced` with `profile` set to the reducer ID and reason `automatic_native_view`; otherwise `unsupported_or_not_smaller`, `incomplete_or_failed_tool`, `input_limit`, or `failed_open` `invalid_automatic_input_or_reduction`. The shared renderer reads `pieces`/`required`/`text` once and adds fixed tokens such as `\t`, `,`, brackets, `"columns":`, `"rows":`, `"cellEncoding":"optional"` and `text` to the vocabulary.
- Reasons include `input_limit`, `incomplete_observation`, `nonzero_exit`, `unsupported_command`, `no_profile`, `unsupported_output`, `not_smaller`, and validation/profile failures; see [engine](engine.ts) and [tests](../../tests/core.test.ts).

## `summarize(observation, options?)`

The contract below describes the current **unreleased source**. Published 0.4.0 differs in the
cleanup, continuation, read-cap and recovery-footer cases noted below.

`observation` is `{ tool, output, args?, metadata?, automatic? }`. Unlike the conservative APIs above,
summarization does not require a complete successful shell observation. It can process compound
commands, unknown/nonzero exits and host-truncated output, but sees only the host-captured text.
It is pattern-based, not a semantic proof that every important diagnostic survives.

Returns `{ status, reason, inputBytes, outputBytes }` and a `replacement` unless `unchanged`:

- `unchanged`: retain the original text. Invalid input/options, exceptions or a result that is
  not strictly smaller fall back without replacement.
- `rewritten`: presentation/content compaction without a recovery suffix. Normalization is not
  byte-exact preservation. Current source uses this for ANSI/CRLF normalization, repeated-line
  marking and other non-summary views. Destructive CR overwrite collapse instead requires
  `summarized`. Published 0.4.0 misclassified that collapse; see
  [published-artifact limitations](../../docs/DELIVERY.md).
- `summarized`: lossy. `replacement` does not include a recovery suffix; `outputBytes` already
  reserves `recoveryLine(id)` using a 32-hex ID. Store the complete original first, append the
  suffix exactly once and provide a recovery path. Current `recoveryLine(id)` yields
  `\n[full output: hugr-lean recall <id>]`. The core does none of this I/O.

Options default to `shellThresholdBytes: 4096`, `headBytes: 1536`, `tailBytes: 1536`,
`errorBytes: 4096`, `readCapBytes: 8192`, `webfetchCapBytes: 8192`, `readLineNumbers: false`.
These are UTF-8 bytes, not tokens. They are not a global input/memory limit. Direct `summarize()`
has no `maxInputBytes` option: the caller must enforce an input limit before calling it. The
OpenCode adapter's input ceiling does not automatically apply to standalone core imports.

- Shell: head/tail plus failure-pattern and continuation lines, with markers for omitted runs.
  Exit other than numeric `0` is treated as failed/unknown; recognized failure blocks then bypass
  the error budget. Scanning covers the whole output, including head/tail boundaries, with no
  continuation length cap. For failed/unknown exits, every contiguous recognized indented/stack
  continuation is retained, even if it resembles test-success output. This may leave larger summaries or no reduction.
  Exit 0 still budgets failure blocks and remaining warnings. Unrecognized diagnostic text is
  not guaranteed to survive, and this is not byte-exact output preservation.
- Shell cleanup: after ANSI normalization, failed/unknown commands or recognized failure terms
  anywhere in the output prevent CR frame collapse. Other exit-0 overwrite collapse requires
  recovery even below `shellThresholdBytes`; that threshold controls head/tail shortening only.
  The published 0.4.0 algorithm had destructive cleanup, a 40-line continuation limit and
  boundary bugs; its absolute failure-preservation claim is not reliable.
- Read: recognizes the host `<path>…<type>file</type><content>` wrapper, positive safe consecutive
  `N: ` rows and a supported host footer. Replacements fit `readCapBytes` including the wrapper,
  complete rows, continuation footer and mandatory trailing suffix, but excluding the recovery
  line. If no complete row fits, or no smaller valid view exists, return `unchanged` (including
  `read_cap_unsatisfiable`); an unchanged original may exceed the cap. Summaries give the next
  `offset`; `readLineNumbers: true` retains prefixes. Published 0.4.0 lacked this exact sizing.
- Webfetch: takes a prefix within the content budget, then adds a cap marker and recovery suffix.
  The complete returned text can therefore exceed `webfetchCapBytes`.
- `grep`, `glob` and directory `read` views use the automatic pipeline when applicable unless
  the **observation** has `automatic: false`. This flag is not a `SummarizeOptions` field and
  does not disable shell/read/webfetch summarization itself. The adapter sets it after running
  its own conservative pipeline so fallback cannot bypass its automatic settings/limits.

### Host-independent storage/recovery integration

This example adds recovery to `summarize()`; it is not an integration with a specific agent.
It retains the original on storage failure, but cannot fix published 0.4.0's misclassified
`rewritten` results. Use the conservative filters when that release's preservation limits are
unacceptable.

```ts
import { summarize, recoveryLine, type SummarizeObservation } from "hugr-lean/core";
import { RawStore } from "hugr-lean/raw";

const store = new RawStore(); // Dedicated local store; no eviction unless requested.

async function modelText(observation: SummarizeObservation): Promise<string> {
  if (Buffer.byteLength(observation.output, "utf8") > 4 * 1024 * 1024) {
    return observation.output; // Caller-owned bound, before parsing or storage.
  }
  const result = summarize(observation);
  if (result.status === "unchanged") return observation.output;
  if (result.status === "rewritten") return result.replacement;
  try {
    const id = await store.put(observation.output);
    return result.replacement + recoveryLine(id);
  } catch {
    return observation.output;
  }
}
```

Your host must implement recall with `store.get(id)` (and optionally `recallLines`) or make the
CLI available against the same directory. The plugin's `lean_recall` tool is not registered by
importing the core. IDs can expire or be evicted; no persistent archive is promised. Recalled
text reaches whichever model/program receives it, so apply the host's access and privacy policy.
