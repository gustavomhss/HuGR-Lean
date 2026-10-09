# Profile manual

`profiles`, `runnerProfiles`, and `formatProfiles` are internal readonly arrays, not package subpath exports. Consumers use `filter` from `hugr-lean/core`.
Each entry implements `match(argv): boolean` and `reduce(output, observation): Reduction | undefined`; core resolves identity and validates/renders the result.

| ID | Invocation and entire admitted success grammar | Retained evidence / permitted change |
| --- | --- | --- |
| `cargo-test` | `cargo test`, optional `--color never`/`--color=never`; modern unoptimized test finish, one executable, one flat consistent libtest suite | Finished/Running rows, native final summary, ignored names/reasons; delete compilation and passing progress |
| `cargo-build` | `cargo build`, same color options; compilation rows then one modern unoptimized dev finish | Exact Finished summary; delete compilation rows |
| `pytest` | `pytest`, `python -m pytest` or `python3 -m pytest`, optional `--color=no`; pytest 9.0.3/pluggy 1.6.0 default plugin-free banner, root/config, collection, unwrapped dot/skip rows, consistent summary | Platform/root/config, final summary, every mixed skipped-file row; delete fully passing rows and session/collection presentation |
| `go-test-verbose` | `go test -v`, optional `.`; one package, unique sequential flat RUN/PASS or RUN/SKIP pairs, PASS, timed package summary | Skip RUN/SKIP pairs, native PASS/summary; delete passing pairs, never synthesize counts |
| `jest` | Direct or explicit `npx` Jest; plain human PASS suites, uniformly verbose/nonverbose, valid describe depth and successful consistent totals | Suite paths, describe/test bodies including timings, summaries; replace known PASS/check prefixes with fixed `+ `/`- ` |
| `vitest` | Direct or explicit `npx` Vitest; existing plain passing grammar validates, but does not reduce | Every source row, including per-file timings, blanks, banner and summaries; configured reporters can emit identical user evidence. Plain output stays exact (`not_smaller`); core-owned safe presentation normalization remains possible |
| `git-status` | English human long `git status`; ordered known sections/state, unquoted restricted paths and native labels | Branch/tracking/merge/conflicts, entries/renames/submodules/blank lines; delete only enumerated context-valid advice |
| `rg` | Explicit `-n`/`--line-number` with known options; only unambiguous `file:positive-line:content` records | Exact match order/multiplicity and line/content/endings; group only consecutive equal full paths under a source-backed header |
| `tsc` | Direct or explicit `npx tsc` identity | Always `undefined`; all diagnostics remain exact, including multiline/pretty variants |

Explicit `npx TOOL`/`npx --no-install TOOL` applies to format profiles, not runner profiles; executable paths, npm-script inference, and custom Jest/Vitest reporters decline.
All reducers require complete shell exit 0 and plain LF/CRLF input. Raw controls, warnings, user logs, unknown rows, and inconsistent summaries decline; SGR handling is conditional in [core](../core/MANUAL.md).
Cargo doc-tests/multiple executables, Go logs/subtests/parallel/cached output, pytest plugins/wrapped progress, and Jest/Vitest skipped/todo/failed reports are outside admission.
Git requires a native footer for ordinary unstaged/untracked-only output; complete staged or explicit merge variants may end after entries. Quoting/escapes/localization/porcelain/rebase advice decline.
Ripgrep numeric-only/colon-bearing/Windows-drive paths, columns, context/headings, or ambiguous numeric content delimiters decline; ordinary content colons remain valid.
Exact grammar/provenance and evidence witnesses: [runners](../../fixtures/runners/SOURCES.md), [formats](../../fixtures/formats/SOURCES.md), [runner tests](../../tests/runners.test.ts), [format tests](../../tests/formats.test.ts).
