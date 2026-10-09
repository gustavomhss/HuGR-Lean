# L08 Pyright — bounded JSON implementation

Baseline: `78195e9`; branch `campaign/native-v2/L08`; PR base `campaign/native-integration`.
Ownership expanded by human instruction to `src/profiles/pyright.ts`, `tests/profile-pyright.test.ts`
and this fixture stem. Explicitly selected `pyrightProfile` implements pinned exit-zero JSON layout.
Shared registry/index/helper remain lead-owned; default-filter routing is not implemented here.
All `native-cases/1` inputs remain file-only. Four exit-zero JSON cases now declare `reduced` with
independent manually transcribed goldens. Every other capture remains whole `passthrough`.
No full-package check/build/smoke/benchmark/CI is claimed. Closure/probes are recorded in `CHECKS.md`.

## Case register

| Stable ID | Native input / required combination | Independent evidence to preserve | Exit | Exact-only reason | Candidate removable UTF-8 bytes |
| --- | --- | --- | ---: | --- | ---: |
| L08-plain-success | `plain-success.txt`; clean file | `0 errors, 0 warnings, 0 informations` and LF | 0 | no-noise | 0 |
| L08-plain-error | `plain-error.txt`; argument type error + Unicode message | file association, `4:11`, primary message, indented context, `reportArgumentType`, totals | 1 | unsafe: nonzero | 0 |
| L08-plain-warning | `plain-warning.txt`; warning severity configured locally | `2:5`, unused-variable message/rule, one warning, zero errors | 0 | no-noise | 0 |
| L08-plain-information | `plain-information.txt`; `reveal_type` | `2:13`, Unicode literal type, one information | 0 | no-noise | 0 |
| L08-plain-multi | `plain-multi.txt`; five argv files, all severities, space/Unicode path | four diagnostic file groups, two context blocks, positions/rules, totals `2 errors, 1 warning, 1 information` | 1 | unsafe: nonzero | 0 |
| L08-json-success | `json-success.txt`; explicitly requested `--outputjson` | exact version/time tokens, empty diagnostic array, all summary keys/values, two terminal LF bytes | 0 | implemented: layout only, 251 → 171 bytes | 80 |
| L08-json-error | `json-error.txt`; explicit JSON + two files + space/Unicode path/context | exact messages/escapes, severities, rules, zero-based start/end ranges, all counts/timing/version/time, two terminal LF bytes | 1 | unsafe: nonzero | 603 (ineligible) |
| L08-config-invalid | `config-invalid.txt`; invalid `typeCheckingMode` | complete config warning **despite exit 0**, then clean totals | 0 | unsafe: configuration failure evidence | 0 |
| L08-config-missing | `config-missing.txt`; nonexistent project | full missing-path warning and clean totals; exit 3 | 3 | unsafe: nonzero configuration failure | 0 |
| L08-stats | `stats.txt`; requested `--stats` + warning/info + three files | loading/exclusions, source count/version, both diagnostics, totals, completion time, parsed/bound/checked counts, every timing metric | 0 | unsafe: explicitly requested metrics/log evidence | 0 |
| L08-verbose | `verbose.txt`; requested `--verbose` | config/exclusions, environment, extra paths, Python version/platform, every search path, file count/version, totals, completion time | 0 | unsafe: explicitly requested environment/log evidence | 0 |
| L08-json-warning | `json-warning.txt`; explicit JSON warning, exit zero | warning message/rule, path, start/end positions, version/time/all summary metrics, both LF | 0 | implemented: layout only, 828 → 484 bytes | 344 |
| L08-json-information | `json-information.txt`; explicit JSON reveal_type | information has no rule key; Unicode message and all remaining tokens | 0 | implemented: layout only, 803 → 473 bytes | 330 |
| L08-json-multi-unicode | `json-multi-unicode.txt`; explicit JSON, three files, warnings + information, Unicode/space path | four diagnostics grouped by file, ordered ranges, exact rules/messages/path/times/totals/EOF | 0 | implemented: layout only, 2,537 → 1,444 bytes | 1,093 |

Historical `evidence.json` records original 7,722 raw UTF-8 bytes and the capture-only measurements.
Additional raw JSON witnesses contribute 4,168 bytes; combined raw corpus is 11,890 bytes.
`capture-json-receipt.json` records added argv/hash/exit/source evidence/EOF;
`reduction-receipt.json` records four independent golden hashes and 1,847 selected-profile saved bytes.
All raw captures are complete exited processes. Plain/config/stats/verbose have one terminal LF;
JSON has two. No normalization of `/private/var` paths, nonbreaking spaces, Unicode, timestamps,
timings, or summaries occurred. Spans, if implemented later, must use UTF-16 indices, not byte offsets.

## Layout candidate, not implementation

`json-success.layout-candidate.txt`: 251 → 171 bytes, **80 candidate bytes**.
`json-error.layout-candidate.txt`: 1,639 → 1,036 bytes, **603 ineligible candidate bytes**.
Historical combined layout measurement: 683 bytes; eligible success-only measurement: 80 bytes.
Promotion verifies four selected-profile reductions totaling **1,847 bytes**; default registry not wired.
Candidate compaction removes only JSON whitespace
outside strings and preserves the exact two-LF EOF. Every data token, including `time` and
`timeInSec`, remains byte-identical. These artifacts are absent from manifest inputs/expected outputs.

## Scope, blockers and framing

- Implementation uses frozen `jsonLayout` plus a required source span for the exact native two-LF EOF.
- Finite direct `pyright`/generic absolute Unix `pyright`, original `--outputjson` followed by one or
  more ASCII path arguments only. No flags/wrappers, no Unicode argv expansion, no rewriting.
  Unicode file paths are witnessed using an ASCII directory argument. Rules/messages/paths are generic.
- Native warning requires a report-style rule; native information has no rule. Exact schema,
  safe ordered zero-based ranges, grouped/ordered diagnostics, counts and canonical tokens are validated.
- Nonzero JSON remains exact. Plain/stats/verbose are mandatory retained captures, not reduction coverage.
- Lead review, registry/index integration and installed/default routing remain pending.
- No authenticated producer-collision boundary is claimed beyond direct native child capture.
- Bounded JSON implementation does not waive retained mandatory plain cases or complete campaign coverage.
- Prior interrupted script declared both `file` and `outputUtf8` per transport record. Recovery writes
  one raw file per case and a file-only manifest; receipt contains metadata, not duplicate raw text.
  Current artifact inspection reports `framingErrors: []`. No corpus integration is claimed.

Recovery artifact inspection uses `python3 fixtures/profiles/pyright/evidence.py`; it reads raw hashes,
EOF and framing and emits layout measurements. It is not a fixture-only test suite or a filter test.
That collector is historical and targets the original capture-only manifest; promotion uses the scoped
native manifest acceptance test instead. Acceptance names: success uses
`L08 real native JSON success retains independent golden and both LF`; other reductions use
`L08 real warning information and multifile Unicode tokens match independent goldens`;
all rows additionally use `L08 file-only native manifest authenticates hashes metadata EOF and selected-profile dispositions`.
