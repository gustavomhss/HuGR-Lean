# Native coverage campaign

Status: cold-review fixes applied; scaffold preparation started. Acceptance specifications below are not executed tests.
Baseline: `69607794cbb2a3ce6707a509777ac648aa859bdd` (0.2.0 rebuild).
Owner: lead; human reviewer: gmhelmold. One package, existing Profile contract, no new runtime dependencies.
User constraints: isolated branches/worktrees; surgical agent tests; one final full CI; speed; no overengineering.

## 1. Success and scope

Success means every mandatory row below has native evidence, executable acceptance tests, a reviewed
implementation, and an honest coverage disposition. Reduction-supported, exact-only and unsupported
are distinct. Exact-only must never be advertised as compression support.

Every row is mandatory investigation/delivery, not permission to defer a difficult format silently.
If native evidence shows no removable noise, exact-only is acceptable with a named witness and review.
If a promised reduction cannot be delivered, it is a blocker requiring a human scope decision.
No universal claim across all versions, plugins, arbitrary output or future formats.

Launch scope: complete captured non-watch output; successful executions may reduce; failed executions
remain byte-for-byte unchanged at the captured boundary. ANSI reduction requires host presentation facts.
Windows paths, Unicode, LF/CRLF, blank output, warnings, counts and unknown rows are explicit test dimensions.
Command identity remains within the existing literal tokenizer. Shell chains, leading assignments,
expansions and unsupported quoting stay exact; no shell parser or command rewriting is added.
Output-path coverage does not imply the tokenizer accepts every spelling of a command argument.
Watch/streaming, arbitrary application output and reduction of nonzero exits need separate contract changes.

## 2. Frozen invariants

I01 Existing Observation/Profile/Reduction/FilterResult types and core rendering vocabulary stay unchanged.
I02 No command execution, filesystem or network inside profiles/core; command and host metadata stay untouched.
I03 Unknown command/flag/line, ambiguity, inconsistent totals, missing boundaries or partial input => exact original.
I04 Nonzero exit, timeout, unknown termination and incomplete observation => exact original through public filter.
I05 Diagnostic messages, codes, severity, positions, snippets, suggestions, warning context and user logs survive.
I06 Native summaries, skip/ignore reasons, package/suite associations, artifacts and requested metrics survive.
I07 Removed passing-test identities require explicit per-profile evidence policy; never infer user logs are progress.
I08 Source spans are ordered UTF-16 offsets, never split surrogate pairs; size metrics are UTF-8 bytes.
I09 Replacement must be strictly smaller; no fabricated dynamic text or summaries, no arbitrary dedup/truncation.
I10 At most one registry profile matches each admitted argv; launchers route to the underlying exact invocation.
I11 Copied material records repository, immutable commit, path, license, hashes and modifications.
I12 No forced pushes, hard resets, skipped hooks, unnamed staging or edits outside assigned files/worktree.
I13 Coverage claims cannot exceed captured versions, variants, platforms and actual model-bound proof.
I14 Lifecycle/test/plugin output remains arbitrary unless a complete grammar establishes safe boundaries.

## 3. Acceptance specification: one row, one exclusive implementation owner

Each ID becomes a test prefix `[ID]` in its owned test file. These are specifications, not green receipts.
Each row has three common acceptance items plus its listed positive cases:

- `ID/reduction` (reduction-supported cases only): public filter produces exact reviewed golden,
  smaller UTF-8 bytes, required evidence intact. Each family with safely removable native noise needs
  a positive reduction witness; returning undefined for everything cannot satisfy this item.
- `ID/exact` (exact-only cases): native output remains exact; record disposition reason as
  `no removable material`, `unsafe/ambiguous`, or `not implemented`. Only no-removable-material cases
  can complete via lead approval alone. Replacing mandatory reduction with either other reason requires
  a recorded human scope decision. Silent output is not an artificial reduction item.
- `ID/refusal`: unknown line at start/middle/end, unsupported argv, malformed/missing/duplicate boundaries,
  inconsistent totals where present, arbitrary log/context and truncation produce exact original.
- `ID/execution`: nonzero/timeout/unknown/incomplete, presentation and byte-limit behavior remain exact.
  Existing core tests cover global behavior; each new family supplies a representative public-filter witness.

Existing admitted positives are regression anchors, not falsely labeled red-to-green additions.
New reduction items must be run against the baseline first and demonstrably fail. Exact-only items may
already pass: keep them as preservation witnesses, not proof of newly implemented reduction.

| ID / file stem | Mandatory native cases and evidence |
| --- | --- |
| C01 cargo-build | build/check; fresh/cached, workspace/-p/exclude, debug/release/custom profile, features, targets, lib/bin/examples, warnings |
| C02 cargo-test | multiple executables/packages; unit/integration/doctests; ignored/filter/zero suites; workspace/features/targets; libtest flags after `--` |
| C03 cargo-clippy | workspace/packages, success with warnings, multiline diagnostic/snippet/help preservation; errors exact |
| C04 cargo-fmt | `fmt --check`, package/workspace, file/diff evidence, silent success; check failures exact |
| C05 cargo-doc | workspace/no-deps/features/targets; warnings and generated documentation locations |
| C06 cargo-bench | multiple harnesses, benchmark names/units/results, filtered/ignored cases; custom harness output exact |
| C07 cargo-nextest | `cargo nextest run`; default native reporter, package/suite totals, skips; custom reporters exact unless captured |
| C08 cargo-fetch | fetch/install; downloads/cache, dependency resolution and installed binaries; arbitrary build-script output exact |
| G01 go-test-text | default/verbose; package/list/`./...`; nested subtests, parallel interleaving, cached/skipped/no tests; preserve t.Log |
| G02 go-test-json | original `go test -json`; valid complete event streams, package/test association, interleaving, embedded logs, EOF consistency |
| G03 go-bench | original `go test -bench`; benchmark metrics/units, benchmem, multiple packages; race/coverage results retained |
| G04 go-build | build/vet/run; multiple packages, tags/targets; warnings/diagnostics, silent success; application stdout/stderr and failures exact |
| G05 go-mod | mod download/tidy/get; cached/new modules, go.sum/module changes and actionable version/advice evidence |
| T01 tsc | plain/pretty; project/noEmit/build references; incremental/up-to-date; diagnostics/extendedDiagnostics; listFiles/listEmittedFiles/explainFiles preserved |
| B01 vite | build; assets/chunks, warnings, sizes, output paths and summary |
| B02 next | build; route/artifact tables, typecheck warnings, static/dynamic output, native finish boundaries |
| B03 esbuild | build; artifact/size/time rows, warnings/context; stdout bundle content exact |
| B04 rollup | build; multiple outputs, plugin warnings, artifact paths and durations; unknown plugin logs exact |
| B05 webpack | build; stats variants captured individually, warnings, chunks/assets, totals; arbitrary plugin output exact |
| P01 npm-install | install/ci; lockfile, workspaces, offline/cache, peers/deprecations/audit, lifecycle logs |
| P02 pnpm-install | install; frozen lockfile/workspaces, download/reuse progress, peers/deprecations, lifecycle logs |
| P03 yarn-install | install; Classic/Berry distinct captures, immutable/offline/workspaces, warnings and lifecycle logs |
| P04 bun-install | install; frozen lockfile/workspaces/cache, blocked/postinstall scripts, installed dependency evidence |
| P05 pip-install | install; fresh/satisfied/cache, requirements/constraints, resolver advice, build backend output |
| P06 uv-install | pip install/sync; lock/environment changes, cached/download/build, package version changes and backend logs |
| L01 eslint | default stylish and explicitly requested JSON; positions/rules/messages, fixes, counts, warnings at exit zero |
| L02 biome | check/lint/format; default and explicitly requested machine format if available; advice/snippets/fixes/counts |
| L03 ruff | check/format; default and requested JSON; codes/positions/fix context, changed files and counts |
| L04 golangci-lint | run; version-specific native/default and requested machine format; complete multiline diagnostics and counts |
| L05 prettier | check; file identities, ignore/config warnings, summary; nonzero formatting failures exact |
| L06 pylint | default and requested JSON; diagnostic association, score/metrics where requested |
| L07 mypy | default and requested structured output if available; notes, spans/codes, totals |
| L08 pyright | plain and requested JSON; per-file diagnostics/context and totals |
| L09 stylelint | default and requested JSON; rules/positions/messages, warnings, totals/fix evidence |
| L10 shellcheck | default and requested JSON; multiline shell context, codes, positions, links/suggestions |
| L11 markdownlint | selected pinned CLI frontend/default and requested structured formatter; paths, rules, context, totals |
| R01 pytest | measured versions, parametrization, plugins, xdist, skip/xfail/warnings; custom plugin logs retained or exact |
| R02 jest | multiproject, coverage, snapshots, skips, console logs, explicit reporters; preserve names/bodies required by current policy |
| R03 vitest | multiproject, coverage, skips, console logs, default and explicit reporters; flaky/retry evidence |
| R04 playwright | projects/browsers, retries/skips/flaky, native reporters, trace/screenshot/attachment paths |
| R05 bun-test | multiple files/suites, skip/todo, logs, coverage and totals |

The capture packet enumerates exact flags: no open-ended 'all flags' admission.
Each row expands into a compact fixture-local CASES.md before implementation: stable case ID,
required variant/combination, exact argv/version, fixture, expected public-filter result, removable
material, preserved evidence and test name. Required evidence lists exact source content/association,
not merely assertions that the reducer's own required spans survived. Malformed counts, absent terminal
summaries and partial streams are explicit refusal cases where the grammar has those constructs.
Cover every listed variant plus boundary-crossing combinations (for example workspace + multiple suites,
JSON + bench, cached + multiple packages), not the unbounded Cartesian product of every flag.
No generic `warnings preserved` checkbox substitutes for multiline native warning witnesses.
Lifecycle/backend/plugin/custom-harness witnesses must include user output identical to removable native
progress. Complete line recognition alone does not establish producer identity. Where captured mode
does not provide trustworthy boundaries/exclude arbitrary producers, preserve ambiguous material or
refuse the complete transcript. A parser's inability to distinguish it is not a no-removable-material waiver.
Go run/vet/build and formatters often emit nothing: prove exact behavior, do not invent savings.
Bench/JSON/profile output must remain useful; deleting requested metrics is forbidden.

## 4. Minimal scaffold and conflict-free ownership

S00 (lead) owns only registry/scaffold changes, CI routing, shared docs and final integration seams.
Before dispatch, create existing-family seams in the stems above; initially delegate to unchanged
legacy parsers to preserve behavior without duplicating code. Each owner replaces only its seam.
Create static registry imports when a new family is reviewed; no empty registrations or runtime discovery.
Existing cargo-test/build, go-test, pytest, jest/vitest remain functional during scaffold extraction.
S00 acceptance: record affected existing named-test results before and after extraction, public-filter
goldens and registry seam witnesses, plus typecheck. Mutation-probe one preservation witness, restore
and rerun it. Freeze scaffold only after those surgical checks; no full test run required.

Each row owns exactly:

```
src/profiles/<stem>.ts
tests/profile-<stem>.test.ts
fixtures/profiles/<stem>/**
```

Registry, original runners/formats files, core, adapter, package scripts, global docs/NOTICE/licenses
are lead-only. Existing Git/ripgrep behavior is retained and not assigned to expansion agents.
Any shared helper is existing code or a minimal lead-owned pure helper frozen before dispatch;
do not create generalized diagnostics/install DSLs. Private implementation details remain private.

Anchor for each stem: `export const familyProfiles: readonly Profile[]` using existing types.
Lead freezes IDs, command ownership and import entries before dispatch. For Go test, the lead freezes
an argv classifier distinguishing text/JSON/bench before G01/G02/G03 start, including precedence when
both JSON and bench flags occur. No catch-all profile overlaps another family's matcher.
Cargo subcommands and launchers are classified with exact literal argv, never output guessing.
S00 freezes launcher matrix: baseline direct invocations; baseline `npx tool` and `npx --no-install tool`
for format tools; `python -m pytest` and `python3 -m pytest`. Added launchers are listed per packet with
explicit registry/public-filter witnesses; npm scripts, env prefixes and unspecified wrappers stay exact.

Branch: `campaign/native/<ID>`; worktree: a verified external parent plus `lean-native-<ID>`.
All branches start from the same compiling scaffold SHA, not independently from an older main.
Within a row, corpus + parser + tests stay together; splitting every fixture/function adds coordination cost.
Split an oversized row further only with a frozen seam and exclusive files; target 50–400 changed code LOC
per review packet, source-file target 400 logical LOC; enforce existing 750 split ceiling.
Packet approval includes expected code/review size and grammar boundaries. Yarn Classic/Berry,
pytest plugins/xdist and webpack stats are explicit sizing risks: split before implementation if too
large, with child suffixes and exclusive files/exports. Parent acceptance remains mandatory; child
split does not create an exception. Lead decides parser seams; agents do not redesign interfaces.
Each test file stays at the tests root so existing `tests/*.test.ts` discovers it without script changes.

## 5. Native evidence before coding; rolling schedule

Dependency graph: `S00 workflow/scaffold -> independent family packets -> family implementations ->
lead integration/docs/installed goldens -> one final CI -> human review`. A parser depends only on
its frozen packet and S00, not on another family finishing. No implementation dispatch before S00.
Static registry and shared classifiers are the only shared edit points; exclusive stems eliminate
cross-agent write conflicts. Split children depend on their lead-frozen seam, not mutable peer code.

All 41 family rows can perform corpus preparation independently. At most six active execution agents;
start the next ready row as a slot frees. Never spawn 41 processes or six full build/test matrices.
Priority order: Cargo/Go, installs, TypeScript/builds, lint, additional runners. No artificial wave barrier:
a family may implement as soon as its packet is frozen and new reduction acceptance is red.
Wholly exact-only packets with approved no-removable-material rationale use BASELINE_PRESERVED and
proceed to preservation review; they need no fabricated red baseline or empty new reducer.

Packet preparation is part of each family WP, but implementation dispatch requires lead approval of:
exact tool versions/formatters/argv; minimal capture project; reviewed deletion/evidence policy; golden;
baseline red result for new behavior. Agents may collect candidates, not invent admission policy.
If a required binary is unavailable, prefer verified pinned donor fixtures or a lightweight isolated
capture environment. No large application builds, global installs, credentials or private registries.
If no native evidence can be obtained, row is BLOCKED; do not replace it with synthetic conformance.

Each fixture has captured stdout/stderr boundary facts, command, version, platform, termination,
presentation/completeness, expected result and provenance. Synthetic cases are labeled as adversarial.
Captured combined streams are not treated as equivalent to independently captured stdout/stderr.
Donor licenses remain intact; adding Apache-2.0 material requires corresponding notices, not relabeling MIT.

## 6. Surgical verification and DoD

Agents run only their owned test file and full-package typecheck (one small TypeScript package):

```
npx --no-install tsx --test tests/profile-<stem>.test.ts
npm run typecheck
```

Do not run `npm test`, `npm run check`, smoke, benchmarks, OS matrices or real-host experiments per agent.
No full build per iteration. Early compile checkpoint = typecheck; final packaging belongs to final CI.
If an existing affected regression test lives in a broad file, select its exact test name rather than suite.
Run only tiny native fixtures when capturing; replay captured fixtures for ordinary iteration.

Per-family DoD:
1. All owned case IDs map to executable named tests; native reduction or approved exact-output witnesses,
   refusal and execution evidence exist. No required case is missing or silently deferred.
2. New behavior has a recorded red baseline and green result; prior behavior has preservation witnesses.
3. Exact argv/version scope, removable bytes and required spans are recorded; no unsupported claims.
4. Focused suite + typecheck pass; meaningful mutation probe goes red; restore and rerun focused suite.
5. Lead independently probes changed preservation/admission behavior, using the same surgical test.
6. Entire branch diff/file list is reviewed; only assigned files; source size fits module policy.
7. Provenance and a fixture-local coverage/evidence table are complete; docs claims consolidated by lead.
8. First compiling commit pushed; final SHA pushed; PR against campaign integration branch; never merge.

Mutation choices: delete a required diagnostic/summary; admit an unknown line; bypass a count check.
Record exact change/test/exit result before restoration; no mutation framework or fake mocked assertion.
Author and independent reviewer differ. Review batches are bounded by changed code, not entire campaign.

## 7. Integration and one final CI

Current workflow triggers on every push and PR. S00 must change event routing before any agent push:
exclude `campaign/native/**` and planning/integration branches from push CI; intermediate PRs target
the campaign integration branch and must not trigger full CI. Normal main/release protections remain.
Implement this as small branch/event filters in the existing workflow, not skipped checks or CI opt-out commits.
Load gate-authoring before editing workflow; verify event routing surgically, including a main-PR positive control.

Lead cherry-picks reviewed commits into its isolated campaign integration branch; no PR is merged.
After each integration, inspect registry/seam changes; run only affected family/registry seam tests and
typecheck. Replay seam fixtures through public filter and verify unique matches, unchanged existing profiles,
launcher classification and model-facing adapter behavior. No repeated full suite or smoke.

Lead owns final `tests/profile-registry.test.ts`: every registered family represented by explicit witness
argv, exactly one match; unsupported variants fail open; overlapping text/JSON/bench routing tested.
Lead updates coverage/manual/ownership/README/NOTICE/license facts once from reviewed family evidence.
No shipping all-undefined stubs as implemented coverage.
Lead explicitly owns `scripts/benchmark.mjs`, its corpus discovery, `fixtures/installed-goldens.json`
and package-smoke fixture plumbing. Current fixed corpus reads only runners/formats. Extend it to owned
family fixtures with an explicit metadata manifest; preserve missing/extra/empty/duplicate and registry
coverage checks in both directions. Verify discovery and golden corruption surgically before final CI.
Measure once after agents/native capture processes finish, using existing benchmark machinery and native
byte reports including passthrough zeros. Existing p95 budgets remain: 256 KiB core <=5 ms/adapter <=10 ms;
1 MiB core <=25 ms/adapter <=35 ms. Report hardware, registry size and representative savings; no universal
percent target or token estimate. Budget failure blocks completion, not an implicit exception.

Final readiness: exact ID-set reconciliation for all 41 parent rows and their frozen CASES.md items;
reject missing, duplicate or unexplained extra items, not merely an equal row count. Every case has
reviewed reduction evidence or permitted exact-only rationale/human decision above; a missed deliverable is a blocker.
No unresolved blocker; reviewed claimed variants; installed
goldens selected in existing package-smoke; clean restored mutations. Reconcile current main changes
surgically before final push; record final head and base SHA. Open ONE final PR to main after final push.
Default PR checkout verifies GitHub's synthetic merge tree, not head alone: record merge SHA and exact
tested tree; freeze head/base during verification or invalidate readiness if either changes.
Its PR-open event runs ONE full verify workflow against that recorded merge tree:
existing Node 22 Linux/macOS/Windows jobs, `npm run check`, `npm run smoke`, `npm pack --dry-run`.
One workflow execution contains the three OS jobs; no second manual dispatch or duplicate push run.
Do not edit/push the final PR while its CI is running. No release/publish or main merge in this campaign.
If CI fails, campaign is incomplete: diagnose/fix surgically; a second CI attempt needs human authorization
under the user's one-run constraint. Never call a failed/skipped lane green.
Any added real-host coverage claim needs its own scoped model-bound proof before readiness; unchanged
adapter coverage retains its currently documented reach rather than implying new host compatibility.

Stop at final PR with CI verified and independent review evidence attached, awaiting human review.

## 8. Tracking and dispatch brief (no new orchestration system)

This file plus PRs are the ledger. Per row record:
`ID | owner | baseline/scaffold SHA | version/argv packet | status | branch/worktree | final SHA/PR | test/probe evidence | blockers`.
States: SPEC -> CAPTURED -> BASELINE_RED -> READY -> RUNNING -> REVIEW -> INTEGRATED -> FINAL_VERIFIED.
Exact-only existing witnesses use BASELINE_PRESERVED, never a fabricated red result.

Each brief includes this plan, PLAN.md/types/lines, exact owned files, frozen exports/IDs/argv,
reviewed fixtures/goldens, acceptance names, surgical commands, invariants and stop line.
Agent returns at most: ID, SHA/PR, files, owned AC outcomes, tests, mutation/restoration evidence,
provenance, blockers, and 'what did the brief get wrong?'. Lead verifies artifacts, not narrative.

Planning review (2026-10-08): independent scope critic found missing finite per-variant obligations,
independent evidence goldens and exact-only/completion criteria; incorporated. Two subsequent scope
reviews found no additional demand-versus-spec gaps, including a fresh cold critic.
Independent practicality review found test-discovery, extraction-proof, disposition, denominator and
pre-dispatch sizing issues; incorporated. Tests stay at root; 41 parent IDs are reconciled as sets.
These reviews assess specifications only; runtime completeness remains pending until real tests exist.
Cold review follow-up: closed exact-only waiver loophole, progress-shaped log collisions, go-run ownership,
launcher denominator, red-baseline exception, installed corpus plumbing, performance budgets and merge-SHA facts.
Implementation results remain pending; the lead is now preparing S00.

### S00 receipt

Native tooling observed: Cargo 1.98.0, Go 1.27.1, Python 3.14.5, uv 0.11.18, Node 22.17.1/npm 10.9.2.
The installed pnpm launcher fails with MODULE_NOT_FOUND; capture must use an isolated pinned install.
Remote main equals baseline; actual GitHub repository is gustavomhss/HuGR-Lean (default branch differs).
Focused original native/evidence controls: 10 passed at original baseline and at scaffold.
Scaffold registry/routing checks: 3 passed; typecheck passed. Removing cargo-test registration made
the native golden test fail (exit 1, passthrough instead of reduced); restored and 3 checks passed again.
Workflow filters exclude campaign push/base-PR events while keeping main events; GitHub execution
has not been claimed. No full suite, build, smoke, benchmark or CI was run for this scaffold.
