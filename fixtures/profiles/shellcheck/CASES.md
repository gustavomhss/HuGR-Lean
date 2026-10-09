# L10 ShellCheck: capture-only packet

Base `63d3ece`, branch `campaign/native-v2/L10`. Producer: existing ShellCheck 0.11.0.
`cases.json` uses `hugr-lean/native-cases/1`; every case is **passthrough, pending-policy**.
Each row's native input and independent expected output are the same file: preserve every byte.
Output files are the only input declaration; no duplicate inline output. `capture-receipt.json`
binds source text/hash, recipe/hash, binary/hash, version, platform, environment, argv, exits,
EOF, and exact merged host-pipe boundary. Sources are never executed; ShellCheck analyzes them.
No public-filter invocation, baseline-red claim, parser, golden reduction, test name, or CI claim.

## Case ledger

All IDs below have prefix `L10-`; native file is `<full-ID>.txt`. Required/source evidence:

| ID suffix | Variant and evidence retained |
| --- | --- |
| version | Exact version, GPL notice and website |
| help | Requested frontend options; json and json1 listed separately |
| optional-checks | Requested optional-check names, descriptions, examples and fixes |
| native-clean | sh clean; empty EOF, exit 0 |
| native-warnings | bash; SC2034 warning, SC2045 error, SC2035/SC2086 info; snippets, carets, suggestions, links |
| native-error | SC2283 error; assignment-looking command, snippet and link |
| native-multifile | Two files, diagnostics bound to original path/line and link section |
| native-unicode-space | Space/Unicode path; Unicode including astral character before diagnostic column |
| explicit-tty-links | Explicit tty/no color; requested link count 10, complete links |
| explicit-tty-color | Explicit tty/color always; raw ANSI controls retained |
| directives | Inline disable SC2086; SC2154 remains, so directive does not mean success |
| exclude | Explicit SC2034/SC2045/SC2086 excludes; SC2035 remains |
| exclude-all | Explicit four-code exclusion; silent exit 0, no invented savings |
| include | Explicit SC2086 include; other codes suppressed |
| dialect-sh | Explicit sh; bash array diagnostics SC3030/SC3054 |
| dialect-bash | Same source, explicit bash; silent success |
| severity-error | Error threshold retains SC2045 only |
| severity-warning | Warning threshold; unassigned/unused evidence |
| severity-info | Info threshold includes SC2086 and suggestion |
| severity-style | Style threshold plus optional useless-use-of-cat; SC2002 style |
| config | Explicit good rcfile; shell=bash and disable=SC2086 affect output |
| config-invalid | Invalid rcfile shell value on clean source silently exits 0; observed behavior, not rejection proof |
| config-syntax | Unterminated rcfile value; native SC1134 configuration diagnostic, exit 1 |
| config-missing | Missing explicit rcfile warning, exit 0; do not erase as success decoration |
| syntax | Unclosed shell quote/if; all parse diagnostics retained |
| missing-file | Missing input error, exit 2 |
| invalid-format | Unsupported format plus supported list, exit 4 |
| invalid-dialect | Unsupported CLI shell, exit 4 |
| source-default | Native refusal to follow external source; source directive and SC1091 |
| source-external | Explicit external/check-sourced/quote-safe-variables; diagnostic in lib.sh |
| json-clean | Explicit json; array envelope and LF, exit 0 |
| json-warnings | json codes/severity/file/line/endLine/column/endColumn/message |
| json-error | json error diagnostic, exit 1 |
| json-syntax | json parse diagnostics, exit 1 |
| json-multifile | json diagnostics retain two-file identity |
| json-unicode-space | json path and native positions with Unicode before diagnostic |
| json-excluded | json requested excludes, residual SC2035 |
| json-style | json optional SC2002 style plus warnings/info |
| json-missing-file | json mode emits native file error plus JSON array, exit 2; mixed boundary not coerced into JSON |
| json1-clean | Explicit json1; comments object and LF, distinct from json |
| json1-warnings | json1 comments with fix/replacements/insertionPoint/precedence |
| json1-error | json1 error and fix/null evidence |
| json1-syntax | json1 parse diagnostics and null fixes |
| json1-multifile | json1 two-file identity and complete fix data |
| json1-unicode-space | json1 Unicode path/positions/replacement columns |
| json1-excluded | json1 requested excludes, residual SC2035 |
| json1-style | json1 style fix and remaining diagnostic/fix data |
| json1-missing-file | json1 mode emits native file error plus comments object, exit 2; mixed boundary not coerced into JSON |

## Savings, blockers and framing

Approved savings: **0 UTF-8 bytes**. All cases remain pending policy, including silent clean cases.
Recipe examines only JSON lexical whitespace outside strings and keeps token spelling/order plus
terminal LF; supplied JSON/json1 outputs already compact. Receipt records a spaced JSON positive
control proving the measurement detects removable layout, plus per-case JSON inventory. No smaller candidate or proposed `.txt`
exists in this capture. Every license/proposed `.txt` is explicitly declared in `archives`;
currently the sole archive is `LICENSE.shellcheck.txt`. Nonzero candidates would be ineligible.
Native snippets/carets/links/suggestions and explicit ANSI output are evidence, not removable progress.
Deleting EOF, diagnostics, fixes, links, codes, severity, positions, or envelope is not a layout proposal.

Reduction framing is wrong for these witnesses: most useful output is on nonzero exits; successful
analysis is silent, while explicit success JSON is already minimal layout. This packet establishes
observed native coverage, not implemented reduction coverage or a human-approved exact-only waiver.
Capture scope is one macOS host, one version, sh/bash and these argv combinations; no Windows/Linux,
PTY/interleaving stream attribution, all shell dialects, stdin launcher, or whole grammar claim.
Existing binary version/hash is pinned, but its exact build correspondence to upstream commit is not
independently attested. Independent lead review and corpus promotion remain pending.

## Reproduce

Run `python3 fixtures/profiles/shellcheck/capture.py` with existing ShellCheck 0.11.0 available.
Recipe creates only tiny isolated temp source files, invokes ShellCheck directly with argv arrays,
reads merged stdout/stderr through EOF, records exits, then removes temp sources. No shell payload,
test/typecheck/build/smoke/benchmark/CI runs. Receipt retains all source bytes for independent replay.
The recipe overwrites only this packet's generated artifacts. Upstream license fetch uses pinned commit.
