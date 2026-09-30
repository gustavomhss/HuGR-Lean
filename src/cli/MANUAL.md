# CLI manual

Implementation: `feat/lean-cli@7c6a04f`, integrated in rebuild `795df94`; `tests/cli.test.ts` exercises the compiled entry. Clean-installed package/bin proof is separate.

```text
hugr-lean filter --command 'cargo build' [--exit-code 0] [--complete] [--terminal-rendered]
hugr-lean raw list [--directory PATH]
hugr-lean raw get ID [--directory PATH]
hugr-lean raw purge [--directory PATH]
hugr-lean doctor
hugr-lean --version
```
- On the integrated rebuild, run `npm run build`, then `node dist/cli/index.js` with these arguments. The manifest declares bin `hugr-lean` at that compiled path; brackets above mark optional arguments.
- `filter` requires nonempty `--command COMMAND` and never executes it. Unknown, duplicate, missing-value, or extra arguments fail; `--exit-code N` accepts decimal nonnegative safe integers only.
- Exit status and completeness default to `unknown`; supply actual `--exit-code N` and `--complete` facts. Only complete exit 0 attempts [core filtering](../core/MANUAL.md); failed/unknown facts pass through.
- Presentation defaults to `unknown`; `--terminal-rendered` explicitly enables conditional SGR handling for admitted grammar. Any CR prevents normalization; there is no redraw collapse.
- stdin is raw bytes. stdout is only the UTF-8 replacement or byte-exact original, without a result envelope or added newline; unsupported grammar, fatal UTF-8 decoding failure, or filtering exceptions retain original bytes. BOMs are not stripped.
- Admission cap is fixed at 4 MiB inclusive. Missing success/completeness streams immediately; exceeding the cap flushes buffered bytes and streams before EOF, preserving all bytes. No limit-override flag exists.
- All raw actions accept optional `--directory PATH`, defaulting to `~/.cache/hugr-lean/raw`; this flag is not accepted by filter, doctor, or version.
- `raw list` writes a JSON array plus LF; entries contain `id`, `createdAt`, and serialized `bytes`. Successful `raw purge` writes nothing and removes validated records, including unexpired ones; unrelated files survive.
- `raw get ID` writes stored text as UTF-8 with no added newline; an empty stored string succeeds. Missing/expired records produce empty stdout, `unavailable\n` on stderr, and exit 2.
- `--version` or `version` writes package version plus LF. `doctor` writes JSON plus LF with `version`, `node`, registry `profiles` IDs (including the `tsc` stub), `defaultRawDirectory` and installed `pluginURL`; use that URL in OpenCode config. It performs no host checks or raw-directory creation.
- Process exit 0 means successful command, including filter passthrough for a nonzero observed exit; 1 means argument, I/O, storage, or version failure with an error message plus LF on stderr; 2 is unavailable raw get. Doctor/version reject extra arguments.
- Raw defaults/guarantees remain 64 MiB serialized records, seven-day lazy TTL, and caller-restricted ACLs on every OS; see [raw manual](../raw/MANUAL.md) and [coverage](../../docs/COVERAGE.md) for the implemented-versus-installed evidence boundary.
