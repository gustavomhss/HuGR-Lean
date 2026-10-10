# Core

Pure, synchronous post-execution filtering, exposed through `hugr-lean/core` in this single TypeScript package.

## Scope
- [engine.ts](engine.ts) validates observations/options, selects one profile, checks evidence, and accepts only smaller UTF-8 output.
- [command.ts](command.ts) recognizes narrow literal invocations; it neither executes nor rewrites commands.
- [normalize.ts](normalize.ts) handles supported SGR only with declared `terminal-rendered` presentation and admitted output grammar.
- Any CR prevents normalization: terminal geometry is unavailable. CRLF source spans remain exact when profiles admit them.
- [lines.ts](lines.ts) provides half-open UTF-16 spans; [types.ts](types.ts) defines the shared observation/reduction/result contract.
- Unknown, failed, incomplete, ambiguous, or invalid processing leaves replacement absent so callers retain original text.
- [structured.ts](structured.ts) exposes explicit `filterStructured` for ten opt-in formats. It uses bounded lexical JSON spans, intact evidence checks and snapshotted execution facts. See [structured tools](../../docs/STRUCTURED-TOOLS.md).

Evidence: [core tests](../../tests/core.test.ts), [command tests](../../tests/command.test.ts), [normalization tests](../../tests/normalize.test.ts), [line tests](../../tests/lines.test.ts).
Read [ownership](OWNERSHIP.md), [maintenance](MAINTENANCE.md), [manual](MANUAL.md), [blast radius](BLAST_RADIUS.md), and [coverage](../../docs/COVERAGE.md).
