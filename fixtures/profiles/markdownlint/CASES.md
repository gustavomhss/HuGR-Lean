# L11 — markdownlint-cli2 capture-only packet

Baseline `63d3ece6f0a3f2963322149294f6dcc8bf197d47`; branch `campaign/native-v2/L11`.
Frontend **markdownlint-cli2 0.23.3**, rules **markdownlint 0.41.1**.
This is not markdownlint-cli coverage, a parser implementation, or completed reduction coverage.

All `hugr-lean/native-cases/1` entries remain **passthrough, pending policy**.
Each entry declares only `file`, never duplicate inline input. Native bytes are the exact-only
reference; no public-filter run, test name, red/green, or accepted golden is claimed.
Independent source expectations below come from the tiny input files and pinned producer windows
in `SOURCE-EVIDENCE.md`, not a proposed reducer. Receipt binds argv, platform, exit, hashes and EOF.

## Cases and independent evidence

All filenames below are native inputs to the corpus, relative to this directory.
Approved removable bytes are **0 for every row**. `Test` is **N/A — capture-only** for every row.

| Stable ID | Required variant / native file | Source-backed expected evidence | Exit | Pending classification |
| --- | --- | --- | --- | --- |
| L11-success | Native Markdown success; `success.txt` | `project/clean.md`; banner binds both versions, 1 file linted, 0 issues in 0 files | 0 | **unimplemented**: progress candidate exists, no accepted deletion policy |
| L11-errors | Built-in rule aliases, line/column, context, totals; `errors.txt` | `project/errors.md`: MD019 at 3:4 with `##  Wide heading`; MD033 at 5:11, `Element: b`; MD025/single-title/single-h1 at 7 with `Second title`; 3 issues / 1 file | 1 | **unsafe**: failed command must remain exact |
| L11-multifile-unicode | Multi-file + spaces + Unicode + totals; `multifile-unicode.txt` | Clean + errors + `path spaces/café 🧪.md`; 3 linted files, 4 issues / 2 files; Unicode MD033 at 3:9 | 1 | **unsafe**: failed command, associations and positions retained |
| L11-custom-rule | Custom names/aliases, detail, context, Unicode column; `custom-rule.txt` | `project/custom-rule.cjs` supplies L11-BAD/no-bad-token at 3:12, detail and full `😀 café <b>BAD</b>` context; built-ins disabled; 1 issue / 1 file | 1 | **unsafe**: custom code and nonzero; diagnostic column is 1-based UTF-16, not UTF-8 |
| L11-config-ignore | Config rule disable + ignored directory + explicit found paths; `config-ignore.txt` | `project/ignore.markdownlint-cli2.jsonc` disables MD019 and excludes `ignored/**`; 3 found files, 3 issues / 2 files; MD033/MD025 remain | 1 | **unsafe**: nonzero; found paths, config effects and totals are evidence |
| L11-glob-ignore | Documented `#` negated glob + spaces/Unicode; `glob-ignore.txt` | `**/*.md` and `#ignored/**`; 3 files linted, 4 issues / 2 files, excluded bad file not diagnosed | 1 | **unsafe**: nonzero; preserve original argv and output |
| L11-config-invalid | Malformed config failure; `config-invalid.txt` | Broken JSONC fixture; `ValueExpected (offset 12, length 0), CloseBraceExpected (offset 12, length 0)` plus causes/stack/paths | 2 | **unsafe**: execution/config failure, no truncation |
| L11-config-missing | Missing config failure; `config-missing.txt` | Requested nonexistent config; complete native error, ENOENT, stack and original paths | 2 | **unsafe**: execution/config failure |
| L11-literal-missing | Documented `:` literal missing input; `literal-missing.txt` | `:missing.md` schedules 1 file then ENOENT; no invented successful summary | 2 | **unsafe**: incomplete lint workflow, complete failed-process capture |
| L11-json-file | Explicit documented JSON formatter, multi-file; `json-file.txt` | Config requests `requested-results.json`: merged output is banner/progress/totals only; separate report contains four complete diagnostic objects | 1 | **unsafe**: nonzero; side artifact is not host merged output |
| L11-json-stdout-errors | Explicit formatter filename `/dev/stdout`, no banner/progress; `json-stdout-errors.txt` | Same four report objects, names/links/context/ranges/fixInfo/severity, exact no-LF EOF; bytes match separate file report | 1 | **unsafe**: nonzero; machine-format retention only |
| L11-json-stdout-success | Explicit JSON reporter success; `json-stdout-success.txt` | Actual empty report is exactly `[]` (2 UTF-8 bytes, no LF) | 0 | **no-noise**: no removable layout; still pending lead policy, not completed scope |
| L11-reporter-collision | Custom formatter stdout collision; `reporter-collision.txt` | `project/collision-reporter.cjs` executes after native summary and emits identical Finding/Linting/Summary plus reporter-owned diagnostic; exit stays 0 | 0 | **unsafe**: merged pipe cannot authenticate producer identity from text |

## Candidate, not golden

`success.progress-candidate.txt` deletes only `Finding: clean.md\n` and `Linting: 1 file\n`
from `success.txt`: **112 → 78 UTF-8 bytes; 34 bytes proposed, 0 approved**.
Banner and summary remain byte-exact, including final LF. This is a mechanical review candidate,
not output of an implemented profile. Configuration can load executable rules/formatters that emit
the same lines. The collision witness retains them all; it does not prove any safe boundary.
Nonzero cases have no deletion candidate. No JSON error compaction candidate is promoted.

## Blockers and framing

- **UNIMPLEMENTED:** no parser/routing/preservation proof exists in this packet; policy review required.
- **UNSAFE:** command identity or native-looking text does not bind which producer wrote a merged row.
- **NO-NOISE:** `[]` success report cannot get smaller while preserving requested report content.
- JSON is requested through `outputFormatters`, not an undocumented `--json` flag. Official reporter
  writes a file by default. `/dev/stdout` uses documented `name` option but is macOS-specific here;
  no Windows/Linux stdout-device compatibility claim.
- Only direct installed frontend invocations captured. No markdownlint-cli, global/npx launcher,
  terminal-color, watch, fixing/formatting, stdin, arbitrary plugin matrix or full-campaign claim.
- No human scope waiver recorded. Capture status does not complete mandatory reduction coverage.

All noninput `.txt` files (four licenses and candidate) are explicitly listed in `cases.json.archives`.
Requested JSON side report is declared in `capture-receipt.json`, never substituted for merged bytes.
