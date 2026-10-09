# G01 native text acceptance packet

State: stronger ambiguous-tree preservation implementation under lead review.
Current policy supersedes historical quiet-child/quiet-parallel removal receipts below.
Frozen seam: `goMode` text; JSON and benchmark belong to G02/G03.
Manifest family remains `go-test-verbose` per packet contract, including nonverbose commands.
Every manifest `status` and `expectedFile` now describes actual public custom-profile filter behavior.
Shorter original proposals are historical files only, linked separately through `historicalProposalFile`.
Only owned parser/test files and this fixture directory changed; original `go.ts` delegates unchanged.
Initial table test names describe acceptance intentions; focused assertions live in
`tests/profile-go-test-text.test.ts`.

## Delta cases

Files are `<id>.txt` and independently authored `<id>.expected.txt` below this directory.
Each full stable ID is `G01/<id>`. Byte counts are UTF-8, including final LF.

| ID | Required variant / combination | Required evidence | Actual disposition / reason | Input → expected; removable bytes | Acceptance intent |
| --- | --- | --- | --- | --- | --- |
| default | `go test`, nonverbose local package mode | PASS and package/time summary | passthrough: no removable material | 33 → 33; 0 | G01 default summary exact |
| selector | anchored split `-run`, slash selector, explicit `.` | complete original | passthrough: unsupported command | 231 → 231; 0 | G01 anchored selector negative |
| nested | anchored inline `-run`, two subtest levels and skip | complete original | passthrough: unsupported command | 366 → 366; 0 | G01 anchored nested negative |
| parallel | anchored selector, parallel linked lifecycle | complete original | passthrough: unsupported command; logged lifecycle also has no removable scope | 422 → 422; 0 | G01 parallel linked logs exact |
| race-cover-count-run | anchored selector with race/cover/count | complete original | passthrough: unsupported command | 191 → 191; 0 | G01 anchored combination negative |
| count | anchored split count and slash run | complete original | passthrough: unsupported command | 429 → 429; 0 | G01 anchored count negative |
| cover-default | nonverbose coverage, anchored selector | complete original | passthrough: unsupported command | 59 → 59; 0 | G01 anchored coverage negative |
| collision | anchored selector, linked progress-shaped t.Log | complete original | passthrough: unsupported command; linked log removal also unsafe | 318 → 318; 0 | G01 anchored collision negative |
| selector-empty | anchored selector matches nothing | complete original | passthrough: unsupported command | 85 → 85; 0 | G01 anchored empty selector negative |

## Approved required / removable policy

- Retain every package summary exactly: package identity, elapsed time, cache marker and requested
  metrics are evidence. Retain final PASS, coverage records, warning and empty-selection marker.
- Retain every entire enclosing nested/parallel tree, including quiet siblings, in original order.
  Raw stdout can emit the identical child RUN/result tuple as a native subtest. Producer identity is
  ambiguous: no decoder can distinguish identical bytes. This is ambiguous-retention, not no noise.
- Retain skip reason/source and every linked log exactly; nested-tree protection preserves all
  ancestor, child, header and result rows. Quiet flat roots unrelated to that tree may still be removed.
- Retain every linked diagnostic/log line exactly, including multiline indentation and progress-shaped
  contents. Retain the real enclosing lifecycle/result. Indentation/source linkage is evidence;
  text matching RUN/PASS/CONT is not proof that a log is removable runner progress.
- Parallel CONT changes active diagnostic scope. Preserve both workers' observed lifecycle and
  source-linked logs in original order; do not regroup by child or sort result lines.
  This fixture's every scope carries a log or protects its ancestor association, so it has zero
  removable bytes under this conservative policy. It does not prove quiet-parallel reduction.
- `-count` repeats names legitimately. Validate each complete occurrence separately; never treat
  repeated names as duplicate corruption or deduplicate native evidence.
- Only quiet successful FLAT roots may be omitted after full grammar/lifecycle validation, with exact
  required rows remaining in source order and strictly fewer bytes. No synthetic dynamic summaries.
- Collision witness is an unsafe-removal refusal/retention case, distinct from summary-only zero
  material. Source proves these are user logs; a parser that strips indentation and treats them as
  native progress loses required evidence. Unrecognized unbound lines require full passthrough;
  structurally valid ambiguous nested/parallel material requires retention of the entire enclosing tree.
- Failed, incomplete, truncated, unknown or inconsistent output remains byte-exact. These captures
  are successful complete witnesses, not additional failure/truncation coverage.

## Preserved baseline associations (reuse only)

`../../utility/go/manifest.json` and its `SOURCES.md` remain regression anchors: serial verbose
`go test -v ./...`, multiple packages, cached packages, no-test packages, linked diagnostics and
failure/opaque exact output. Reuse `captures/cold/` and existing manifest cases; do not recapture
or clone them. Existing disposition is BASELINE_PRESERVED, not new G01 reduction evidence.

## Review and command boundary

Native source and exact capture facts are in `SOURCES.md` and `cases.json`. Goldens are source-backed
ordered subsets, with exact originals for passthrough. Reduction byte savings are fixture
deltas. Literal supplemental native fixtures are now compared against the public custom-profile filter
and the original `goProfile` baseline. Exact-only captures do not substitute for mandatory reductions.
The anchored commands cannot reach a profile: frozen `tokenizeCommand` rejects `^` and `$` even quoted.
These are unsupported-command negative witnesses outside the campaign literal contract, not mandatory
reduction waivers. No core tokenizer change is requested. Their four former smaller goldens remain
historical `.proposal.txt` files only; the manifest and runtime expected files are exact passthrough.

## Approved implementation policy and supplemental acceptance

Latest lead approval: preserve entire ambiguous nested/parallel trees; reduce unrelated validated quiet
flat roots. Retain all linked log/skip evidence. No stdout authenticity claim follows from grammar.

| Stable ID | Captured variant | Required evidence / actual disposition | UTF-8 input → expected; removable |
| --- | --- | --- | --- |
| G01/literal-selector | split literal slash `-run`, `.` | entire ambiguous nested tree; passthrough | 231 → 231; 0 |
| G01/literal-nested | literal `-run=TestNested`, nested skip | entire ambiguous tree/skip/log; passthrough | 367 → 367; 0 |
| G01/literal-race-cover-count-run | literal run, race+cover+count=2 | PASS/both coverage records/package exact; quiet occurrences reduced | 192 → 96; 96 |
| G01/literal-count | split count=2 and literal slash run | complete repeated ambiguous trees; passthrough | 430 → 430; 0 |
| G01/literal-collision | literal selector, linked progress-shaped t.Log | all log/lifecycle exact; passthrough unsafe-removal witness | 318 → 318; 0 |
| G01/quiet-parallel | literal selector, parallel=2 | entire ambiguous parallel tree; passthrough | 377 → 377; 0 |
| G01/mixed-parallel | literal prefix selects logged+quiet parallel roots | both entire ambiguous trees; passthrough | 766 → 766; 0 |
| G01/name-switch | native NAME context with anchored selector | native log context exact; core-blocked passthrough | 450 → 450; 0 |
| G01/raw-stdout-tree | native raw fmt.Printf tuple plus real flat root | raw tree retained; unrelated flat root reduced | 215 → 159; 56 |
| G01/common-nested-flat | `go test -v .`, real nested plus flat roots | native tree retained; unrelated flat root reduced | 215 → 159; 56 |
| G01/common-local-nested-flat | `go test -v`, real nested plus flat roots | native tree retained; unrelated flat root reduced | 215 → 159; 56 |

Closed delta argv uses structural ASCII literal selectors, bare `-v/-race/-cover`, count 1–100 and
parallel 1–256. Selectors are nonempty slash-separated `[A-Za-z0-9_][A-Za-z0-9_-]*` components.
Go's unanchored literal matching is substring-based at each path level; matching ancestors remain
eligible so native child discovery works. Selection derives entirely from argv, never fixture names.
Split and inline valued flags are validated; duplicates, missing/unknown values, extra positionals and
nonliteral selectors refuse. Race/coverage/parallel/count combinations are name-independent; count
occurrences and coverage output must agree with flags. Absent `-run` selects all supported test names.
Summary-only nonverbose has no removable material. JSON/bench routing is frozen and excluded.

Parser validates RUN parent paths, child creation, pause/resume/NAME active scopes, indentation,
parent-first result closure, serial sibling result order, complete repeated count occurrences, final
PASS/package boundaries and matching coverage records. Results and linked source rows stay in observed
order. Dynamic material is emitted only through ordered UTF-16 source spans. No log sorting/dedup.
Root registration sequence is validated across count rounds, not merely counted per name.
Original delegate SUCCESS is returned unchanged. On decline, common `go test -v` / `go test -v .`
can reach the new full grammar with original argv. No argv rewriting or legacy parser changes.

Unseen Example/Fuzz, top-level parallel tests, cached delta summaries, extra delta packages, regex selectors,
unknown lines and invalid lifecycle transitions remain exact. Existing serial/cache/./... admission
comes exclusively from the unchanged original delegate and reused utility fixtures.

## Prior implementation verification receipt

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
  universal Go grammar. Lead cold-check remains required; no tokenizer change or scope waiver is requested.

## Historical selector FIX-FIRST receipt (quiet-tree economy superseded)

- Added explicit synthetic renamed properties before changing production code. The renamed selector
  `go test -v -run TestLedger/group/quiet .` failed: actual passthrough versus required reduction.
- Replaced all test-name branches with structural literal selector parsing, substring path selection,
  bounded canonical positive integers and independent flags. Renamed nested/skip/log/parallel scopes
  and race/coverage combinations use three unrelated roots; partial literal path matching is covered.
- Synthetic repetitions cover count 1, 3 and 100; parallel values 1, 3 and 256 are accepted; out-of-bound,
  zero, noncanonical or unsafe integers are rejected at matcher admission.
- Every manifest case now checks public-filter status and exact emitted golden. Initial anchored
  cases have full-original expected files. Four prior smaller proposals are archived separately.
- Original serial/cache captures reused, not recaptured. Native positive supplemental goldens unchanged.
- Corrected focused suite: 36 passed, zero skipped after fresh production mutations were restored;
  `npm run typecheck` exited 0. Every manifest runtime disposition and expected file was asserted.
- Fresh admission mutation removed the numeric maximum; matcher test failed on admitted `-count=101`.
  Fresh evidence mutation set ancestor protection to `keep=false`; nested and mixed-parallel native
  golden tests both failed on actual lost evidence. Both edits restored before final suite/typecheck.
- The four historical proposals were compared byte-exact with their prior committed goldens at
  `2a521f4`. This correction introduces no new native captures or tokenizer/registry/shared changes.

## P1 count-round receipt (validation retained; quiet Beta is now a flat root)

- Independent synthetic complete-root transcript `Alpha,Alpha,Beta,Beta` with `-count=2 -run Test`
  failed before the fix: public filter reduced instead of preserving the malformed disjoint loops.
- Root RUN registrations establish first-round order. First repetition freezes that sequence; every
  subsequent round must repeat it exactly, with the requested number of complete rounds. Duplicate,
  reordered, incomplete or extra registrations refuse. Child maps remain occurrence-local.
- Ordered `Alpha,Beta,Alpha,Beta` positive retains both linked Alpha child occurrences chronologically
  while removing quiet Beta scopes. No event sorting or native recapture is involved.
- Production probe removed the expected-root order comparison. Reordered `Alpha,Beta,Beta,Alpha`
  then reduced and the negative assertion failed. Guard restored before verification.
- Corrected owned suite: 38 passed, zero skipped; typecheck exited 0 after restoration. Existing
  manifests, native goldens, original delegate and top-level-parallel refusal scope remain intact.

## Latest ambiguity review correction and honesty boundary

- Genuine native raw-stdout capture failed before fix: complete fmt.Printf tree was lost as progress.
  Genuine common `go test -v .` capture also failed before fix: wrapper stopped at legacy decline.
- Raw `TestMain` prints a complete parent/child tuple before running a real flat test. Another tiny
  native project emits the identical tuple through `testing.T.Run`; exact bytes are compared in tests.
  Both trees survive. Synthetic tree-only versions stay byte-exact; only unrelated flat root is removed.
- Five formerly smaller supplemental goldens are archived in `.proposal.txt` files linked separately.
  Actual statuses and expected files for those ambiguous-only cases are now complete originals.
  They are retention witnesses, not compression/no-removable-material claims. All manifest cases
  assert actual public-filter status and output; race/cover/count flat-root reduction remains native proof.
- Residual authenticity limit: raw `TestMain` or another source can fabricate an entire well-formed
  FLAT root transcript too. Plain text plus process metadata does not authenticate its producer.
  Flat-root reductions (including preserved legacy successes) remain structural, not universal stdout
  authenticity guarantees. This limitation is disclosed for lead review, not hidden by a synthetic decoder.
- Top-level parallel, Example/Fuzz, shuffle, extra delta packages and regex selectors remain exact.
  No tokenizer/JSON runtime change is requested. Prior source/receipt history stays in git; current
  approved retention policy and manifest take precedence over earlier savings proposals.
- Current focused verification: 52 passed, zero skipped; typecheck exited 0 after restoration.
  Production probe disabled whole-tree protection: genuine raw collision and common-default golden
  tests failed on lost tree bytes. Separate order-guard probe again admitted reordered count rounds
  and failed the independent negative test. Both restored before final owned suite and typecheck.
- Five newly rejected proposals match previous committed goldens at `0d94847` byte-exact. Native
  artifacts/source pins and every actual manifest disposition/golden remain checked. No full checks
  or CI dispatch; stop for lead cold-review. No claim of universal stdout authentication.
