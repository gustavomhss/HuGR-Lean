# OpenCode adapter

The package root and `hugr-lean/server` expose the default OpenCode plugin.
[index.ts](index.ts) maps the legacy post-execution hook into the pure core. The CLI and
`hugr-lean/core`/`hugr-lean/raw` remain usable without this adapter or OpenCode.

## Scope

- `tool.execute.after` may change model-visible native `output.output` or eligible MCP
  `output.content` text blocks. Native command, title, attachments, metadata and raw preview
  remain host-owned; commands are never executed or rewritten by the plugin.
- [config.ts](config.ts) validates options. `enabled`, `automatic` and summarize mode are on by
  default; invalid plugin options yield no hooks.
- `mode: "lossless"` uses conservative profile/automatic/structured filtering. Failed, unknown,
  timed-out or incomplete native shell observations retain the original. Storage is off unless
  explicitly configured, and material-save thresholds apply.
- Default `mode: "summarize"` runs that pipeline first, then summarizes eligible `bash`, `read`
  and `webfetch` text. It can process failed/unknown and host-truncated shell observations; this
  is not the conservative filter contract. Explicit structured-tool bindings are not summarized.
- Current unreleased source checks `maxInputBytes` before every native string path, including
  summarization and raw saves. Oversized text stays exact; MCP retains its aggregate text cap.
  Summarizer automatic fallback is disabled after the adapter's own pipeline.
- Summarize mode stores originals before emitting lossy summaries and registers `lean_recall`.
  `raw: false` disables storage and lossy summaries, but not other rewrites. Published 0.4.0 has
  known destructive-cleanup/continuation defects; see [delivery limitations](../../docs/DELIVERY.md).
- Automatic native/MCP views and explicit `structuredTools` bindings have their own producer and
  metadata requirements. See [manual](MANUAL.md) and [structured schemas](../../docs/STRUCTURED-TOOLS.md).

Recorded real-host evidence is OpenCode 1.18.17 on macOS, not every host/version/platform.
Package CI tests the package and mock harness, not installed OpenCode. See
[boundary proof](../../docs/OPENCODE.md), [plugin tests](../../tests/plugin.test.ts) and
[boundary tests](../../tests/opencode-boundary.test.ts).

Read [ownership](OWNERSHIP.md), [maintenance](MAINTENANCE.md), [blast radius](BLAST_RADIUS.md)
and [privacy/storage boundaries](../../SECURITY.md).
