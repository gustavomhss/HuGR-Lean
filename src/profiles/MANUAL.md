# Profile manual

`profiles`, `runnerProfiles`, and `formatProfiles` are internal readonly arrays, not package subpath exports. Consumers use `filter` from `hugr-lean/core`.
Each entry implements `match(argv): boolean` and `reduce(output, observation): Reduction | undefined`; core resolves identity and validates/renders the result.

| ID | Invocation and entire admitted success grammar | Retained evidence / permitted change |
| --- | --- | --- |
| `cargo-test` | `cargo test`, optional single `--lib` and `--color never`/`--color=never` in either order; unoptimized finish in seconds/minutes, sequential unique executable/integration/doctest contexts, suite-local totals | Finished, every Running/Doc-tests context, summaries, ignored names/reasons; delete compilation and passing progress |
| `cargo-build` | `cargo build`, same color options but no `--lib`; compilation rows then one unoptimized dev finish, seconds/minutes | Exact Finished summary; delete compilation rows |
| `pytest` | `pytest`, `python -m pytest` or `python3 -m pytest`; optional single `-q`, `--color=no`, `--doctest-modules`, literal relative paths; default banner pytest 9.0.3/pluggy 1.6.0; closed wrapped/quiet progress and totals | Default platform/root/config; summary; skips/subtests with filename context where present; full admitted UserWarning/short-summary sections; delete fully passing progress and session/collection presentation |
| `go-test-verbose` | `go test -v`, optional `.` or `./...`; sequential flat RUN/PASS/SKIP pairs across unique packages, timed or `(cached)` summaries, optional no-test rows | Skip and source-bound diagnostic RUN/result envelopes, native PASS/package summaries and no-test rows; delete silent passing pairs, never synthesize totals |
| `node-test` | `node --test` or `tsx --test`; optional single `--test-reporter=tap`, positive `--test-concurrency=N` before literal paths; complete TAP 13 with flat/nested test scopes through depth 32 | Version, all plans and native footer, parent envelopes, skip/TODO/diagnostic blocks and ancestors; delete only silent passing leaf header/result/YAML progress |
| `jest` | Direct or explicit `npx` Jest; plain human PASS suites, uniformly verbose/nonverbose, valid describe depth and successful consistent totals | Suite paths, describe/test bodies including timings, summaries; replace known PASS/check prefixes with fixed `+ `/`- ` |
| `vitest` | Direct or explicit `npx` Vitest; plain human passing file rows, optional RUN banner, consistent totals, clock/duration and known stages | Banner, paths/pass markers/counts, summaries and aggregate timings; omit only delimited per-file timings |
| `git-status` | English human long `git status`; ordered known sections/state, unquoted restricted paths and native labels | Branch/tracking/merge/conflicts, entries/renames/submodules/blank lines; delete only enumerated context-valid advice |
| `rg` | Explicit `-n`/`--line-number` with known options; only unambiguous `file:positive-line:content` records | Exact match order/multiplicity and line/content/endings; group only consecutive equal full paths under a source-backed header |
| `tsc` | Direct or explicit `npx tsc` identity | Always `undefined`; all diagnostics remain exact, including multiline/pretty variants |

Explicit `npx TOOL`/`npx --no-install TOOL` applies to format profiles, not runner profiles; executable paths, npm-script inference, and custom Jest/Vitest reporters decline.
All reducers require complete shell exit 0 and plain LF/CRLF input. Unsupported controls, warnings/logs, unknown rows and inconsistent summaries preserve the whole output; SGR handling is conditional in [core](../core/MANUAL.md).
Cargo warnings/failures, Go subtests/parallel or unbound logs, arbitrary pytest plugins/warnings, custom Node reporters/suite YAML/failures, and Jest/Vitest skipped/todo/failed reports remain outside admission.

Cargo uses streaming line iteration and validates each suite separately. `--lib` requires exactly one `unittests src/lib.rs` context; doctest records must include source/line context. Native capture includes `2m 01s`; the deliberate 61-second build delay is outside filter latency.
Go diagnostic admission requires a native `.go:positive-line:` row with supported indented continuations. Skips and diagnostics retain enclosing RUN/result rows; duplicate package identities and no-test-only output decline.
Pytest default progress requires a filename before wrapped continuations and validates parent-based percentages. Quiet mode admits only the closed `.`, `s`, `u`, `-` variants with reconciled built-in subtest counts. UserWarning source/context/Docs rows and supported skip reasons remain exact; quiet output has no version banner, so receipt versions are evidence, not runtime detection.
Node captures use Node 22.17.1/tsx 4.23.15 default non-TTY TAP. Every YAML block must contain only native duration and `type: 'test'`; footer requires suites/fail/cancelled 0 with consistent test/pass/skip/todo counts. Supported diagnostics are same-scope comments immediately after YAML; their blocks and ancestor envelopes remain source-backed. Unsupported placement preserves everything.

Shell globs, environment assignments, pipelines, compound commands and npm-script child identity are not inferred. Reporter/concurrency/quoting replay controls are supplemental format tests, not extra native executions.
Git requires a native footer for ordinary unstaged/untracked-only output; complete staged or explicit merge variants may end after entries. Quoting/escapes/localization/porcelain/rebase advice decline.
Ripgrep numeric-only/colon-bearing/Windows-drive paths, columns, context/headings, or ambiguous numeric content delimiters decline; ordinary content colons remain valid.
Exact grammar/provenance and evidence witnesses: [runners](../../fixtures/runners/SOURCES.md), [formats](../../fixtures/formats/SOURCES.md), [runner tests](../../tests/runners.test.ts), [format tests](../../tests/formats.test.ts).
