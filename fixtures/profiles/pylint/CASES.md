# L06 Pylint: bounded explicit JSON layout

Base `71bcaea2d5f0bf72e9128ebf80517ad1099f6cdd`; branch `campaign/native-v2/L06`.
Producer: Pylint **4.0.4**, astroid **4.0.4**, Python **3.14.5**, one macOS x86_64 host.
`cases.json` uses `hugr-lean/native-cases/1`: four safely reduced canonical JSON/JSON2 captures,
37 passthrough cases. Native inputs remain `<ID>.txt`; four independent `<ID>.golden.txt` expectations
copy the original lexical-scanner candidates byte-for-byte. All other expectations remain exact inputs.
No duplicate inline output. Pure `pylintProfile` is tested through public `filter` with an explicit
selected-profile list; default registry and corpus promotion remain lead-owned and pending.
Original capture checkpoint `15e25d7aa91bb382772a5c6b90d288592d8a3b1a` and its raw/source/recipe/provenance
are unchanged. `promotion-receipt.json` records golden origins, hashes, bytes and the blocked fifth case.

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
| json-exit-zero | **Reduced:** three messages under explicit --exit-zero; every token retained; 361 bytes |
| json-reports | **Reduced:** explicit JSON plus --reports=yes/--exit-zero; message array, **no text report tables or JSON2 statistics**; 241 bytes |
| json-config-fail | F0011 configuration diagnostic in explicit JSON; observed exit 0, exact only |
| json-plugin | Plugin stdout precedes genuine JSON; entire merged boundary is mixed text, not one JSON document |
| json2-clean | **Passthrough, blocked:** distinct object/counts/modulesLinted/score; native `10.0` violates frozen helper's canonical-number subset |
| json2-errors | E0602 plus confidence and absolutePath; statistics; exit 2 |
| json2-warnings | Both warning objects, confidence/absolute paths/counts/score; exit 4 |
| json2-multifile | Three diagnostic objects, two absolute paths, complete statistics; exit 6 |
| json2-unicode-space | Unicode path/absolutePath, native positions and category counts; exit 6 |
| json2-syntax | Syntax diagnostic/null end positions plus statistics; exit 2 |
| json2-exit-zero | **Reduced:** three complete diagnostics/statistics under explicit --exit-zero; 746 bytes |
| json2-reports | **Reduced:** explicit JSON2 reports; messages/statistics, no text tables; 546 bytes |
| json2-config-fail | F0011 configuration diagnostic and statistics; observed exit 0, exact only |
| json2-plugin | Native-shaped plugin stdout before JSON2 object; whole merged boundary retained |

JSON2 `modulesLinted` is copied exactly as emitted (e.g. 5 for the two-file witness); this packet
does not repair, infer or validate a different meaning for that native metric. Native Unicode columns
and JSON string escapes likewise remain untouched. Nonzero outputs have no candidate reduction.

## Candidates and byte accounting

Four approved safely reduced captures save **1,894 UTF-8 bytes** under the user's bounded JSON policy.
The original five capture-only proposals totaled 2,035 bytes. The fifth's 141 bytes remain blocked:
`L06-json2-clean` emits score `10.0`, which frozen `jsonLayout` refuses rather than rewrite to `10`.
Calling all five eligible conflicts with the frozen helper and noncanonical-number refusal requirement.
All JSON token spelling/order, field names, messages, paths,
positions, numeric spelling, arrays/objects and exact terminal whitespace remain intact.
Historical `.candidate.txt` files remain unchanged archives, never input declarations. Four approved
independent `.golden.txt` files are explicit manifest expectations; candidate receipt statuses remain
historical capture-only facts, not current dispositions. No fifth-case waiver or helper change inferred.

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

Independent lead review, registry wiring and corpus promotion remain pending. Fifth-case eligibility
requires a lead policy/helper decision; this branch preserves its noncanonical native score exactly.
Implemented JSON and JSON2 schemas are distinct closed objects/keys/types. Human-approved exact ambiguity
scope applies only to documented native-shaped plugin/reporter collisions, not a waiver for safe formats,
missing variants or unimplemented reductions. Most native diagnostics exit nonzero and must stay exact.
Clean native output contains meaningful score; requested reports contain metrics, not removable progress.
Framing diagnostic/table deletion as reduction is wrong; bounded JSON whitespace is the only proposal here.

Coverage is finite: one pinned version/host, witnessed direct and Python-module launchers, single-worker analysis, these project inputs
and argv combinations. No all-version/all-plugin/all-reporter/all-config grammar, PTY, parallel interleaving,
Windows/Linux or producer-authentication claim. JSON carries no runtime version identity; the profile
recognizes the bounded captured 4.0.4 grammar, not an authenticated installed producer/version.
Only owned profile/test/fixtures changed. Focused checks/mutations and once-only closure typing are
recorded in `CHECKS.md`; no whole-package checks, build, smoke, benchmark, CI or merge. Stop at PR #109.

## Bounded grammar and launcher reach

Only explicit `--output-format=json` or `--output-format=json2`, one format occurrence, flags before
one or more literal ASCII `.py` operands. Optional witnessed equal-form flags: `--rcfile=<literal path>`,
`--persistent=no`, `--jobs=1`, `--exit-zero`, `--reports=yes`, each once. Unknown flags, verbose metrics,
plugin flags, evaluation overrides, chains/assignments/wrappers/watch, Unicode command tokens and
relative executable launchers refuse. Existing core tokenizer alone handles command spelling.
Direct `pylint` or absolute path ending `/pylint`; module `python`/`python3` or absolute path ending
`/python`/`/python3`, followed by literal `-m pylint`. Versioned Python executable names are unclaimed.
`launcher-receipt.json` adds four native direct/literal-module witnesses and exact noninput archives,
with original argv/executable resolution/version/platform/cwd/environment/exit/EOF/hash/recipe evidence.
`capture-launchers.py` does not alter original captures.

JSON is an array of complete old diagnostic keys; JSON2 is messages/statistics with complete new keys,
confidence and absolute paths. Unknown/missing/duplicate fields, duplicate diagnostics, unsupported
fatal/config paths, incoherent severity/code, unsafe positions or end-range pairs, inconsistent path/
module/absolute-path associations or native grouping refuse. JSON2 counts exactly match each diagnostic
category, modulesLinted is a positive safe integer covering distinct diagnostic modules, score is finite
0..10 with a feasible default evaluation. JSON2 does not export statement count: no exact statement
total or exact count of clean modules is invented. Fully consistent custom evaluations are not detected
as producer identity; every metric token is nevertheless retained. Noncanonical escapes/numbers refuse.
Pinned source paths and independent-oracle reach are recorded in `SOURCES.md`.

Frozen `jsonLayout` strips only outside-string lexical whitespace, then canonical round-trip checking
refuses duplicate/noncanonical spellings. Profile appends the exact whole trailing JSON whitespace
source span; suffix must end in LF. String content, all punctuation and scalar tokens, native ordering,
numeric spelling and EOF are required source spans in UTF-16. UTF-8 byte savings must be strictly positive.
Missing LF, compact output, nonzero/unknown/truncated observations, non-shell source, rendered terminal,
prefix/suffix/config/plugin mixed streams and complete verbose text reports remain exact.
New reductions use acceptance `L06 native canonical candidates match independent captured goldens`;
all 41 source-bound dispositions use `L06 manifest binds immutable native sources hashes metadata and dispositions`.
