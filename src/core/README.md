# Core

Pure, synchronous post-execution filtering, exposed through `hugr-lean/core` in this single TypeScript package.

The core performs no I/O and does not require OpenCode. Its conservative filter APIs and
`summarize()` have different admission and preservation contracts. Neither stores originals
nor registers recovery tools; integrations own those steps.

## Conservative filtering
- [engine.ts](engine.ts) validates observations/options, selects one profile, checks evidence, and accepts only smaller UTF-8 output.
- [command.ts](command.ts) recognizes narrow literal invocations; it neither executes nor rewrites commands.
- [normalize.ts](normalize.ts) handles supported SGR only with declared `terminal-rendered` presentation and admitted output grammar.
- Any CR prevents normalization: terminal geometry is unavailable. CRLF source spans remain exact when profiles admit them.
- [lines.ts](lines.ts) provides half-open UTF-16 spans; [types.ts](types.ts) defines the shared observation/reduction/result contract.
- Unknown, failed, incomplete, ambiguous, or invalid processing leaves replacement absent so callers retain original text.
- [automatic.ts](automatic.ts) exposes default `filterAutomatic` for host-observed native/MCP results: legacy `bash` result first, then the [automatic registry](automatic-registry.ts) (`auto-cli`, `auto-files`, `auto-snapshot`, `auto-cdp`, `auto-json`). [automatic-command.ts](automatic-command.ts) adds literal quoted-argument tokenization; [structured-render.ts](structured-render.ts) is the shared intact-evidence renderer. See [automatic native views](../../docs/COVERAGE.md#automatic-native-views).
- [structured.ts](structured.ts) exposes explicit `filterStructured` for ten opt-in formats. It uses bounded lexical JSON spans, intact evidence checks and snapshotted execution facts. See [structured tools](../../docs/STRUCTURED-TOOLS.md).

## Summarization

- [summarize.ts](summarize.ts) handles large `bash`, supported `read` and `webfetch` text and some
  automatic file views. Unlike the conservative APIs, it can process failed, unknown and
  host-truncated shell output; it cannot recover data already omitted by the host.
- Results distinguish `unchanged`, `rewritten` and `summarized`. A `summarized` replacement must
  not be exposed until the caller stores the original and appends `recoveryLine(id)`.
- Current unreleased source preserves recognized failure continuations across boundaries and
  requires recovery for CR overwrite collapse. Read replacement caps include the host wrapper,
  not recall; an unfit whole row leaves the original unchanged. Direct inputs remain caller-bounded.
- `SummarizeObservation.automatic: false` disables automatic fallback, not summarization.
- Failure recognition is pattern-based. Published 0.4.0 has known cleanup, continuation and cap
  defects; see [delivery limitations](../../docs/DELIVERY.md). Do not infer semantic completeness
  from a smaller result or the status name `rewritten`.

Evidence: [summarize tests](../../tests/summarize.test.ts), [core tests](../../tests/core.test.ts), [command tests](../../tests/command.test.ts), [normalization tests](../../tests/normalize.test.ts), [line tests](../../tests/lines.test.ts).
Read [ownership](OWNERSHIP.md), [maintenance](MAINTENANCE.md), [manual](MANUAL.md), [blast radius](BLAST_RADIUS.md), and [coverage](../../docs/COVERAGE.md).
