# CLI manual

Requires Node 22+, not OpenCode. Install with `npm install -g hugr-lean@0.4.0`, or build the
checkout and run `node dist/cli/index.js`. `tests/cli.test.ts` exercises the compiled entry;
clean-installed package/bin smoke is separate.

```text
hugr-lean filter --command 'cargo build' [--exit-code 0] [--complete] [--terminal-rendered]
hugr-lean filter --format json --exit-code 0 --complete
hugr-lean filter --format accessibility-scope --scope-ref REF --exit-code 0 --complete
hugr-lean recall ID [--lines A-B] [--directory PATH]
hugr-lean raw list [--directory PATH]
hugr-lean raw get ID [--directory PATH]
hugr-lean raw purge [--directory PATH]
hugr-lean doctor
hugr-lean --version
```
- For a source checkout, run `npm run build`, then `node dist/cli/index.js` with these arguments. The manifest declares bin `hugr-lean` at that compiled path; brackets above mark optional arguments.
- `filter` uses conservative core/automatic/structured filtering, never `summarize()`. It creates no
  recovery records and accepts no summarize options. No OpenCode settings are read.
- Shell `filter` requires nonempty `--command COMMAND` and never executes it. Structured mode uses explicit `--format` instead; mixing command/presentation flags refuses. `--scope-ref` is required only for `accessibility-scope`. See [formats and producer contracts](../../docs/STRUCTURED-TOOLS.md). Unknown, duplicate, missing-value, or extra arguments fail; `--exit-code N` accepts decimal nonnegative safe integers only.
- Exit status and completeness default to `unknown`; supply actual `--exit-code N` and `--complete` facts. Only complete exit 0 attempts [core filtering](../core/MANUAL.md); failed/unknown facts pass through.
- `--command` mode without `--terminal-rendered` uses [`filterAutomatic`](../core/automatic.ts) as a native `bash` observation: the legacy registry runs first, then automatic `auto-cli` (ps/ls/ffmpeg), `auto-cdp` and `auto-json` (listed JSON producers) views. Other input streams through unchanged. `--format` remains the advanced explicit structured path; see [automatic native views](../../docs/COVERAGE.md#automatic-native-views).
- Presentation defaults to `unknown`; `--terminal-rendered` explicitly enables conditional SGR handling for admitted grammar. Any CR prevents normalization; there is no redraw collapse.
- stdin is raw bytes. stdout is only the UTF-8 replacement or byte-exact original, without a result envelope or added newline; unsupported grammar, fatal UTF-8 decoding failure, or filtering exceptions retain original bytes. BOMs are not stripped.
- Admission cap is fixed at 4 MiB inclusive. Missing success/completeness streams immediately; exceeding the cap flushes buffered bytes and streams before EOF, preserving all bytes. No limit-override flag exists.
- All raw actions accept optional `--directory PATH`, defaulting to `~/.cache/hugr-lean/raw`; this flag is not accepted by filter, doctor, or version.
- `raw list` writes a JSON array plus LF; entries contain `id`, `createdAt`, and serialized `bytes`. Successful `raw purge` writes nothing and removes validated records, including unexpired ones; unrelated files survive.
- `raw get ID` writes stored text as UTF-8 with no added newline; an empty stored string succeeds. Missing/expired records produce empty stdout, `unavailable\n` on stderr, and exit 2.
- `--version` or `version` writes package version plus LF. `doctor` writes JSON plus LF with `version`, `node`, registry `profiles` IDs, `defaultRawDirectory` and installed `pluginURL`; use that URL in OpenCode config. It performs no host checks or raw-directory creation.
- Process exit 0 means successful command, including filter passthrough for a nonzero observed exit; 1 means argument, I/O, storage, or version failure with an error message plus LF on stderr; 2 is unavailable raw get/recall. Doctor/version reject extra arguments.
- Raw defaults are 64 MiB serialized records and seven-day lazy TTL. Callers must restrict ACLs on every OS; see [raw manual](../raw/MANUAL.md) and [coverage](../../docs/COVERAGE.md) for the implemented-versus-installed evidence boundary.

- `recall ID` prints the stored original, or a 1-based inclusive `A-B`, `A-` or `A` line range.
  The published 0.4.0 footer says `lean recall`; current unreleased source names the actual
  executable `hugr-lean`. Use the
  same custom `--directory` as the writer. Missing, expired or evicted IDs exit 2 with `unavailable`.
  A line slice joins selected LF-delimited lines and is not a byte-range download. Recalling to
  another program or model exposes the returned text there.
