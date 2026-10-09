# L08 Pyright — capture-only recovery

Baseline: `78195e9`; branch `campaign/native-v2/L08`; PR base `campaign/native-integration`.
Exclusive ownership: `fixtures/profiles/pyright/**`. This packet is CAPTURED, not implementation-complete.
All `native-cases/1` entries are file-only and declare `passthrough`, pending a reducer.
No public-filter invocation, routing claim, reducer test, typecheck, build, benchmark, or CI receipt is supplied.
Acceptance test name for every row: **N/A — CAPTUREONLY**; raw files are independent source evidence.
Expected output for each row is its entire raw input, including EOF. Candidates are not goldens.

## Case register

| Stable ID | Native input / required combination | Independent evidence to preserve | Exit | Exact-only reason | Candidate removable UTF-8 bytes |
| --- | --- | --- | ---: | --- | ---: |
| L08-plain-success | `plain-success.txt`; clean file | `0 errors, 0 warnings, 0 informations` and LF | 0 | no-noise | 0 |
| L08-plain-error | `plain-error.txt`; argument type error + Unicode message | file association, `4:11`, primary message, indented context, `reportArgumentType`, totals | 1 | unsafe: nonzero | 0 |
| L08-plain-warning | `plain-warning.txt`; warning severity configured locally | `2:5`, unused-variable message/rule, one warning, zero errors | 0 | no-noise | 0 |
| L08-plain-information | `plain-information.txt`; `reveal_type` | `2:13`, Unicode literal type, one information | 0 | no-noise | 0 |
| L08-plain-multi | `plain-multi.txt`; five argv files, all severities, space/Unicode path | four diagnostic file groups, two context blocks, positions/rules, totals `2 errors, 1 warning, 1 information` | 1 | unsafe: nonzero | 0 |
| L08-json-success | `json-success.txt`; explicitly requested `--outputjson` | exact version/time tokens, empty diagnostic array, all summary keys/values, two terminal LF bytes | 0 | unimplemented: JSON layout | 80 |
| L08-json-error | `json-error.txt`; explicit JSON + two files + space/Unicode path/context | exact messages/escapes, severities, rules, zero-based start/end ranges, all counts/timing/version/time, two terminal LF bytes | 1 | unsafe: nonzero | 603 (ineligible) |
| L08-config-invalid | `config-invalid.txt`; invalid `typeCheckingMode` | complete config warning **despite exit 0**, then clean totals | 0 | unsafe: configuration failure evidence | 0 |
| L08-config-missing | `config-missing.txt`; nonexistent project | full missing-path warning and clean totals; exit 3 | 3 | unsafe: nonzero configuration failure | 0 |
| L08-stats | `stats.txt`; requested `--stats` + warning/info + three files | loading/exclusions, source count/version, both diagnostics, totals, completion time, parsed/bound/checked counts, every timing metric | 0 | unsafe: explicitly requested metrics/log evidence | 0 |
| L08-verbose | `verbose.txt`; requested `--verbose` | config/exclusions, environment, extra paths, Python version/platform, every search path, file count/version, totals, completion time | 0 | unsafe: explicitly requested environment/log evidence | 0 |

`evidence.json` records 7,722 raw UTF-8 bytes, every hash, exact terminal LF count and final 16 bytes.
All raw captures are complete exited processes. Plain/config/stats/verbose have one terminal LF;
JSON has two. No normalization of `/private/var` paths, nonbreaking spaces, Unicode, timestamps,
timings, or summaries occurred. Spans, if implemented later, must use UTF-16 indices, not byte offsets.

## Layout candidate, not implementation

`json-success.layout-candidate.txt`: 251 → 171 bytes, **80 candidate bytes**.
`json-error.layout-candidate.txt`: 1,639 → 1,036 bytes, **603 ineligible candidate bytes**.
Combined layout measurement: 683 bytes; eligible success-only measurement: 80 bytes;
approved/public-filter savings: **0 bytes**. Candidate compaction removes only JSON whitespace
outside strings and preserves the exact two-LF EOF. Every data token, including `time` and
`timeInSec`, remains byte-identical. These artifacts are absent from manifest inputs/expected outputs.

## Blockers and framing

- Pyright reducer, safe finite argv matching, routing, preservation tests and red/green proof are pending.
- Success JSON layout needs lead review and implementation; nonzero JSON must remain exact.
- No authenticated producer-collision boundary is claimed beyond direct native child capture.
- Capture-only evidence does not complete mandatory reduction coverage or waive unsafe/unimplemented rows.
- Prior interrupted script declared both `file` and `outputUtf8` per transport record. Recovery writes
  one raw file per case and a file-only manifest; receipt contains metadata, not duplicate raw text.
  Current artifact inspection reports `framingErrors: []`. No corpus integration is claimed.

Recovery artifact inspection uses `python3 fixtures/profiles/pyright/evidence.py`; it reads raw hashes,
EOF and framing and emits layout measurements. It is not a fixture-only test suite or a filter test.
