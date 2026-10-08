# G01 capture-only acceptance packet

State: implementation under review for literal selectors; anchored-command admission blocked.
Frozen seam: `goMode` text; JSON and benchmark belong to G02/G03.
Manifest family remains `go-test-verbose` per packet contract, including nonverbose commands.
For initial anchored captures, `status` still describes the preserved proposed independent golden,
not current public-filter results. Literal supplemental reductions have focused public-filter proof.
Only owned parser/test files and this fixture directory changed; original `go.ts` delegates unchanged.
Initial table test names describe acceptance intentions; focused assertions live in
`tests/profile-go-test-text.test.ts`.

## Delta cases

Files are `<id>.txt` and independently authored `<id>.expected.txt` below this directory.
Each full stable ID is `G01/<id>`. Byte counts are UTF-8, including final LF.

| ID | Required variant / combination | Required evidence | Proposed disposition / reason | Input → expected; removable bytes | Future test name |
| --- | --- | --- | --- | --- | --- |
| default | `go test`, nonverbose local package mode | PASS and package/time summary | passthrough: no removable material | 33 → 33; 0 | G01 default summary exact |
| selector | split `-run`, slash selector, explicit `.` | PASS and package/time summary | reduced: all selected tests quiet | 231 → 33; 198 | G01 slash selector quiet reduction |
| nested | inline `-run`, two subtest levels and skip | parent/group/skip RUN/results, exact skip reason/source, PASS/package summary | reduced: quiet sibling only | 366 → 284; 82 | G01 nested skip association |
| parallel | `-parallel 2`, nested parallel lifecycle/interleaving | both exact linked worker logs, parent/child RUN/PAUSE/CONT/results, PASS/package summary | passthrough: no removable material under association policy | 422 → 422; 0 | G01 parallel linked logs exact |
| race-cover-count-run | `-v -race -cover -count=2 -run=... .` | PASS, both coverage records, exact package/time/coverage summary | reduced: two quiet iterations | 191 → 95; 96 | G01 race coverage repeated iterations |
| count | split `-count 2` and split slash `-run` | final PASS/package summary; repeated quiet scopes validated before removal | reduced: both complete quiet nested iterations | 429 → 33; 396 | G01 count nested name reuse |
| cover-default | nonverbose `-cover` with selector | entire package/time/coverage summary | passthrough: no removable material | 59 → 59; 0 | G01 nonverbose coverage exact |
| collision | `t.Log` with RUN/PASS/package and PAUSE/CONT shapes | entire linked multiline logs and enclosing real RUN/result/PASS/package | passthrough: unsafe-to-remove collision evidence, not a no-material waiver | 318 → 318; 0 | G01 progress-shaped linked log collision |
| selector-empty | selector matches nothing | warning, PASS, package/time `[no tests to run]` | passthrough: no removable material | 85 → 85; 0 | G01 empty selector warning exact |

## Required / removable policy proposal

- Retain every package summary exactly: package identity, elapsed time, cache marker and requested
  metrics are evidence. Retain final PASS, coverage records, warning and empty-selection marker.
- Retain skip reason and its source position exactly, with enclosing test/subtest RUN/result and
  ancestor chain. Remove only the complete quiet sibling scope. Never flatten skip association.
- Retain every linked diagnostic/log line exactly, including multiline indentation and progress-shaped
  contents. Retain the real enclosing lifecycle/result. Indentation/source linkage is evidence;
  text matching RUN/PASS/CONT is not proof that a log is removable runner progress.
- Parallel CONT changes active diagnostic scope. Preserve both workers' observed lifecycle and
  source-linked logs in original order; do not regroup by child or sort result lines.
  This fixture's every scope carries a log or protects its ancestor association, so it has zero
  removable bytes under this conservative policy. It does not prove quiet-parallel reduction.
- `-count` repeats names legitimately. Validate each complete occurrence separately; never treat
  repeated names as duplicate corruption or deduplicate native evidence.
- Quiet successful scopes may be omitted only after full grammar/lifecycle validation, with exact
  required rows remaining in source order and strictly fewer bytes. No synthetic dynamic summaries.
- Collision witness is an unsafe-removal refusal/retention case, distinct from summary-only zero
  material. Source proves these are user logs; a parser that strips indentation and treats them as
  native progress loses required evidence. Unbound/ambiguous material requires full passthrough.
- Failed, incomplete, truncated, unknown or inconsistent output remains byte-exact. These captures
  are successful complete witnesses, not additional failure/truncation coverage.

## Preserved baseline associations (reuse only)

`../../utility/go/manifest.json` and its `SOURCES.md` remain regression anchors: serial verbose
`go test -v ./...`, multiple packages, cached packages, no-test packages, linked diagnostics and
failure/opaque exact output. Reuse `captures/cold/` and existing manifest cases; do not recapture
or clone them. Existing disposition is BASELINE_PRESERVED, not new G01 reduction evidence.

## Review and deferred work

Native source and exact capture facts are in `SOURCES.md` and `cases.json`. Goldens are source-backed
ordered subsets, with exact originals for passthrough. Proposed reduction byte savings are fixture
deltas. Literal supplemental native fixtures are now compared against the public custom-profile filter
and the original `goProfile` baseline. Exact-only captures do not substitute for mandatory reductions.
The anchored commands cannot reach a profile: frozen `tokenizeCommand` rejects `^` and `$` even quoted.
No core edit or human scope waiver recorded. Lead must resolve this precise seam/scope blocker.

## Approved implementation policy and supplemental acceptance

Lead approval: reduce validated quiet completed scopes only; retain entire log/skip/ancestor linked
lifecycle exact. Logged parallel exact fixtures are preservation witnesses, not compression proof.

| Stable ID | Captured variant | Required evidence / actual disposition | UTF-8 input → expected; removable |
| --- | --- | --- | --- |
| G01/literal-selector | split literal slash `-run`, `.` | PASS/package summary; reduced | 231 → 33; 198 |
| G01/literal-nested | literal `-run=TestNested`, nested skip | skip/log/ancestors exact; quiet sibling reduced | 367 → 285; 82 |
| G01/literal-race-cover-count-run | literal run, race+cover+count=2 | PASS/both coverage records/package exact; quiet occurrences reduced | 192 → 96; 96 |
| G01/literal-count | split count=2 and literal slash run | PASS/package exact; complete repeated scopes reduced | 430 → 34; 396 |
| G01/literal-collision | literal selector, linked progress-shaped t.Log | all log/lifecycle exact; passthrough unsafe-removal witness | 318 → 318; 0 |
| G01/quiet-parallel | literal selector, parallel=2 | PASS/package exact; complete quiet parallel scopes reduced | 377 → 33; 344 |
| G01/mixed-parallel | literal prefix selects logged+quiet parallel roots | entire logged root/lifecycle retained chronologically; quiet root reduced | 766 → 422; 344 |
| G01/name-switch | native NAME context with anchored selector | native log context exact; core-blocked passthrough | 450 → 450; 0 |

Closed delta argv uses only literal captured selectors, bare `-v/-race/-cover`, count 1/2 and parallel 2.
Split and inline valued flags are validated; duplicates, missing/unknown values, extra positionals and
uncaptured combinations refuse. Race requires the captured verbose cover/count=2/quiet combination.
Coverage-only nonverbose has no removable material. JSON/bench routing is frozen and excluded.

Parser validates RUN parent paths, child creation, pause/resume/NAME active scopes, indentation,
parent-first result closure, serial sibling result order, complete repeated count occurrences, final
PASS/package boundaries and matching coverage records. Results and linked source rows stay in observed
order. Dynamic material is emitted only through ordered UTF-16 source spans. No log sorting/dedup.

Unseen Example/Fuzz, top-level parallel tests, cached delta summaries, extra delta packages, new selectors,
unknown lines and invalid lifecycle transitions remain exact. Existing serial/cache/./... admission
comes exclusively from the unchanged original delegate and reused utility fixtures.

## Focused verification receipt

- `npx --no-install tsx --test tests/profile-go-test-text.test.ts`: 34 passed, zero skipped,
  after production mutations were restored. Six native positive fixtures prove baseline original
  `goProfile` refusal followed by exact independent-golden reduction through public custom profiles.
- Production evidence probe: changed `protect` to set `keep=false`; targeted native nested,
  mixed-parallel and Unicode/progress-linked tests all failed on missing actual golden evidence.
- Production admission probe: bypassed the all-scopes-ended predicate; targeted closure test failed
  when an unfinished parallel child was reduced. Both source edits restored via patch before rerun.
- `npm run typecheck` passed initially and after restoration. One post-restoration parallel invocation
  timed out at 120 seconds; explicit retry with 240-second allowance exited 0. No timeout concealed.
- Existing utility manifest cases compare original and extended public-filter results exactly.
  Native corpus checks bind output SHA-256, file correspondence and independent ordered goldens.
- No full tests/build/smoke/benchmark or CI dispatch. No claim of default registry extension or
  universal Go grammar. Lead cold-check and anchored-command seam decision remain required.
