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

Verification policy corrected by human feedback: do not repeat whole owned suites across author,
reviewer and integration. During iteration run only new/changed acceptance names with
`npx --no-install tsx --test --test-name-pattern='<exact affected names>' tests/profile-<stem>.test.ts`.
Mutation probe runs only its protecting test; restore and repeat that same test, not the whole file.
Run the owned test file once when the packet closes. Further whole-file runs require new changes,
failure or a concrete unresolved concern, not merely another reviewer/integration phase.
Typecheck the affected source/test closure once at compiling checkpoint and again only if later changes
affect typing; use the frozen compiler options below, not repeated full-package typechecks:

```
npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --types node src/profiles/<stem>.ts tests/profile-<stem>.test.ts
```

Full-package typecheck remains in the sole final CI. Reviewers inspect code and run only their concrete
counterexample/protecting named test; they do not rerun the author's full file by default. Integration
runs only changed routing/corpus seams or actual failures; previously verified unchanged families are
not replayed repeatedly. No npm test/check/full build/smoke/benchmark/CI. Native tiny capture projects allowed;
no global installs/private registries/large builds. First compiling commit pushed; PR targets campaign
integration branch; agents stop, never merge. Tests at root are discovered by existing tests/*.test.ts.
Lead independently reviews complete diff and probes changed behavior; integrates by cherry-pick only.
DoD: all owned cases, red/green or preservation witnesses, native source/evidence/goldens, one closure check,
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
### Current receipts

| ID | State | Source branch / PR | Accepted boundary |
| --- | --- | --- | --- |
| C01 | INTEGRATED | campaign/native-v2/C01 / #70 | Generic build/check/default/release/projects; bounded warning layout, leading progress only |
| C02 | INTEGRATED | campaign/native-v2/C02 / #72 | Default workspace and feature lists; suite/doctest/skip evidence retained |
| G01 | INTEGRATED | campaign/native-v2/G01 / #69 | Nested/parallel trees retained; unrelated quiet flat roots may shrink; raw stdout authentication not claimed |
| G02 | INTEGRATED | campaign/native-v2/G02 / #71 | Complete JSON lifecycle; every Output event retained |
| T01 | INTEGRATED | campaign/native-v2/T01 / #74 | Bound plain verbose solution-build timestamp layout only |
| P02 | INTEGRATED | campaign/native-v2/P02 / #77 | Native install progress only with original ignore-scripts + ignore-pnpmfile |
| L03 | INTEGRATED | campaign/native-v2/L03 / #82 | Ruff explicit JSON/exit-zero, all data tokens retained; inline artifacts preserve no-LF EOF |
| C03 | INTEGRATED | campaign/native-v2/C03 / #81 | Clippy suffix preserved; format-control/prefixed-warning fixes cold-reviewed |
| L02 | INTEGRATED | campaign/native-v2/L02 / #80 | Biome decorative header bars only; exact terminal blank pair |
| L01 | INTEGRATED | campaign/native-v2/L01 / #83 | ESLint stylish outer LF only; tiny savings, no material-profit claim |
| P01 | CAPTURED | campaign/native-v2/P01 / #73 | No meaningful progress observed in captured pipe outputs; successful peer-warning case incomplete |
| C04 | CAPTURED | campaign/native-v2/C04 / #87 | rustfmt silent success and nonzero diffs; no removable material found |
| C05 | EXACT_CORPUS_INTEGRATED | campaign/native-v2/C05 / #92 | Human-approved bounded exact corpus; zero reduction; native Checking/nonhost target/no-offline/config gaps explicit |
| C06 | BLOCKED | campaign/native-v2/C06 / #88 | Stable toolchains reject builtin bench; arbitrary custom harness retained, native metrics unproven |
| G03 | CAPTURED | campaign/native-v2/G03 / #90 | Bench metrics/logs retained; nested-progress deletion not approved |
| G04 | CAPTURED | campaign/native-v2/G04 / #91 | Build/vet/run silent or meaningful output; no reduction proposed |
| G05 | INTEGRATED | campaign/native-v2/G05 / #89 | Paired default go-get downloads; SemVer precedence, major pairing and Go path constraints independently reviewed |
| P03 | CAPTURED | campaign/native-v2/P03 / #97 | Yarn Classic/Berry pinned separately; Berry skip-build does not establish hook-free progress |
| P04 | CAPTURED | campaign/native-v2/P04 / #98 | Bun install pinned; 63-byte candidate unapproved; offline/trusted-dependency boundaries incomplete |
| P05 | CAPTURED | campaign/native-v2/P05 / #95 | pip only-binary still runs backend for explicit local source; no approved deletion |
| P06 | CAPTURED | campaign/native-v2/P06 / #94 | uv install/sync captures; no material reduction proposed |
| B01 | CAPTURED | campaign/native-v2/B01 / #96 | Vite plugin can emit identical progress; candidate deletion unapproved |
| B03 | CAPTURED | campaign/native-v2/B03 / #93 | esbuild CLI artifacts/warnings/stdout retained; no plugin API coverage claimed |
| L05 | CAPTURED | campaign/native-v2/L05 / #101 | Prettier 3.6.2; real plugin stdout collision; no approved deletion |
| L07 | EXACT_CORPUS_INTEGRATED | campaign/native-v2/L07 / #99 | mypy 1.18.2; named native diagnostics/notes/metrics/plugin captures retained; no runtime parser or reduction claim |
| L08 | INTEGRATED | campaign/native-v2/L08 / #100 | Pyright 1.1.408 explicit exit-zero JSON layout; every token and two-LF EOF retained |
| L09 | CAPTURED | campaign/native-v2/L09 / #102 | Stylelint 16.25.0; compact JSON, fixes and plugin/config output retained; LF candidates unapproved |
| L10 | EXACT_CORPUS_INTEGRATED | campaign/native-v2/L10 / #103 | ShellCheck 0.11.0; compact JSON, silence and nonzero diagnostics retained; binary/source correspondence unattested |
| L11 | CAPTURED | campaign/native-v2/L11 / #104 | markdownlint-cli2 0.23.3 only; custom reporter progress collision; no approved deletion |
| L04 | CAPTURED | campaign/native-v2/L04 / #108 | golangci-lint 2.11.4; compact JSON and mixed warning/stat boundaries retained |
| L06 | INTEGRATED | campaign/native-v2/L06 / #109 | Pylint 4.0.4 distinct explicit exit-zero JSON/JSON2 layout; every token and terminal whitespace retained |
| C07 | CAPTURED | campaign/native-v2/C07 / #110 | cargo-nextest 0.9.148; multisuite/count/log/collision evidence exact; no approved deletion |
| C08 | CAPTURED | campaign/native-v2/C08 / #105 | Cargo 1.98 fetch/install; resolution/artifacts/build-script logs retained; registry installed skip unobserved |
| B04 | CAPTURED | campaign/native-v2/B04 / #106 | Rollup 4.52.4; artifact/warning/plugin output retained, including silent-mode progress collision |
| B05 | CAPTURED | campaign/native-v2/B05 / #107 | webpack 5.102.1/CLI 6.0.1; compact JSON, stats/artifacts/plugin logs retained |

All other rows remain SPEC, not silently completed. Independent cold reviews and restored lead probes
precede integration. Current native-directory index is an explicit promoted-fixture ledger, not a
claim that the full campaign is complete. Source/checkpoint SHA and detailed probes live in each PR.
Lead corpus wiring checks family absence/extra, local references, declared receipt bindings, raw hashes
where supplied, independent goldens and actual default-filter results. It does not authenticate every
historical collector or replace existing family-specific provenance verifiers.
Resumed-review receipts: C05 `42f799f2a31818cc9c4cff397dffd2a0c921922d` withdraws the
2,661-byte proposal and retains every progress row. ASCII diagnostic-column validation is exact;
unbound bins are refused. This is blocked reduction work, not completed exact-only coverage.
G05 `51008ab49475bc05acc7311e950c6c8b0b4d6e2d` adds exact SemVer ordering, canonical
path-major pairing, dotted first path elements and reserved-component refusal. Focused author
probes were restored; independent numeric-prerelease probe failed under mutation and passed after
restoration. Latest path fixes independently approved after an output-path bypass made the
reserved-component guard fail; restoration passed. Integration exposed duplicate file/inline input
declarations: manifest-only source commit `6c6e15b592d657e0eacb307d4c1453a6c3b8f44e` removes
only redundant inline bytes, independently checked against unchanged files/hashes. The named
Go-mod routing/corpus closure and Go disjointness check passed; scoped registry/closure typing passed.
Unchanged author suites were not replayed. No full CI was dispatched.
L08 source checkpoint `39ea1d1c8b3878bd23937861047e42ba08ea79e2` independently approved:
the cold reviewer verified native/source hashes, pinned MIT producer, exact token goldens and an EOF
deletion mutation (red, restored, same test green). Four native reductions save 1,847 UTF-8 bytes;
plain, nonzero, config and requested metrics remain exact. The author closed its owned file once.
Integration ran only the new Pyright routing/corpus closure and scoped registry/closure typing.
The corpus reader rejected undeclared license/candidate/golden artifacts; explicit archive declarations
fixed correspondence without weakening the reader. The same closure then passed.
L05 capture checkpoint `986923ce378b0cd0136a3517adc04ddaf8e7a540` and L07 checkpoint
`50eabccd3ef6845a10b0ac20a3b68afc328dcf8b` remain capture-only branches, not promoted profiles.
L09 `e1becdb9cb2fb2521cce892a422e1af1d0478184`, L10
`d20d8054100a8d21cb2c85b35dd58e105e072842` and L11
`c6d48a3778118c6941a5d8628c3a73aa092a4ef3` are capture-only checkpoints. No fixture-only
test suites or typechecks were run. Raw/recipe receipts remain on their exclusive branches pending
independent review and corpus promotion. ShellCheck's copied upstream license remains GPL-3.0
fixture provenance, not runtime donor code; producer build-to-commit correspondence remains unproved.
Human scope decision after resumed L09/L10/L11 captures: user selected "Preservar exato
(Recommended)" for Cargo doc and ambiguous plugin/reporter progress. These cases may close as exact
preservation after independent capture review and corpus promotion; no reduction claim, producer
authentication or parser stub is licensed by this decision. Applies to the documented producer-collision
cases, not blanket waiver of missing variants or unimplemented safe formats. C06 nightly remains
unauthorized: user asked why nightly, and builtin libtest's unstable `#![feature(test)]`/E0554 boundary
was explained. Criterion/stable is a distinct reporter and cannot stand in for builtin benchmark proof.
Exact-corpus promotion: C05 fixture-only source `2bbe9c7f5610a88759d0b86a0f8f1c129e3f8bc4`,
L07 `50eabccd3ef6845a10b0ac20a3b68afc328dcf8b` and L10
`d20d8054100a8d21cb2c85b35dd58e105e072842` independently reviewed for raw/source hashes,
EOF, source associations and finite native reach; corruption controls detected altered evidence.
Only C05 fixtures imported: its no-reduction parser/tests excluded. ShellCheck archive metadata
normalized to path strings; raw bytes and receipt remain unchanged. The nonempty per-family
default-filter identity closure and scoped closure typing passed. No new runtime profile introduced.
These states attest bounded exact native evidence, not blanket family completeness or new reductions.
L06 `b2fb51abb69f49645399dbe2d060fb9d57f4bd68` independently approved after counts and
terminal-whitespace mutations failed their narrow guards, then restored guards passed. Four original
native goldens save 1,894 UTF-8 bytes; the clean JSON2 `10.0` variant remains exact under the frozen
canonical-token guard. The lead ran only new Pylint default-routing/corpus closure and scoped typing;
both passed. No shared helper changes or full-suite replay. Other latest capture checkpoints remain
on exclusive branches: L04 `d9d488d`, C07 `d3d9cbc`, C08 `2e51948`, B04 `2c686e9`, B05 `329215a`.
Lead destructive probes: dropping warning/suite summary/JSON Output/tsc body/peer-warning evidence
made five selected native tests fail; restoration made all five pass. Removing T01 from the native
index made real corpus correspondence fail; index restored. No full CI or benchmark run yet.
Lint integration receipt: only the newly added routing/corpus closure was run. It exposed Ruff's
single-profile export mismatch; registry import corrected, same named closure passed. One scoped
index/closure typecheck passed. Author suites and unchanged existing corpus were not rerun.
States: SPEC -> CAPTURED -> BASELINE_RED/PRESERVED -> READY -> RUNNING -> REVIEW -> INTEGRATED -> FINAL_VERIFIED.
Per row receipt: owner, baseline SHA, branch/worktree, packet/version, final SHA/PR, tests/mutation, blockers.
Old-main planning branch remains historical and is not part of this integration.
