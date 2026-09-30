# Core blast radius

## Dependency edges
- Inbound: public [core entry](index.ts), internal [OpenCode adapter](../opencode/index.ts), [type shim](../types.ts), core/profile tests, and [CLI filtering](../cli/MANUAL.md).
- Outbound: [profile registry](../profiles/index.ts), local tokenizer/normalizer/line/types modules, and Node `Buffer.byteLength`; there is no core filesystem or network path.

## Change impact
- Observation/type changes propagate to every reducer and adapter metadata mapping; verify [core](../../tests/core.test.ts), [runners](../../tests/runners.test.ts), [formats](../../tests/formats.test.ts), and [plugin](../../tests/plugin.test.ts) tests.
- Span/rendering changes affect critical identities, summaries, Unicode, order, and formatting; byte-limit changes affect admission and material-raw thresholds downstream.
- Command/normalization changes alter which outputs reach parsers; run [command](../../tests/command.test.ts), [normalize](../../tests/normalize.test.ts), and [lines](../../tests/lines.test.ts) tests, including exact unknown/CR controls.
- `FilterResult` statuses/reasons are public API data; replacement changes reach model-visible text and the adapter's raw-save decision, not native execution.
- No persisted core schema exists; use [maintenance](MAINTENANCE.md) before revising the [public manual](MANUAL.md).
