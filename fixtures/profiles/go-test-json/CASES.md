# G02 — native Go JSON capture packet

State: CAPTURED, proposed goldens awaiting lead review. No parser implementation or runtime admission.
Manifest paths resolve relative to this directory. Commands execute from disposable `project/` copy.
Existing `fixtures/utility/go` serial/cache/log corpus reused as context, never recaptured here.

## Cases and measured deletion ledger

| Case | Required variants / retained evidence | Proposed disposition | Original → expected UTF-8 bytes | Removed original 1-based lines |
| --- | --- | --- | --- | --- |
| G02/multi | Three packages; nested parent/child; parallel pause/cont; skip reason; no test files; Unicode diagnostic; arbitrary native-looking logs | reduced | 6433 → 5063 (1370 removed) | 6,8,10,13,14,23,25,27,28,36,40 |
| G02/cached | Same packages/tests; real cached summaries; cross-package interleaving; complete replay; skip/no-test and collision logs | reduced | 6438 → 5069 (1369 removed) | 2,4,6,9,10,19,22,23,25,26,33 |
| G02/bench | Original JSON+bench routing; native goos/goarch/pkg/cpu; iterations/ns/op/B/op/allocs/op; package elapsed and summary | passthrough | 1690 → 1690 | none |
| G02/build-failure | Build diagnostics with import-path association; build-fail; package fail with FailedBuild; exit 1 | passthrough | 710 → 710 | none |
| G02/test-failure | Test failure diagnostic OutputType=error; frame and structured failures; test/package association; exit 1 | passthrough | 1337 → 1337 | none |

`multi` removed events: five test run, one pause, one cont, four test pass.
`cached` removes same semantic events at different native positions. Skip events and package events remain.
Expected files retain exact native JSON lines and order; no JSON serialization, aggregation or replacement text.
All Output-bearing lines survive byte-for-byte, including frame lines, logs, diagnostics and summaries.

## Evidence and proposed policy

- `multi.txt:6–32`: each nested/parallel/skip test has run and terminal pass/skip; pause pairs with cont.
  Matching native frame Output carries each deleted lifecycle event; removed test pass Elapsed is exactly 0.
- `multi.txt:17–21`, `cached.txt:13–17`: arbitrary application Output imitates RUN/PASS/package/cache
  and contains embedded JSON. These remain Output, never reinterpreted as outer events.
- `cached.txt:35,39`: real package cache summaries; forged summary at line 17 is retained separately.
- Package starts and terminals, skip events/reasons, association, timestamps, elapsed values and native
  summary text remain. Cross-package timestamps need not be monotonic (`cached.txt:20–21`). Do not sort.
- Candidate deletion requires entire native stream validation first: finite key/type/action grammar,
  unique package start/terminal, test lifecycle and parent consistency, paired pause/cont, matching frame
  evidence, supported command, complete host exit 0. No deletions on unknown keys, malformed/duplicate
  JSON keys, ambiguous state, unexpected event, incomplete stream, missing terminal, or failed exit.
- Only structurally redundant test run/cont/pause/pass may disappear. Test pass removal here limited
  to exact-zero Elapsed, represented by retained native frame. Nonzero precision must not be lost.
- Retain every Output event, even OutputType=frame. No diagnostic trimming or arbitrary deduplication.
- Frozen `go-mode.ts` makes JSON win over bench. JSON+bench must not dispatch to text/bench profile.
  Benchmark's native run lacks test terminal event (`bench.txt:6–12`); complete process/package does
  not imply ordinary test completeness. Exact passthrough proposed until separately reviewed grammar.
- Nonzero build/test cases remain exact, including all build events and diagnostics.

## Finite observed Go 1.27.1 event key variants

These are observed sets, not a universal Go-version compatibility claim. JSON field order stays native.

| Action | Exact observed keys (optional groups describe only witnessed alternatives) |
| --- | --- |
| start | Time, Action, Package |
| run / pause / cont | Time, Action, Package, Test |
| output | Time, Action, Package, Output; independently witnessed with Test, OutputType, or both |
| pass / skip | Time, Action, Package, Elapsed; with or without Test |
| fail | Time, Action, Package, Elapsed; plain, with Test, or with FailedBuild |
| build-output | ImportPath, Action, Output |
| build-fail | ImportPath, Action |

OutputType values actually captured: `frame`, `error`; omission also witnessed. Build events lack Time
and Package. FailedBuild occurs on package fail, not test fail. No additional build key spellings asserted.

## Checks, handoff and blockers

- Disposable evidence verifier: native hashes, exact independent deletion ledger, all Output bytes,
  package/test state transitions, benchmark exception, source snapshots and failure identity.
- Preservation mutation: remove Unicode diagnostic Output in memory; verifier rejects; discard mutation,
  revalidate original golden. No fixture mutation left behind.
- `npm ci` and `npm run typecheck` completed. Typecheck is compile evidence only, not semantic admission.
- Future lead acceptance names: G02 complete lifecycle reduction, cached association preservation,
  arbitrary Output collision retention, JSON+bench exact routing, build/test failure identity.
- Blockers: parser/registry admission and baseline red→green intentionally deferred to next stage;
  benchmark lifecycle reduction requires lead policy decision. These captures do not claim full campaign
  completion, shipped reductions, CI success, unseen build variants, or non-Darwin compatibility.
