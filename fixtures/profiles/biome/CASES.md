# L02 Biome native captures

Capture-only packet at baseline `07ffe15e2263c2925778022194c5385807216603`.
`cases.json` uses `native-cases1`; commands are the actual direct Biome argv,
not the Node/Python capture driver. Original stdout/stderr share one real pipe.
All observations: exited, complete, presentation unknown. No byte normalization.

| ID (`L02/` prefix) | Native evidence | Disposition / savings policy |
| --- | --- | --- |
| check-clean | check success, file count, duration, no fixes | Exact informational summary; no-noise witness |
| lint-clean | lint success, file count, duration, no fixes | Exact informational summary; no-noise witness |
| format-clean | format success, file count, duration, no fixes | Exact informational summary; no-noise witness |
| lint-warning-advice | exit 0 warning + information, Unicode snippets, two fix suggestions | Retain diagnostics; grammar candidate only |
| check-warning-advice | same diagnostics through check, exit 0 | Retain diagnostics; grammar candidate only |
| lint-warning-failure | warning promoted to command failure by flag | Nonzero: exact |
| check-multifile-failure | three paths, warning/info/error/format diff, counts | Nonzero: exact |
| lint-error | debugger diagnostic, unsafe removal suggestion | Nonzero: exact |
| format-diff | formatter diff, failure summary | Nonzero: exact |
| check-parse-error | parse diagnostics and failed check | Nonzero: exact |
| check-write | safe useConst + formatting applied; before/after source | Exact informational summary; no-noise witness |
| format-write | formatter writes source; before/after source | Exact informational summary; no-noise witness |
| lint-json-warning | explicitly requested JSON; info/warning, locations, source, advice/diff operations | Exact machine evidence plus experimental warning |
| check-json-multifile | requested JSON with three-file errors/warnings/counts | Nonzero: exact |
| format-json-clean | requested JSON summary without diagnostics | Exact machine evidence; no-noise witness |
| format-json-diff | requested JSON formatter diagnostic and diff | Nonzero: exact |
| lint-write-unsafe | explicit unsafe lint fixes; before/after source | Exact informational summary; no-noise witness |
| lint-ansi-warning | forced ANSI with same warning/info and full snippets | Unknown presentation: preserve every ANSI byte |

Independent evidence: each case retains `biome.json`, input files under `before/`,
resulting files under `after/`, and complete combined `output.txt`. Hashes and byte
sizes reside in provenance. No expectedFile: no parser/golden claimed. Parser tests
and baseline red/green are deferred to implementation owner; capture mutation
probe checks hashes only, not production preservation behavior.

Required intact: all messages, diagnostic codes/categories/severities, positions,
paths, Unicode source/snippets, contextual advice/help, safe/unsafe fix labels and
diffs, machine fix operations, counts, source changes, and command-failure text.
Biome JSON location offsets are producer data; do not reinterpret them as HuGR
UTF-16 spans. Future profile spans must index the original output in UTF-16.

Proposed removable material: only decorative horizontal header rules and blank
layout lines in successful plain-text diagnostics, after complete grammar proves
all blocks, summary counts, boundaries and required spans. No grammar implemented;
admitted removable bytes and demonstrated savings are **0**. Timing and summaries
remain evidence. No ANSI stripping under unknown presentation. JSON is not a bare
JSON document: the experimental warning prefix and nonzero textual failure suffix
are part of original output.
