# G01 capture-only acceptance packet

State: CAPTURED. Frozen seam: `goMode` text; JSON and benchmark belong to G02/G03.
Manifest family remains `go-test-verbose` per packet contract, including nonverbose commands.
`status` describes the proposed independent golden, not current public-filter results.
No parser, registry, legacy test or shared-file changes. No admission/red-to-green claim.
Test names below reserve future focused acceptance assertions; none exist in this capture PR.

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
deltas, not measured public-filter savings. Parser admission, focused acceptance tests and their
preservation mutation probes are deferred to lead-approved implementation work. Exact-only captures
do not substitute for unimplemented mandatory reduction coverage; no human scope waiver recorded.
