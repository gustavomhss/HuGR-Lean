# L04: golangci-lint capture-only packet

Baseline `71bcaea`; branch `campaign/native-v2/L04`. Scope: this directory only.
Producer: existing golangci-lint 2.11.4, built with go1.26.1, commit
`8f3b0c7ed018e57905fbd873c697e0b1ede605a5`. Native execution uses Go 1.27.1,
dependency-free modules declaring Go 1.24.0; no global install or tool source build.

Every row maps to `L04-<suffix>.txt` and its exact argv/exit/hash/EOF in `cases.json`.
All rows are `passthrough` / `pending-policy`. Public-filter intended evidence is
the entire original merged output, byte-identical, including failures, warnings,
machine-report metadata, source context, counts and EOF. No parser, golden reduction,
runtime support, test name or integration claim: acceptance tests remain lead-owned.
Raw captures serve as proposed exact goldens pending independent review/promotion.

## Native cases and independent source evidence

The recipe's `SOURCES` and receipt's source hashes bind diagnostic lines to original
tiny inputs. Expected findings below derive from those inputs, not an implementation
under test. `issues/issues.go`: ignored `action()` error at 12:23 (`errcheck`), overwritten
`x := 1` at 6:2 (`ineffassign`), uncalled `dead` at 3:6 (`unused`). `other/other.go`:
uncalled `hidden` at 3:6. `other/雪.go`: uncalled `unused雪` at 4:6 after a Unicode comment.
Native totals: issues-only 3 = errcheck 1 + ineffassign 1 + unused 1; multifile 5 =
errcheck 1 + ineffassign 1 + unused 3; Unicode package 2 = unused 2. Exact columns,
tabs, carets, source strings and JSON Offset/Line/Column values remain captured.
Go-native positions are not HuGR UTF-16 source-span indices; no conversion occurs.

| Stable suffix | Required variant / source evidence | Exit |
| --- | --- | --- |
| version | Reported producer/version/commit/build timestamp | 0 |
| run-help | Pinned supported native/requested output flags; v2 does not accept `--out-format` | 0 |
| linters-json | Native requested linter catalog JSON; descriptions/configuration retained | 0 |
| native-clean | Correct exported `Sum`; `0 issues.` summary retained | 0 |
| native-diagnostics | Three linter findings, snippets, carets, counts | 1 |
| native-multifile | Five findings across three files/two packages; associations/counts | 1 |
| native-space-unicode | Real spaced/Unicode working directory, absolute filenames, Unicode source/comment | 1 |
| native-type-error | Undefined `undefinedName`, typecheck source/caret | 1 |
| native-syntax-error | Malformed function declaration; complete typecheck diagnostic block | 1 |
| json-clean | Empty Issues plus full Report.Linters metadata, terminal LF | 0 |
| json-diagnostics | Three complete Issue objects; messages/rules/snippets/positions | 1 |
| json-multifile | Five complete Issue objects and source associations | 1 |
| json-space-unicode | Two Issue objects, absolute space/Unicode paths, byte offsets/context | 1 |
| json-type-error | Complete typecheck Issue object and Report metadata | 1 |
| json-syntax-error | Complete native JSON typecheck issue/context | 1 |
| json-exit-zero | Explicit `--issues-exit-code=0`, five findings still present | 0 |
| json-with-stats | Requested JSON followed by native textual linter stats; not standalone JSON | 1 |
| native-exit-zero | Same five findings/counts with explicitly successful exit | 0 |
| json-linter-warning | Warning logs precede JSON; Report.Warnings repeats some warnings, not all; preserve both | 0 |
| native-verbose-metrics | Explicit verbose/stats; five findings, linter stages, times/cache/memory | 1 |
| native-clean-metrics | Successful verbose/stats; timing/cache/memory and zero count | 0 |
| native-no-context | Explicit omission of printed source lines; messages/positions/counts remain | 1 |
| native-color | `--color=always` under NO_COLOR=1; observed uncolored pipe output only | 1 |
| config-valid | Explicit v2 YAML configuration; five findings and all counts | 1 |
| config-invalid | YAML parse error and config-loader message; no diagnostic reduction | 3 |
| config-version | Missing v2 schema version; migration advice retained | 3 |
| config-missing | Missing requested YAML path; config-loader failure retained | 3 |
| unknown-linter | Invalid linter name; native error/help retained | 3 |
| deprecated-linter-warning | Actual wsl deprecation + settings warning + escaped multiline replacement config | 0 |
| invalid-format-flag | Real unsupported legacy `--out-format=json`; exact failure | 3 |
| missing-package | Go package-loader failure; complete path/error/summary | 7 |
| malformed-space-import | Go rejects space-bearing module import path; native failure retained | 7 |
| default-clean | Default standard linters, successful zero summary | 0 |
| tab-multifile | Requested tab reporter, five diagnostic rows and positions/rules | 1 |
| checkstyle-multifile | Requested XML, five diagnostics/file associations | 1 |
| sarif-multifile | Requested SARIF, rules, result locations and original token spellings | 1 |
| junit-xml-multifile | Requested JUnit XML, package suites/cases/failures and counts | 1 |
| code-climate-multifile | Requested Code Climate JSON, five descriptions/locations/fingerprints | 1 |
| teamcity-multifile | Requested TeamCity service messages; escaping/positions/snippets retained | 1 |

## Savings, controls and policy

Proposed/approved savings: **0 bytes**. Complete standalone run-JSON envelopes are
already compact: lexical outside-string whitespace measurement removes 0 bytes while
keeping terminal LF. Report.Linters is producer metadata, not decorative padding.
Receipt records individual measurements, a known whitespace-positive control that
preserves `1.00`, Unicode/string spaces and LF, real clean/dirty diagnostic controls
(0 vs 5 findings), and an altered-byte hash control. No proposal file is needed.

Native requested metrics remain exact. JSON+stats and JSON+warning cases prove requested
JSON does not imply a pure JSON merged host boundary. Warning logs and JSON report
warnings cannot be silently deduplicated. Human-approved exact retention of ambiguous
plugin/reporter logs does not authenticate producer identity or waive missing coverage.

## Boundaries and unresolved reach

- Capture-only, pending independent review/corpus promotion and policy. No filter checks,
  fixture-only suites, typecheck, build, smoke, benchmark or CI were run.
- Existing binary's version, SHA-256 and unmodified VCS build metadata pin observed
  producer; independent reproducible-build/binary-to-source authentication remains open.
- Bounded v2.11.4 CLI evidence only. v1 formats, custom module plugins, real third-party
  reporter/log injection, HTML output, file-target output and profiling-artifact flags
  are not captured. They are not silently approved or covered by this packet.
- NO_COLOR witness does not establish ANSI/PTY grammar. Pipe boundary is complete;
  terminal presentation is `unknown`, not claimed authenticated by output appearance.
- Failed malformed-space import is not substituted for successful space/Unicode
  diagnostics; both real cases exist. Native error and nonzero formats remain exact.
- Go 1.27.1 with a go1.26.1-built linter succeeded for these no-import modules; broader
  Go-version/standard-library/dependency compatibility is unproved.

Framing error: equating a requested machine format with safe removable output, or
calling a real capture runtime support. This packet supplies preserved native evidence
for lead decisions; no material reduction or whole-family completion claim.
