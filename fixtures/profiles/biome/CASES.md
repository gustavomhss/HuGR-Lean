# L02 Biome native captures

Capture baseline `07ffe15e2263c2925778022194c5385807216603`; implementation follows
lead-approved header-bar-only policy. `cases.json` uses `hugr-lean/native-cases/1`;
original full manifest is preserved verbatim in `capture-receipt.json`.
Each case links it through `provenance.captureReceipt`; `provenance.record` points
to `SOURCES.md`, and `provenance.sha256` copies the original output descriptor hash.
Commands are the actual direct Biome argv,
not the Node/Python capture driver. Original stdout/stderr share one real pipe.
All observations: exited, complete, presentation unknown. No byte normalization.

| ID (`L02/` prefix) | Native evidence | Disposition / savings policy |
| --- | --- | --- |
| check-clean | check success, file count, duration, no fixes | Exact informational summary; no-noise witness |
| lint-clean | lint success, file count, duration, no fixes | Exact informational summary; no-noise witness |
| format-clean | format success, file count, duration, no fixes | Exact informational summary; no-noise witness |
| lint-warning-advice | exit 0 warning + information, Unicode snippets, two fix suggestions | Reduced: two header bars only, 285 bytes |
| check-warning-advice | same diagnostics through check, exit 0 | Reduced: two header bars only, 285 bytes |
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
sizes reside in original receipt provenance. The two `expected.txt` files are
independently authored native goldens, deleting only header glyph runs of 55 and
40 characters. `tests/profile-biome.test.ts` verifies their exact original-source
complement and all prefix/body/footer required spans. Public custom filter with
empty profiles is the baseline; initial scaffold produced two real failing native
acceptance tests. The implemented custom family now passes those assertions.

Required intact: all messages, diagnostic codes/categories/severities, positions,
paths, Unicode source/snippets, contextual advice/help, safe/unsafe fix labels and
diffs, machine fix operations, counts, source changes, and command-failure text.
Biome JSON location offsets are producer data; do not reinterpret them as HuGR
UTF-16 spans. Future profile spans must index the original output in UTF-16.

Approved removable material: ONLY decorative terminal `━` runs in unindented
successful plain lint/check diagnostic headers. Prefix/category/position/FIXABLE,
all body rows, blank padding, source carets, help, fix diffs, counts and timing stay
exact. Whole grammar requires every block's info/warning primary, native layouts,
complete footer and consistent warning/file counts. Unknown lines/controls, ANSI,
CR, omitted diagnostics, pending blocks and repeated footers refuse. Named paths
are generic and distinct path count cannot exceed checked files; rules/messages
are not whitelisted. Information primaries have no separate summary count.

`familyProfiles` exports `biome`; registry remains lead-owned. Command identity
admits direct bare `biome` or structural absolute Unix executable ending `/biome`;
no Node/npx alias. Closed captured flags are recognized; only successful plain
check/lint without write/unsafe/reporter/forced-color are reducible. Explicit
`--colors=off` is optional, never injected. Presentation must be unknown so the
profile cannot reduce a core-normalized representation instead of original bytes.

Economy: both reduced native cases are 1577 -> 1292 UTF-8 bytes, saving 285 bytes
(95 glyphs); each removes the same two ordered source spans. Other 16 native cases
are exact, with zero economy. JSON is already compact; experimental prefix and
failure suffix make whole-output passthrough the approved safety disposition.
Clean summaries and silent output are no-noise witnesses, not fake reductions.
Provider `6b36dcd` JSON helper remains separate, unused and unedited.

Cold-review boundary fix after `ba5877f`: every diagnostic block must end with
exactly two blank rows in order: padded `  `, then empty. Missing padding and
extra terminal blank before either the next header or summary refuse whole output.
New before-fix witnesses both went red; native lint/check controls stayed green.
Reverting the boundary guard to its former permissive condition made both new
witnesses fail again; guard restored. Owned test file and typecheck rerun afterward.
Goldens, retained body/blank bytes and native byte economy remain unchanged.
