# L09 Stylelint case ledger — CAPTURED, not implemented

All IDs below have prefix `L09-`; native input is `<suffix>.txt`. Exact argv,
exit/boundary/hash/source bindings live in `capture-receipt.json`; public-filter
disposition is `passthrough` for every row. Expected preservation oracle is the
entire original file, bound by SHA-256, plus source and fix effects. No runtime
test names exist yet: `NOT_RUN_CAPTURE_ONLY` applies to every row.

| Suffix | Required variant / independent evidence | Exit | Exact reason | Proposed removable bytes |
| --- | --- | ---: | --- | ---: |
| native-success | clean source; default formatter silent | 0 | no-noise | 0 |
| native-errors | invalid hex twice, unknown property; severity/rules/positions/summary | 2 | unsafe-nonzero | 0 approved |
| native-warning | warning-only config; one rule/position/message; zero errors | 0 | unimplemented | 1 unapproved |
| native-multifile-unicode | clean + errors + Unicode/space path; file associations | 2 | unsafe-nonzero | 0 approved |
| native-verbose-warning | warning + explicit verbose; source path/rule totals | 0 | unimplemented | 1 unapproved |
| native-syntax | unclosed CSS block at 1:1; CssSyntaxError | 2 | unsafe-nonzero | 0 approved |
| config-missing | explicit nonexistent config; complete native stack | 1 | unsafe-nonzero | 0 approved |
| config-unknown-rule | unknown rule, diagnostic and summary | 2 | unsafe-nonzero | 0 approved |
| config-syntax | invalid JS config; native syntax stack | 1 | unsafe-nonzero | 0 approved |
| json-success | explicit JSON; source, arrays, errored=false | 0 | no-noise in JSON layout; admission unimplemented | 0 |
| json-warning | explicit JSON + warning severity; one range/rule/message | 0 | no-noise in JSON layout; admission unimplemented | 0 |
| json-multifile-unicode | explicit JSON; three source records, five diagnostics | 2 | unsafe-nonzero | 0 approved |
| json-syntax | explicit JSON; CssSyntaxError range/message | 2 | unsafe-nonzero | 0 approved |
| native-fix-success | --fix, silent output; #ffffff becomes #fff | 0 | no-noise; file evidence required | 0 |
| native-fix-errors | --fix, invalid hex survives; valid color fixed despite exit 2 | 2 | unsafe-nonzero | 0 approved |
| json-fix-success | --fix + explicit JSON; clean result and changed CSS | 0 | no-noise in JSON layout; admission unimplemented | 0 |
| json-fix-errors | --fix + JSON; error remains, fix/file mutation retained | 2 | unsafe-nonzero | 0 approved |
| config-stdout-native | config logs native-looking counts; clean CSS | 0 | unsafe-producer-collision | 0 approved |
| config-stdout-json | same log before explicitly requested JSON | 0 | unsafe-producer-collision | 0 approved |
| plugin-stdout-native | plugin logs counts; verbose output plus real deprecation/help | 0 | unsafe-producer-collision | 0 approved |
| plugin-stdout-json | plugin log + deprecation/help + explicit JSON | 0 | unsafe-producer-collision | 0 approved |

## Source-backed evidence

`source/errors.css`: invalid colors at 1:13–17 and 1:26–33, unknown `colour`
at 1:5–11. JSON preserves these original start/end positions, rule IDs,
severity=error and messages; native summary is three errors, zero warnings.
`source/warning.css`: invalid color at 1:12–19, severity=warning, rule
`color-no-invalid-hex`; native summary is zero errors, one warning.
`source/paths with spaces/café 🧪.css`: source context includes astral characters
in comment/content; invalid color at 2:27–31 and property at 2:33–39. Columns
are producer values, not byte-offset conversions. Native formatter supplies no
CSS snippets; complete original source provides context independently.

Fix evidence under `effects/<suffix>/**` records every CSS file before and after.
Both fix success cases change `a { color: #ffffff; }` to `a { color: #fff; }`.
Both fix error cases shorten the valid first color and retain invalid second color;
remaining warning is error severity. Native JSON reports the original range
1:28–35 even though shortening the first color shifts the invalid token in the
written file. Silent output does not imply no file mutation. Preserve producer
positions verbatim; never recalculate them from before/after file contents.

## Candidates and blockers

`native-warning.layout-candidate.txt` and `native-verbose-warning.layout-candidate.txt`
remove only first LF. Every remaining byte, including two-LF EOF, remains intact.
These save one UTF-8 byte each; unapproved, no runtime parser or savings claim.
Requested native JSON is already compact; whitespace compaction yielded no smaller
proposal. All JSON tokens and native no-LF EOF remain required in this packet;
do not append a newline. `capture-receipt.json` records exact EOF tails.

Producer collision witnesses show arbitrary config/plugin output at the same host
boundary. Grammar alone cannot establish producer identity; do not delete logs,
summary-shaped lines, warning/help text, or file effects. CommonJS plugin emits
Stylelint deprecation with PID/path plus migration and trace advice; all retained.

Mandatory reduction remains unresolved. No-noise success is not a reduction proof;
unsafe/unimplemented rows are not human scope waivers. Lead must approve bounded
layout proposal or record explicit human scope decision. Corpus promotion,
runtime grammar, red/green proof, preservation tests and independent review remain
pending. Capture proves these pinned combinations, not all Stylelint options,
custom syntaxes/configs/plugins/formatters, launchers, terminals or platforms.
