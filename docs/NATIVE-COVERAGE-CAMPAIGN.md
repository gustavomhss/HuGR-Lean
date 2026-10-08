# Native coverage campaign: delta only

Baseline: `5faec804e2d249b8119b90a1339b98fcf18ed527`, existing `utility/integration`.
Supersedes old-main scaffold `4d10e96`; do not import its parser/CI changes over this baseline.
User instruction: do not redo existing work. Existing parsers, authenticated corpus, goldens,
process/host corrections and manual exact-candidate CI stay intact.
Status: remaining-coverage packets in preparation; no claim of full coverage or runtime completion.

## Existing work: reuse and preserve

- Cargo: build dev; test/--lib; multiple unit/integration/doctest suites, ignored reasons and counts.
- Go: verbose serial packages, ./..., cache/no-test packages, linked diagnostic logs.
- pytest: default/quiet/literal paths/doctest flag, wrapped progress, skips and warning sections.
- Node/tsx: flat/nested TAP, skip/todo/comments/envelopes; default registry registration.
- Jest/Vitest/Git/rg: existing native grammar and evidence policies.
- Reuse fixtures/utility/{cargo,go,pytest,node} and fixtures/{runners,formats}; no duplicate captures
  for admitted cases. Existing exact-only/negative witnesses remain useful, not new reduction proof.
- Native implementation inventory checked from source at baseline; no full test run claimed.

## Mandatory delta IDs and exclusive stems

| ID / stem | Remaining scope (existing variants are regression anchors) |
| --- | --- |
| C01 cargo-build | build/check; release/custom profiles/workspace/packages/exclusions/features/targets/lib/bin/examples/cache/warnings |
| C02 cargo-test | workspace/packages/features/targets/release and bounded libtest flags; preserve existing suites/doctests |
| C03 cargo-clippy | native multiline warnings/context/help, workspace/packages |
| C04 cargo-fmt | fmt --check/workspace/packages; silent success and failed diff exact |
| C05 cargo-doc | doc/no-deps/workspace/features/targets/warnings/artifact paths |
| C06 cargo-bench | suites/names/units/metrics; arbitrary custom harness exact |
| C07 cargo-nextest | run native reporter, suites/counts/skips |
| C08 cargo-fetch | fetch/install/cache/resolution/artifacts; build-script collisions |
| G01 go-test-text | default, selectors, subtests/parallel, race/cover/run/count; retain existing serial/cache/log behavior |
| G02 go-test-json | complete original -json events, nested/parallel/multi packages/cache/logs; JSON+bench routing |
| G03 go-bench | bench/benchmem/packages/units/coverage/race evidence |
| G04 go-build | build/vet/tags/targets; run application output and errors exact |
| G05 go-mod | download/tidy/get/cache/change/advice evidence |
| T01 tsc | plain/pretty/project/noEmit/build refs/incremental/metrics/file listings |
| B01 vite | build artifacts/chunks/warnings/sizes |
| B02 next | build routes/typecheck/artifacts/warnings |
| B03 esbuild | build artifacts/warnings; stdout bundles exact |
| B04 rollup | multiple outputs/warnings; opaque plugin output exact |
| B05 webpack | individually pinned stats formats/chunks/assets/warnings |
| P01 npm-install | install/ci/workspaces/lock/offline/cache/peers/audit/lifecycle |
| P02 pnpm-install | install/frozen/workspaces/cache/peers/lifecycle |
| P03 yarn-install | Classic/Berry separate grammars/immutable/offline/workspace |
| P04 bun-install | install/frozen/workspaces/cache/blocked scripts |
| P05 pip-install | install/requirements/constraints/satisfied/resolver/build backend |
| P06 uv-install | pip install/sync/environment/lock/package version changes |
| L01 eslint | native and explicitly requested JSON, diagnostics/fixes/counts |
| L02 biome | check/lint/format/native/requested machine format |
| L03 ruff | check/format/native/JSON/context/fixes |
| L04 golangci-lint | run native/requested format/complete diagnostics |
| L05 prettier | check/files/warnings/summary; failures exact |
| L06 pylint | diagnostics/JSON/requested metrics |
| L07 mypy | messages/notes/codes/totals |
| L08 pyright | plain/JSON/context/totals |
| L09 stylelint | native/JSON/rules/positions/fixes |
| L10 shellcheck | native/JSON/snippets/codes/links |
| L11 markdownlint | pinned frontend/rules/paths/context/totals |
| R01 pytest | only missing pinned plugins/xdist/xfail/parameterization variants; reuse existing corpus |
| R02 jest | missing multiproject/coverage/reporters/skips/logs/snapshots |
| R03 vitest | missing multiproject/coverage/reporters/retries/logs |
| R04 playwright | projects/browsers/retry/flaky/skip/attachment evidence |
| R05 bun-test | suites/skip/todo/logs/coverage/totals |

## Invariants and acceptance

1. Existing types/core/adapter/I-O unchanged; one small TS package; no extra model/runtime dependency.
2. Failed/unknown/timeout/incomplete/truncated commands stay exact at captured host boundary.
3. Unsupported argv, new/ambiguous lines, inconsistent totals or missing boundary => original.
4. Exact messages/codes/positions/snippets/help/warnings/logs, summaries/skip reasons/package/suite
   associations, artifact paths and requested metrics survive. Required spans ordered UTF-16; bytes UTF-8.
5. Only strictly smaller reductions; source-backed dynamic text; no arbitrary dedup/truncation.
6. Native-looking lifecycle/backend/plugin/user-log collisions are mandatory refusal/retention witnesses.
   Grammar recognition cannot prove producer identity. No boundary => keep ambiguous material or refuse.
7. Unique matching profile per argv; finite launchers: baseline direct/npx/no-install/Python module;
   extra launchers need explicit witnesses. No env-prefix/shell-chain/watch/nonzero-reduction expansion.
8. Provenance: exact capture version/argv/platform/termination/presentation/completeness/boundary;
   copies require immutable source commit/path/license/hash/modifications.

Each packet has fixture-local CASES.md: stable case ID, required variant/combination, native input,
independent expected golden/source evidence, public-filter disposition, removable bytes and test name.
Cover each named variant and boundary-crossing combinations, not unbounded Cartesian products.
New reductions require a real baseline red -> green. Existing behavior uses BASELINE_PRESERVED.
Exact-only reasons distinguish no removable material, unsafe/ambiguous and not implemented. Only first
completes with lead review alone; substituting either other reason for mandatory reduction needs a
recorded human scope decision. Empty stubs and silent outputs cannot fake reduction support.

## Work and checks

Six rolling execution slots maximum. Each coding agent has its own branch/worktree at frozen scaffold;
exclusive src/profiles/<stem>.ts, tests/profile-<stem>.test.ts, fixtures/profiles/<stem>/**.
Existing cargo.ts/go.ts/pytest.ts/node-test.ts/runners.ts/formats.ts remain lead-owned. Existing-family
seams initially delegate to baseline objects; new implementation extends rather than rewrites existing.
Registry/shared helpers/types/global docs/corpus reader/goldens/workflow are lead-owned.
Oversized rows split before coding into exclusive child files with frozen seams; parent ACs remain total.

Per agent: own named test file + npm run typecheck, meaningful preservation/admission mutation goes
red, restore, rerun. No npm test/check/full build/smoke/benchmark/CI. Native tiny capture projects allowed;
no global installs/private registries/large builds. First compiling commit pushed; PR targets campaign
integration branch; agents stop, never merge. Tests at root are discovered by existing tests/*.test.ts.
Lead independently reviews complete diff and probes changed behavior; integrates by cherry-pick only.
DoD: all owned cases, red/green or preservation witnesses, native source/evidence/goldens, focused checks,
restored mutations, provenance and source-size policy. No silent missing variant or waiver.

## Final verification

Preserve existing authenticated utility corpus. Extend existing corpus reader/smoke explicitly for
new family fixtures, keeping missing/extra/empty/duplicate and registry correspondence failures.
Current exact 10-profile assertion must become verified set correspondence, not an unguarded count bump.
Verify discovery/extra/golden corruption surgically. New profile IDs require installed corpus witnesses.
Registry routing seams and affected legacy cases are checked incrementally; no repeated full suite.
After all agents/capture processes stop, lead measures once with existing benchmark: p95 core/adapter
<=5/10 ms at 256 KiB and <=25/35 ms at 1 MiB, representative byte savings including passthrough zeros.
No universal percent/token claim. Performance failure blocks completion.

Existing workflow_dispatch already provides exact candidate SHA and three OS jobs. Keep it; no event
filter rewrite. Open final PR after frozen final push, then dispatch ONE full workflow with exact SHA.
Record candidate/workflow SHA and provenance; no duplicate push/PR CI. If sole CI fails, campaign remains
incomplete; another full attempt requires human authorization. No main merge/release/publish.
Final completeness reconciles parent/case ID sets, not counts: no missing/duplicate/unexplained extra,
all permitted dispositions reviewed, no blocker, all checks/probes restored, installed goldens, single
candidate CI green. Stop for human review. Existing host compatibility claims retain documented reach.

## Ledger

S00: preserve existing baseline and manual CI; freeze only delta seams/routing and corpus metadata.
C01/C02/G01: existing variants preserved; only missing flags/grammar may become new work.
All other rows: SPEC until packet frozen; no implementation result claimed.
States: SPEC -> CAPTURED -> BASELINE_RED/PRESERVED -> READY -> RUNNING -> REVIEW -> INTEGRATED -> FINAL_VERIFIED.
Per row receipt: owner, baseline SHA, branch/worktree, packet/version, final SHA/PR, tests/mutation, blockers.
Old-main planning branch remains historical and is not part of this integration.
