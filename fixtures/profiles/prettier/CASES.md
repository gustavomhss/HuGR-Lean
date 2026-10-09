# L05 native Prettier case ledger

38 cases, 3,119 raw UTF-8 bytes. Prettier 3.6.2 pin and reproduction: `SOURCES.md`.
All manifest statuses are pending-policy **passthrough**. There is no implemented or approved
reduction. Dispositions are separate: **ZERO_NOISE** (no removable material identified),
**UNSAFE** (failure, unsupported argv or producer ambiguity), **NOT_IMPLEMENTED** (candidate
noise observed; policy/implementation absent). Neither UNSAFE nor NOT_IMPLEMENTED closes
mandatory reduction scope without human decision.

For each ID `L05/<name>`, native input and independent exact expected evidence are
`captures/<name>.txt`; argv and hash are in `cases.json` and `capture-receipt.json`.
Fixture-only verification name is `verify.py: <name>` (explicit EXPECTED ledger), **not**
a public-filter acceptance test. Preservation evidence is entire file, including EOF;
failure paths, diagnostics, snippets, caret, warnings, summaries and formatted source remain intact.

Candidate bytes below mean only proposed removal of `Checking formatting...\n` (23 UTF-8
bytes), retaining 43-byte success summary. Six cases total **138 candidate bytes**, **0 approved**.
These repeated witnesses are not six independent production savings opportunities.
No candidate is proposed for failures, plugin output, unknown flags or meaningful source/path output.

| Name (prefix L05/) | Variant / required evidence | Exit | Raw bytes | Disposition | Candidate bytes |
| --- | --- | ---: | ---: | --- | ---: |
| version | Exact tool version | 0 | 6 | ZERO_NOISE | 0 |
| check-clean | Good syntax, header and success summary | 0 | 66 | NOT_IMPLEMENTED | 23 |
| check-dirty | Bad style, warning path and plural advice | 1 | 123 | UNSAFE | 0 |
| check-multiple | Clean/dirty/space/Unicode files, both warning paths and summary | 1 | 145 | UNSAFE | 0 |
| list-clean | Good syntax, silent check | 0 | 0 | ZERO_NOISE | 0 |
| list-multiple | Dirty and space/Unicode paths | 1 | 31 | UNSAFE | 0 |
| debug-clean | Debug-check reports clean path | 0 | 9 | ZERO_NOISE | 0 |
| debug-multiple | Debug-check dirty + space/Unicode paths | 0 | 31 | ZERO_NOISE | 0 |
| default-source | Formatted dirty source is requested data | 0 | 24 | ZERO_NOISE | 0 |
| syntax-check | SyntaxError 1:16, source/caret/context, failure summary | 2 | 214 | UNSAFE | 0 |
| syntax-list | Syntax diagnostics despite list mode | 2 | 132 | UNSAFE | 0 |
| syntax-debug | Syntax diagnostics despite debug mode | 2 | 132 | UNSAFE | 0 |
| config-failure | Invalid tabWidth value and check header | 1 | 98 | UNSAFE | 0 |
| ignored | Ignored dirty input, success does not imply formatting | 0 | 66 | NOT_IMPLEMENTED | 23 |
| no-files | Unmatched pattern error and check summary | 2 | 132 | UNSAFE | 0 |
| no-files-allowed | Explicit unmatched allowance, unchanged success output | 0 | 66 | NOT_IMPLEMENTED | 23 |
| unknown-option | Unknown option warning and no-parser error despite exit zero | 0 | 130 | UNSAFE | 0 |
| plugin-collision | Real stdout plugin duplicates native header and summary | 0 | 132 | UNSAFE | 0 |
| npx-check | Local offline npx launcher, clean check | 0 | 66 | NOT_IMPLEMENTED | 23 |
| npx-no-install-check | Local offline npx --no-install launcher | 0 | 66 | NOT_IMPLEMENTED | 23 |
| config-good | Explicit valid JSON config and clean syntax | 0 | 66 | NOT_IMPLEMENTED | 23 |
| default-clean | Good syntax, formatted source | 0 | 17 | ZERO_NOISE | 0 |
| default-unicode | Space path and Unicode identifier/string survive | 0 | 26 | ZERO_NOISE | 0 |
| syntax-default | Bad syntax in source-producing default mode | 2 | 132 | UNSAFE | 0 |
| config-list | Bad config in list mode | 1 | 75 | UNSAFE | 0 |
| config-debug | Bad config in debug mode | 1 | 75 | UNSAFE | 0 |
| config-default | Bad config in default mode | 1 | 75 | UNSAFE | 0 |
| ignored-list | Ignore rule yields silent list result | 0 | 0 | ZERO_NOISE | 0 |
| ignored-debug | Ignore rule yields silent debug result | 0 | 0 | ZERO_NOISE | 0 |
| ignored-default | Original ignored source printed unchanged | 0 | 20 | ZERO_NOISE | 0 |
| no-files-list | Unmatched error in list mode | 2 | 66 | UNSAFE | 0 |
| no-files-debug | Unmatched error in debug mode | 2 | 66 | UNSAFE | 0 |
| no-files-default | Unmatched error in default mode | 2 | 66 | UNSAFE | 0 |
| plugin-list | Plugin stdout equals entire clean-check output byte-for-byte | 0 | 66 | UNSAFE | 0 |
| plugin-debug | Repeated plugin stdout plus debug path | 0 | 273 | UNSAFE | 0 |
| plugin-default | Plugin stdout preceding requested source | 0 | 83 | UNSAFE | 0 |
| plugin-multiple | Plugin/stdout/style warnings interleaved across Unicode files | 1 | 277 | UNSAFE | 0 |
| default-multiple | Clean/dirty/space/Unicode concatenated source | 0 | 67 | ZERO_NOISE | 0 |

Disposition totals: 11 ZERO_NOISE, 21 UNSAFE, 6 NOT_IMPLEMENTED.
EOF: 3 empty, 35 LF. Exit: recorded per case, not inferred from diagnostic wording.

## Blockers / framing

- Header deletion needs producer-boundary policy, finite argv/config/plugin rules, implementation,
  public-filter red/green evidence and independent review. Plugin absence in argv alone does not
  establish absence of config-loaded plugins. No automatic identity claim is made here.
- Plugin `--list-different` proves the exact 66-byte clean-check grammar can be arbitrary stdout.
  Deduplicating matching rows or treating matched text as native-only would lose evidence.
- Nonzero captures remain exact. Default output is source data; list/debug output is path evidence.
- Scope is pinned combined-pipe CLI captures, not exhaustive Prettier support: no stdin, PTY/ANSI,
  write/watch/cache, custom parser/printer, arbitrary config languages, future versions or other OS.
- No network/toolchain blocker occurred in final capture. Campaign completion remains blocked on
  policy/implementation/lead decision. Calling this packet completed L05 reduction coverage is
  the framing error; only capture work is finished.
