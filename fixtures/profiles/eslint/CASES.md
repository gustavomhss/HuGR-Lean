# L01 ESLint capture packet

Capture-only, proposed policy. No parser, registry change, public-filter measurement,
reduction golden or acceptance test supplied. `cases.json` is `native-cases1`;
`file` is raw input, `expectedFile` is intentionally absent until lead freezes policy.

| ID suffix | Native combination | Required evidence / proposed disposition |
| --- | --- | --- |
| version | Direct PATH-resolved binary | Actual v9.37.0, exit 0; exact |
| stylish-warnings | Default stylish, two files, warning-only exit 0 | Five warnings, rules, paths, positions, Unicode identifier/path, multiline message, totals, one fixable warning |
| json-warnings | Explicit `--format json`, same two files | Compact JSON; full messages including periods, source context, end positions, suggestions/descriptions/data, fix ranges/text, counts, suppressed/deprecated arrays; exact |
| stylish-error | Undefined name, exit 1 | Full failed output exact, even native blank lines |
| silent-clean | Clean file, exit 0 | Zero bytes; no-noise, not reduction evidence |
| fix-before | Explicit config, two fixable warnings | Both diagnostics and fixable summary intact |
| fix-applied | Same config/file with `--fix` | Zero output; actual before/after source proves two edits, not a printed success claim |
| ignored-warning | Global ignore, explicit file | Position 0:0, absent rule, complete ignore reason/advice and warning total |
| empty-config-warning | Empty flat config, clean file | Node warning class/PID, config path, whole message and trace advice exact |

## Material policy proposed for review

Only stylish leading LF and final extra LF are proposed removable: two UTF-8 bytes
per successful nonempty stylish case. Keep all other spacing, including multiline
message continuation and section separation. Formatter source proves these boundary
blanks; no fixed text prefix is proposed removable. Savings are tiny, not material
diagnostic redundancy or full ESLint coverage.

Repeated `no-console` warnings belong to different files/positions. Never deduplicate
warnings, sever path association, drop fixable totals, or rewrite JSON. Stylish does
not print suggestions, source snippets or end positions; JSON independently exposes
those native details. Do not synthesize missing stylish context or restore message
periods removed by ESLint's own formatter.

`no-noise` describes captured material only. `grammar-unimplemented` separately
describes implementation state. Neither is a waiver or a completed grammar claim.
Unknown/config-warning/plugin/collision variants still need future admission/refusal
tests. Test names, expected goldens and red/green are deferred to parser work.
Mutation probes here validate raw-byte hashes and native diagnostic facts only.
