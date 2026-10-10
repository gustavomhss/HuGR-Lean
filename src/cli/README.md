# CLI

Implemented in `feat/lean-cli@7c6a04f`, integrated at rebuild `795df94`; compiled-entry tests provide source behavior evidence, distinct from clean-installed package/bin proof.

## Scope
- `hugr-lean filter --command COMMAND` accepts optional `--exit-code N`, `--complete`, and `--terminal-rendered`; it reads stdin bytes and writes only replacement or exact passthrough bytes.
- Command mode filters through the automatic pipeline (legacy registry first, then `auto-cli`/`auto-cdp`/`auto-json`) only with `--exit-code 0 --complete`; `--terminal-rendered` uses the legacy registry only and `--format` remains the advanced structured path. No new flag.
- Recovery surface: `hugr-lean raw list`, `hugr-lean raw get ID`, and `hugr-lean raw purge`, each with optional `--directory PATH`.
- `hugr-lean doctor` writes package/node/profile/default-directory JSON; `hugr-lean --version` or `version` writes package version. Neither establishes host compatibility.
- Core owns filtering; RawStore owns persistence. CLI owns user I/O and argument/error reporting; it must not execute or rewrite the observed command.
- Rebuild [package.json](../../package.json) declares bin `dist/cli/index.js`; `src/cli/index.ts` and `tests/cli.test.ts` define the implemented interface and compiled-source evidence.

Read [ownership](OWNERSHIP.md), [maintenance](MAINTENANCE.md), [manual](MANUAL.md), [blast radius](BLAST_RADIUS.md), and [coverage](../../docs/COVERAGE.md).
