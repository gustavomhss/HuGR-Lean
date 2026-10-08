# G02 — native Go JSON capture packet

State: IMPLEMENTED, custom-profile acceptance complete; independent lead review pending.
Native evidence scope: Go 1.27.1, darwin/amd64. Default registry integration remains lead-owned.
Manifest paths resolve relative to this directory. Commands execute from disposable `project/` copy.
Existing `fixtures/utility/go` serial/cache/log corpus reused as context, never recaptured here.

## Cases and verified custom-profile deletion ledger

| Case | Required variants / retained evidence | Custom-profile disposition | Original → expected UTF-8 bytes | Removed original 1-based lines |
| --- | --- | --- | --- | --- |
| G02/multi | Three packages; nested parent/child; parallel pause/cont; skip reason; no test files; Unicode diagnostic; arbitrary native-looking logs | reduced | 6433 → 5063 (1370 removed) | 6,8,10,13,14,23,25,27,28,36,40 |
| G02/cached | Same packages/tests; real cached summaries; cross-package interleaving; complete replay; skip/no-test and collision logs | reduced | 6438 → 5069 (1369 removed) | 2,4,6,9,10,19,22,23,25,26,33 |
| G02/bench | NEGATIVE/refusal: original JSON+bench routing; native goos/goarch/pkg/cpu; iterations/ns/op/B/op/allocs/op; package elapsed and summary | passthrough | 1690 → 1690 | none |
| G02/build-failure | Build diagnostics with import-path association; build-fail; package fail with FailedBuild; exit 1 | passthrough | 710 → 710 | none |
| G02/test-failure | Test failure diagnostic OutputType=error; frame and structured failures; test/package association; exit 1 | passthrough | 1337 → 1337 | none |

`multi` removed events: five test run, one pause, one cont, four test pass.
`cached` removes same semantic events at different native positions. Skip events and package events remain.
Expected files retain exact native JSON lines and order; no JSON serialization, aggregation or replacement text.
All Output-bearing lines survive byte-for-byte, including frame lines, logs, diagnostics and summaries.

## Evidence and lead-approved policy

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
  not imply ordinary test completeness. Lead approved NEGATIVE/refusal until a separate full benchmark
  grammar exists. No benchmark reduction/economy claimed; this is not a pending G02 scope decision.
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

## Capture-stage checks

- Disposable evidence verifier: native hashes, exact independent deletion ledger, all Output bytes,
  package/test state transitions, benchmark exception, source snapshots and failure identity.
- Preservation mutation: remove Unicode diagnostic Output in memory; verifier rejects; discard mutation,
  revalidate original golden. No fixture mutation left behind.
- `npm ci` and `npm run typecheck` completed. Typecheck is compile evidence only, not semantic admission.

## Implementation acceptance / probe receipt

- Owned source: `src/profiles/go-test-json.ts`; tests: `tests/profile-go-test-json.test.ts`.
  Export `familyProfiles`, ID `go-test-json`, match exactly `goMode(argv) === "json"`.
  Original command is never rewritten. No runtime TypeScript parser/dependency added.
- Structural flat-object scanner detects duplicate literal keys before JSON.parse; quoted strings are
  lexed, so embedded key-looking Output is data. Escaped keys, nested values, unknown keys/actions/types,
  unsupported OutputType, malformed JSON and unsupported control evidence refuse the whole stream.
- Validator checks package boundaries/summaries, per-package test identity, explicit nested parents,
  serial/parallel scheduling, same-association native frame order, pause/cont pairing, child completion,
  test terminals and frame duration consistency before emitting any reduction.
- Only redundant run/pause/cont and exact-zero test pass events are removed. Every retained event is an
  ordered original UTF-16 span and required evidence. ALL Output, package/skip events, native text,
  summaries, metrics and retained timestamps remain exact. Nonzero test Elapsed stays source-backed.
- Baseline RED: empty `familyProfiles` made both multi/cached native golden tests fail (passthrough vs
  reduced); three exact-only native cases passed. Implementation GREEN: focused public-filter suite.
- Test groups: five native goldens; frozen routing/final booleans; malformed/duplicate/escaped keys and
  primitive schemas; missing/duplicate lifecycle/frames; nested and package association; precise nonzero
  Elapsed; opaque/collision Output; ordered spans; formatting/key order/CRLF; benchmark refusal;
  native failures even under spoofed success metadata; early metadata preservation.
- Synthetic edits are unit refusal/preservation controls derived from captures, not new native captures
  or broader compatibility evidence. Same test names across packages and package-level Output have
  explicit preservation controls.
- Production mutation: changed source-span selection to drop `diagnostic café` Output. Focused
  `G02/multi: native public-filter golden` failed with exact missing Unicode diagnostic line; exit 1.
  Restored production selection with apply_patch; full owned suite and typecheck rerun afterward.
- Compiling checkpoint `e74234b` pushed. Final verification command:
  `npx --no-install tsx --test --test-reporter=spec tests/profile-go-test-json.test.ts`
  and `npm run typecheck`: 106 tests passed, none skipped; typecheck passed.
- Final combined check timed out during typecheck after tests completed; standalone
  `npm run typecheck` retried with a 300-second bound and exited successfully. No failure suppressed.
- Blockers within assigned implementation scope: none. Lead owns default registry integration,
  independent review and campaign-wide CI. No CI dispatched, full checks/build/smoke/benchmark run,
  broad version/platform compatibility claim, or merge.

## Cold-review P1 grammar correction receipt

- Review found invalid complete streams admitted at `468065d`: early package PASS/summary followed
  by pending test completion, later test activity after package completion, and a second full parallel
  cycle. All three were reproduced before the fix: refusal tests failed because status was `reduced`.
- Exact new test names in `tests/profile-go-test-json.test.ts`:
  - `G02 review regression: early package PASS and summary before test closure`
  - `G02 review regression: test activity after package completion`
  - `G02 review regression: second complete parallel cycle`
- Package phases now progress irreversibly: `active → summary → terminal → closed` for test packages;
  no-test packages take `active → terminal → closed`. All tests must already be closed at the package
  PASS frame, not merely at the later terminal event. After PASS, only the finite same-package native
  summary footer is permitted, then its package terminal. Test lifecycle and test-associated Output
  are forbidden after package completion begins. Other packages may still interleave independently.
- Parallel PAUSE frame and pause event both reject an already-parallel test. Cont requires paused
  state plus the first-pause flag; it moves to contFrame, then running. No second pause can recreate
  paused state, so no second complete cont transition is admitted.
- Compiling fix checkpoint `c2c8841` pushed after all three new refusals and five unchanged native
  goldens passed, with typecheck successful.
- Production mutation probe 1 removed the package pre-frame closure check and completion barrier:
  both package regressions failed; five native goldens passed. Restored both checks with apply_patch.
- Production mutation probe 2 removed both already-parallel pause guards: second-cycle regression
  failed; five native goldens passed. Restored both guards with apply_patch.
- Restoration verified by `git diff --exit-code -- src/profiles/go-test-json.ts` against checkpoint.
  Final owned suite: 109 passed, none skipped; `npm run typecheck` passed. Original native goldens,
  Output retention, byte savings and Go 1.27.1/darwin evidence scope remain unchanged.
- Assigned-scope blockers: none. Independent cold re-review pending; no CI dispatch or merge.
