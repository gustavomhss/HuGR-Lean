# C05 cargo-doc: bounded grammar approved, custom-profile implementation

Flat `cases.json`: `hugr-lean/native-cases/1`. All cases have actual argv, standard
Observation metadata, native input/hash, literal independent proposal and completed-stream provenance.
Each row names `<id>/native.txt` and `<id>/expected.txt`; future focused test name is `C05 <id>`.
Public-filter disposition is checked through custom `familyProfiles`, without shared registry edits.
Proposed dispositions below are literal independent acceptance targets. Native corpus tests use
`C05 <id> independent public custom-filter golden`; default named positive was red with an empty profile
array before implementation. Existing Cargo corpus remains regression evidence, not doc proof.

| Mandatory case ID | Required variant/combination | Proposed disposition | Removable UTF-8 bytes |
| --- | --- | --- | ---: |
| default | doc/default-members, cold | reduced | 230 |
| cached | identical argv, immediately warm | exact/no removable material | 0 |
| no-deps | --no-deps, cold | reduced | 230 |
| workspace | --workspace + --no-deps, two artifacts | reduced | 343 |
| package | -p doc-beta, one artifact | reduced | 113 |
| features | --features doc-warning + --no-deps, rustdoc context/count | reduced | 230 |
| explicit-target | --target x86_64-apple-darwin + --no-deps, triple in artifact path | reduced | 230 |
| private-items | --document-private-items + --no-deps | reduced | 230 |
| workspace-warning | workspace + qualified features + private items, warning + two artifacts | reduced | 343 |
| opaque-log | build-script user log colliding with progress text, workspace | exact/unsafe ambiguous | 0 |
| syntax-fail | feature-selected syntax error, exit 101 | exact/failed | 0 |
| bins-warning | --bins + --no-deps, Cargo filename collision + later progress + rustc warning | exact/unsafe ambiguous | 0 |
| checking-warning | same bin argv, distinct bin name in project variant; rustc warning | reduced | 240 |
| three-warning | three packages + features + serial jobs; post-warning progress; plural artifacts | reduced | 234 |
| profile-path | generic custom profile + manifest path + package + target + features | reduced | 238 |

## Proposed removal policy

Only a contiguous leading run of validated native `Compiling`, `Checking`, `Documenting`
lines before the first diagnostic is eligible; unobserved Checking makes the whole output exact.
No later progress is removable, even when
it looks identical to leading progress. `opaque-log` and `bins-warning` explicitly retain
post-diagnostic `Documenting`/`Compiling` lines; unknown logs and all failed output remain exact.
No generic warning summarization, deduplication, count/path/timing replacement or prose-sniffing.

Require complete native grammar first: observed progress contains package/version/path;
finish is `    Finished ` + backticked argv profile (default `dev`) + ` profile [unoptimized + debuginfo] target(s) in `
+ native seconds + LF; generated is `   Generated ` + exact artifact path, optionally
` and 1 other file` or witnessed plural ` and N other files`, + LF. Count must match distinct
Documenting packages; N is a safe integer, >=2 for plural. Preserve both full finish and generated lines, warning summary
`(lib doc) generated 1 warning`/`(lib) generated 1 warning`, position, snippet, caret, help,
note and blank lines. Only observed native spelling is proposed; missing/extra/unknown
grammar, unsupported argv, truncated/unknown boundary or inconsistent evidence must refuse.
Generated count is corroborated by recorded actual crate-root artifact hashes; paths remain raw.

## Blockers / lead handoff

- Shared registry and corpus-reader integration remain lead-owned. Custom-profile implementation
  has independent native goldens and refusal/preservation tests; no installed/default-registry claim.
- No `Checking` line was produced by these dependency-free Cargo 1.98 captures. Do not admit
  that spelling without a genuine witness. Plural artifact spelling now has the three-package witness.
- Destructive probes target requested-target path consistency, warning count guard and removal
  of post-diagnostic progress. Receipt records observed red runs and restored focused rerun.
- Native producer identity cannot be inferred from progress text. Unknown/colliding logs stay
  exact; reduction eligibility requires lead's full-grammar/boundary decision.
- Accepted argv: direct cargo doc; optional --offline; --no-deps/--workspace/--bins/private-items;
  -p/--features/--target/--profile/--manifest-path/--jobs with generic syntax-checked values.
  Duplicate/unknown flags, package+workspace, errors, new warning forms, C0/C1/Cf, partial outputs,
  inconsistent counters/profile/target/artifacts and extra/missing rows are exact. Only observed
  unoptimized+debuginfo seconds finish grammar is admitted; release/minutes/JSON remain exact.
  Presentation must be unknown as captured; rendered input is refused because core normalization
  can erase controls before the profile sees the output.
- Checks authorized here: owned focused test, typecheck, tiny native captures and fixture inspection.
  No full tests/build/check/smoke/benchmark or CI dispatch. Lead review required; never merge.
