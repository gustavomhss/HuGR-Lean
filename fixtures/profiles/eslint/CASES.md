# L01 ESLint capture packet

Lead approved two-byte native stylish framing reduction. Family-local parser and
focused tests supplied; shared registry remains lead-owned. `cases.json` uses
`hugr-lean/native-cases/1` with flat observation/provenance fields and measured statuses.
Original full `native-cases1` record remains byte-exact in `capture-receipt.json`.
`expectedFile` references independent literal goldens authored before parser.

| ID suffix | Native combination | Required evidence / current disposition |
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
| ascii-stylish / absolute-stylish / npx-stylish / npx-no-install-stylish | Four actual launchers, ASCII argv, Unicode messages | Identical output hash; each public-filter result reduced by two boundary bytes |

## Approved material policy

Only stylish leading LF and final extra LF are removable: two UTF-8 bytes
per successful nonempty stylish case. Keep all other spacing, including multiline
message continuation and section separation. Formatter source proves these boundary
blanks; no fixed text prefix is proposed removable. Savings are tiny, not material
diagnostic redundancy or full ESLint coverage.

Repeated `no-console` warnings belong to different files/positions. Never deduplicate
warnings, sever path association, drop fixable totals, or rewrite JSON. Stylish does
not print suggestions, source snippets or end positions; JSON independently exposes
those native details. Do not synthesize missing stylish context or restore message
periods removed by ESLint's own formatter.

Original receipt's `no-noise` and `grammar-unimplemented` record capture-time facts.
Current statuses are checked through public `filter` with explicit `familyProfiles`;
default registry integration is not claimed. Original Unicode argv is refused by
existing core tokenizer; native Unicode paths/messages remain supported by grammar.

Bounded subset: 1 Mi UTF-16 units, 4096 absolute structural Unix file headers,
16384 warning records, 256 continuation lines per message. Position/rule rows use
native indentation and final rule column; rule-less 0:0 warnings are single-line.
Duplicate headers, structural continuation lookalikes and missing/false totals refuse.
Fix slots require zero errors and positive fixable warnings no greater than total;
stylish does not expose per-row fixability, so stronger truth cannot be inferred.
Messages/continuations are never rewritten: even indistinguishable message-like user
text remains required interior evidence. Unknown headers/tails are refused.
CRLF, controls/ANSI, JSON, silence, config Node warnings, nonzero/incomplete and all
terminal-rendered observations preserve exact. Terminal-rendered refusal prevents
core's pre-profile ANSI normalization from silently expanding this grammar.

`tests/profile-eslint.test.ts` covers literal native goldens, witnessed launchers,
metadata, unknown commands/output, false summaries/duplicates/fix slots, C0/C1/CRLF,
Unicode/spaces/continuations and complete interior required spans. Empty-family
baseline ran red before implementation. Measured native sizes: 724→722 (four
launcher captures share byte-identical output), 310→308, 304→302. No profit claim.

Preservation probes edited only owned parser: delete first diagnostic (declaration
and renderer), delete first position, delete fixable count, bypass grammar to admit
unknown interior text. Each probe produced focused RED. Parser restored exactly to
compiling checkpoint; all focused tests and typecheck rerun after restoration.
