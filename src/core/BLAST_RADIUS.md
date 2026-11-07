# Core blast radius

## Dependency edges
- Inbound: public [core entry](index.ts), internal [OpenCode adapter](../opencode/index.ts), [type shim](../types.ts), core/profile tests, and [CLI filtering](../cli/MANUAL.md).
- Outbound: [profile registry](../profiles/index.ts), local tokenizer/normalizer/line/types modules, and Node `Buffer.byteLength`; there is no core filesystem or network path.

## Change impact
- Observation/type changes propagate to every reducer and adapter metadata mapping; verify [core](../../tests/core.test.ts), [runners](../../tests/runners.test.ts), [formats](../../tests/formats.test.ts), and [plugin](../../tests/plugin.test.ts) tests.
- Span/rendering changes affect critical identities, summaries, Unicode, order, and formatting; byte-limit changes affect admission and material-raw thresholds downstream.
- Command/normalization changes alter which outputs reach parsers; run [command](../../tests/command.test.ts), [normalize](../../tests/normalize.test.ts), and [lines](../../tests/lines.test.ts) tests, including exact unknown/CR controls.
- `FilterResult` statuses/reasons are public API data; replacement changes reach model-visible text and the adapter's raw-save decision, not native execution.
- Automatic core/registry/renderer changes alter default model-visible text for native `glob`/`grep`/`read`, eligible `bash` and MCP text blocks in the [OpenCode adapter](../opencode/README.md) and CLI command mode; run [automatic core](../../tests/automatic-core.test.ts), [plugin](../../tests/automatic-plugin.test.ts) and `tests/auto-*.test.ts`. Registry order is precedence: specialized first, generic JSON last.
- Summarize statuses, suffix text and byte accounting affect every embedding host, the adapter
  and recall UX. A change can require storage even when the old algorithm called it a rewrite.
  Test failure/unknown exits, CR frames, continuation boundaries, read caps and storage failure.
- No persisted core schema exists; use [maintenance](MAINTENANCE.md) before revising the [public manual](MANUAL.md).
