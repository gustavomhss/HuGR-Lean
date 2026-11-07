# OpenCode manual

Install the published package with `"plugin": ["hugr-lean@0.4.0"]` in `opencode.json`, or use
a built plugin file URL as below, then quit/restart OpenCode. This example deliberately selects
the conservative lossless mode and disables storage:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [["file:///absolute/path/to/hugr-lean/dist/index.js", {
    "mode": "lossless", "enabled": true, "excludeCommands": ["git"], "raw": false
  }]]
}
```
- Build locally with `npm ci && npm run build`; [package.json](../../package.json) requires Node >=22. The root exports only the default plugin; libraries use `hugr-lean/core` and `hugr-lean/raw`.
- `default plugin(context, options?)` resolves to hook records; valid defaults register `tool.execute.after`, invalid options/setup failures resolve to `{}`.
- Internal `createAfterHook(options = {}, dependencies = {})` returns `(input, output) => Promise<void>`; dependency injection is for tests, not a root named export.
- `enabled` defaults true. `excludeCommands` defaults empty; leading whitespace is ignored for matching, then an exact literal or prefix followed by ASCII space/tab excludes the call. Matching does not change the executed command; it is not a glob, regex, or path resolver.
- `maxInputBytes` defaults to 4 MiB and accepts safe integers from 1–16 MiB inclusive. In the
  current unreleased source, every native string is measured in UTF-8 before any filtering,
  summarization or storage. Input above the limit remains exact, including supported structured
  bindings; equality is admitted. MCP retains the aggregate text cap described below. This is
  an adapter boundary, not a memory guarantee for the host or standalone `summarize()`.
  Invalid option keys/types disable plugin hook creation.
- `raw` is off by default only in lossless mode. Summarize mode enables a store by default.
  Use `false` or `{ directory?, maxBytes?, ttlMs?, evict? }`, not `true`. `evict` defaults to true
  in summarize mode and false for direct/lossless stores. See [raw manual](../raw/MANUAL.md).
- In the conservative pipeline, an explicitly configured raw save occurs before replacement only
  when both saved UTF-8 bytes `>= 1024` and saved fraction `>= 0.10`; smaller changes can reduce
  without saving. That save alone does not append an ID. Lossy summaries always require a save
  and recovery suffix, regardless of these material-change thresholds.
- Command is `input.args.command` for `input.tool === "bash"`; safe-integer nonnegative `metadata.exit` is an exit fact, and only `metadata.truncated === false` means complete.
- The conservative pipeline keeps presentation `unknown`; invalid/missing facts and nonzero exits preserve text through its filters. Do not use `metadata.output` preview or saved truncation paths to infer completeness.
- Replacement must be nonempty, strictly smaller, and have matching UTF-8 metrics; reduced results need a profile ID. Exceptions, including required raw-save failure, retain original text; concurrent text changes are not overwritten.
- In the conservative pipeline, `automatic` defaults true; non-boolean values disable hook creation. Only native `glob`/`grep`/`read` (other native tools are not routed) need `metadata.truncated === false`; a `structuredTools` binding for the same tool takes precedence. `bash` tries automatic views only after the legacy result is `no_profile`/`unsupported_command` passthrough with `exit === 0` and `truncated === false`; `excludeCommands` still applies.
- Hook inputs (`output.output`, `tool`, `args`, `metadata`) are read once into frozen copies before any decision. Native replacement is written only if `output.output` is still the original string.
- MCP: when `output.output` is not a string, `content[]` is validated whole before parsing: `isError` absent or `false`, metadata/`_meta` without truncation or nonzero exit, 1–64 well-formed blocks, no `resource.blob`, total text plus `resource.text` (joined with two LF) at most `maxInputBytes`; error/clipping text refuses the packet. Each text block is filtered independently; the raw save captures the host-joined text. After the save the live packet is revalidated (same array, block identities, texts, tool and arguments) and `output.content` is replaced in one assignment; `structuredContent`, non-text blocks and annotations stay.
- Disable with `enabled: false` or remove the plugin entry, then restart. Upgrade by replacing the compiled build and restarting; remove the entry before removing installed files.
- Host compatibility evidence is [OpenCode 1.18.17 legacy CLI/macOS x86_64](../../docs/OPENCODE.md); the separate V2 route and broad package-install compatibility are not established by these module docs.

## Summarize mode (0.4.0 default)

- `mode` is `"summarize"` (default) or `"lossless"`. The conservative admission rules above do not
  gate summarization: failed/unknown and host-truncated shell output can also be summarized.
  Recovery contains only what the host captured. Failure detection is text-pattern based.
- In summarize mode the conservative pipeline above runs first; then `bash`, `read` and
  `webfetch` text goes through `summarize()` with the `summarize` options (unknown keys or
  negative numbers disable hook creation). Current source passes observation `automatic: false`
  because its automatic pipeline has already run. Structured-tool bindings are never summarized.
- A result classified as a lossy summary first stores the complete original (before any rewrite)
  in a `RawStore` (`evict: true` unless overridden), then appends `recoveryLine(id)`. If storage
  fails, the previous text stays. `raw: false` disables storage and lossy summaries. Published
  0.4.0 incorrectly classifies destructive CR cleanup as `rewritten`, with no required recovery.
  Its footer names `lean recall`; current unreleased source correctly emits
  `[full output: hugr-lean recall <id>]` and requires recovery for overwrite collapse. The actual
  model tool remains `lean_recall`.
- When summaries can be recovered, the plugin also returns `tool: { lean_recall }`. Its args are legacy JSON-schema properties `id` and `lines` (`""` for the whole output, or `A-B`, `A-`, `A`); it returns the exact stored text or a line slice, or `unavailable: ...` for an expired/evicted id. The host may truncate a very large recall; use `lines` then.

- The default store is plaintext local storage. It can expire/evict earlier IDs, and `lean_recall`
  exposes retrieved text to OpenCode's normal model flow. No network I/O in this package is not
  a promise that the host sends nothing. See [security guidance](../../SECURITY.md).
- Published 0.4.0's automatic fallback from `summarize()` can bypass `automatic: false` or
  automatic input admission limits for file views. Do not rely on that release's option as a
  complete summarize-mode control; the conservative lossless mode is separate. Current unreleased
  source disables that fallback and checks the native input ceiling before either pipeline.
- Current-source read budgets include the host wrapper and mandatory suffix, exclude recall, and
  preserve the original if no complete row fits. Webfetch uses a content budget plus marker/recall
  overhead. Neither is a strict final model-message cap; see [core manual](../core/MANUAL.md).
