# L06 Pylint: capture-only packet

Base `71bcaea2d5f0bf72e9128ebf80517ad1099f6cdd`; branch `campaign/native-v2/L06`.
Producer: Pylint **4.0.4**, astroid **4.0.4**, Python **3.14.5**, one macOS x86_64 host.
`cases.json` uses `hugr-lean/native-cases/1`. All 41 cases are **passthrough**.
Each native input and independent exact expectation is the same `<ID>.txt` file.
No duplicate inline output, approved golden reduction, public-filter invocation, parser, test name,
baseline-red claim, or runtime support claim. This packet is native evidence pending independent review.

`capture-receipt.json` binds original finite `venv/bin/python -m pylint` argv (not rewritten to
`pylint`), exact environment/cwd, version/platform, source hashes, recipe hash, installation wheel
URLs/hashes, exits, merged EOF, UTF-8 byte sizes and raw SHA-256. Captures redirect stderr to stdout
before exec, read one binary pipe through EOF, then wait. No PTY, normalization or truncation.
Temporary source tree is deleted after capture; every original input remains under `inputs/`.
All candidate/license/bootstrap `.txt` artifacts are noninputs explicitly listed as archive path strings.

## Coverage ledger

All suffixes below use prefix `L06-`; file is `<full-ID>.txt`. Every row preserves exact bytes,
including nonzero exits. Native diagnostic positions remain producer values, not converted spans.
Source associations and required evidence are available directly in raw files and input hash ledger.

| ID suffix | Required variant and retained evidence |
| --- | --- |
| version | Pylint, astroid and Python version/platform output |
| help | Requested CLI options, output-format choices, score and reports descriptions |
| native-clean | Default text, successful score 10.00/10, separator and terminal blank line |
| native-errors | E0602 undefined-variable, exact message/object/path/line/column; score; exit 2 |
| native-warnings | W0613 unused-argument and W0611 unused-import; score; exit 4 |
| native-multifile | Separate module headings, errors/warnings bound to two files; exit 6 |
| native-unicode-space | Unicode/space path, W2402 filename warning; astral character before E0602 column 26; exit 6 |
| native-syntax | E0001 syntax-error, native position/message; exit 2 |
| native-missing-file | F0001 fatal missing-input message; exit 1 |
| score-disabled | Explicit --score=no, diagnostics retained; exit 4 |
| reports-clean | Explicit --reports=yes; statements, type counts/documentation, raw metrics, duplication, category/module/message tables, score |
| reports-multifile | Two-file diagnostics and all requested report tables; exit 6 |
| reports-exit-zero | Same diagnostic/report evidence with explicit --exit-zero; tables retained in full |
| config | Explicit good rcfile disables only named warnings; successful score |
| config-fail | Malformed TOML produces F0011 config-parse-error plus score; **observed exit 0** |
| config-missing | Missing explicit rcfile error; exit 32 |
| invalid-format | Unsupported reporter traceback/failure; exit 1, full merged traceback retained |
| native-exit-zero | Errors/warnings plus score on explicit exit-zero command |
| plugin-native | Real loaded plugin prints fake native module/diagnostic/score/JSON-looking rows before genuine clean score; exit 0 |
| plugin-native-exit-zero | Same collision with explicit --exit-zero; arbitrary plugin output retained |
| plugin-missing | E0013 bad-plugin-value and import exception text; **observed exit 0** |
| json-clean | Explicit JSON array, `[]` plus LF; already compact, exit 0 |
| json-errors | JSON E0602; severity/module/object/line/column/endLine/endColumn/path/symbol/message/message-id; exit 2 |
| json-warnings | Two warning objects with complete native fields; exit 4 |
| json-multifile | Three messages, two-file identities and native order; exit 6 |
| json-unicode-space | Unicode/space path, both diagnostics, native start/end positions; exit 6 |
| json-syntax | Syntax diagnostic with null end positions; exit 2 |
| json-exit-zero | Three messages under explicit --exit-zero; every token retained in unapproved layout proposal |
| json-reports | Explicit JSON plus --reports=yes/--exit-zero; producer emits message array, **no text report tables or JSON2 statistics** |
| json-config-fail | F0011 configuration diagnostic in explicit JSON; observed exit 0, exact only |
| json-plugin | Plugin stdout precedes genuine JSON; entire merged boundary is mixed text, not one JSON document |
| json2-clean | Distinct object: messages and statistics with category counts/modulesLinted/score; exit 0 |
| json2-errors | E0602 plus confidence and absolutePath; statistics; exit 2 |
| json2-warnings | Both warning objects, confidence/absolute paths/counts/score; exit 4 |
| json2-multifile | Three diagnostic objects, two absolute paths, complete statistics; exit 6 |
| json2-unicode-space | Unicode path/absolutePath, native positions and category counts; exit 6 |
| json2-syntax | Syntax diagnostic/null end positions plus statistics; exit 2 |
| json2-exit-zero | Three complete diagnostics plus statistics under explicit --exit-zero |
| json2-reports | Explicit JSON2 with requested reports; messages/statistics, no text report tables |
| json2-config-fail | F0011 configuration diagnostic and statistics; observed exit 0, exact only |
| json2-plugin | Native-shaped plugin stdout before JSON2 object; whole merged boundary retained |

JSON2 `modulesLinted` is copied exactly as emitted (e.g. 5 for the two-file witness); this packet
does not repair, infer or validate a different meaning for that native metric. Native Unicode columns
and JSON string escapes likewise remain untouched. Nonzero outputs have no candidate reduction.

## Candidates and byte accounting

Approved savings: **0 UTF-8 bytes**. Five **unapproved** lexical-layout candidates save **2,035 bytes**
over their specific captured inputs. All JSON token spelling/order, field names, messages, paths,
positions, numeric spelling, arrays/objects and exact terminal whitespace remain intact.
Candidates are archives, not input declarations or expected goldens. No policy approval is inferred.

| Case suffix | Native bytes | Candidate bytes | Proposed savings |
| --- | ---: | ---: | ---: |
| json-exit-zero | 1,003 | 642 | 361 |
| json-reports | 668 | 427 | 241 |
| json2-clean | 293 | 152 | 141 |
| json2-exit-zero | 1,976 | 1,230 | 746 |
| json2-reports | 1,432 | 886 | 546 |

Recipe's measured positive control removes seven lexical whitespace bytes, retains escaped quote,
string spaces, `1e+02` numeric spelling and two-LF suffix, and remains JSON-value identical. Receipt
records exact control hex. Actual candidate output is source-token compaction, not JSON reserialization.
No candidate is made for config diagnostics, mixed plugin streams, native tables, or any nonzero output.

## Provenance, failure archive and reproduction

Pinned upstream tag `v4.0.4` resolved via GitHub git-ref API to
`e16f942166511d6fb4427e503a734152fae0c4fe`. `LICENSE.pylint.txt` copies that commit's `LICENSE`
verbatim: **GPL-2.0-or-later**. Receipt records immutable URL/path/hash and modification record.
No runtime donor code copied. Original recipe, tiny input modules and collision plugin use repository MIT.
`install-report.json` records public PyPI wheel URLs and SHA-256 for every installed dependency.
Wheel-to-upstream build correspondence is not independently attested; source pin is not a build proof.

Initial recipe attempt used input filename `warnings.py` on PYTHONPATH. It shadowed Python's stdlib
warnings module during astroid import; `--version` exited 1. Exact 2,415-byte merged traceback remains
in `L06-bootstrap-shadow.txt` as a noninput failure archive. Filename was corrected to `warning_case.py`.
That failed attempt did not finish its manifest/receipt; its exact temp cwd and recipe hash were not saved,
so it is **not** presented as a fully bound native case. Its traceback and reason remain explicit.

Create an isolated venv outside the worktree, install this packet's exact dependency pins with a pip
report, then run the native collector (replace both absolute paths with that venv and report):

```sh
python3 -m venv /absolute/scratch/L06-pylint-venv
/absolute/scratch/L06-pylint-venv/bin/python -m pip install --report /absolute/scratch/L06-install.json -r fixtures/profiles/pylint/requirements.lock
/absolute/scratch/L06-pylint-venv/bin/python fixtures/profiles/pylint/capture.py --python /absolute/scratch/L06-pylint-venv/bin/python --install-report /absolute/scratch/L06-install.json
```

Collector overwrites this packet's generated artifacts only; source and absolute temp paths vary on replay,
so byte-identical JSON2 replay requires the original path boundary. Sources/argv/hashes support comparison
without claiming cross-host identity. Bootstrap failure archive is historical, not regenerated.

## Blockers and framing

Independent capture review and corpus promotion remain pending. JSON and JSON2 require separate future
grammar/policy decisions; lexical candidates are not implemented savings. Human-approved exact ambiguity
scope applies only to documented native-shaped plugin/reporter collisions, not a waiver for safe formats,
missing variants or unimplemented reductions. Most native diagnostics exit nonzero and must stay exact.
Clean native output contains meaningful score; requested reports contain metrics, not removable progress.
Framing diagnostic/table deletion as reduction is wrong; bounded JSON whitespace is the only proposal here.

Coverage is finite: one version, host, Python-module launcher, single-worker analysis, these project inputs
and argv combinations. No all-version/all-plugin/all-reporter/all-config grammar, PTY, parallel interleaving,
Windows/Linux or producer-authentication claim. No parser/core/test/shared changes; no tests, typecheck,
fullsuite, build, smoke, benchmark, CI dispatch or merge performed. Stop at capture PR for lead review.
