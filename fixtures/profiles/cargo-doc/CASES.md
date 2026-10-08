# C05 cargo-doc: CAPTURED only

Flat `cases.json`: `hugr-lean/native-cases/1`. All cases have actual argv, standard
Observation metadata, native input/hash, literal independent proposal and completed-stream provenance.
Each row names `<id>/native.txt` and `<id>/expected.txt`; future focused test name is `C05 <id>`.
Public-filter disposition is **not implemented/not evaluated** for every row. Proposed dispositions
below are acceptance targets, not baseline-red, green, or regression-proof claims.

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

## Proposed removal policy

Only a contiguous leading run of validated native `Compiling`, `Checking`, `Documenting`
lines before the first diagnostic is eligible. No later progress is removable, even when
it looks identical to leading progress. `opaque-log` and `bins-warning` explicitly retain
post-diagnostic `Documenting`/`Compiling` lines; unknown logs and all failed output remain exact.
No generic warning summarization, deduplication, count/path/timing replacement or prose-sniffing.

Require complete native grammar first: observed progress contains package/version/path;
finish is `    Finished ` + backticked `dev` + ` profile [unoptimized + debuginfo] target(s) in `
+ native seconds + LF; generated is `   Generated ` + exact artifact path, optionally
` and 1 other file`, + LF. Preserve both full finish and generated lines, warning summary
`(lib doc) generated 1 warning`/`(lib) generated 1 warning`, position, snippet, caret, help,
note and blank lines. Only observed native spelling is proposed; missing/extra/unknown
grammar, unsupported argv, truncated/unknown boundary or inconsistent evidence must refuse.
Generated count is corroborated by recorded actual crate-root artifact hashes; paths remain raw.

## Blockers / lead handoff

- Implementation, reader integration, baseline-red admission tests, preservation mutation probes
  and public-filter routing remain pending. Existing cargo corpus is regression-only, not doc proof.
- No `Checking` line was produced by these dependency-free Cargo 1.98 captures. Do not admit
  that spelling without a genuine witness. No plural `and N other files` witness exists here.
- Required future destructive probes: drop/change warning context/count, artifact path/count,
  native finish timing, and post-diagnostic progress; unknown line and incomplete stream refusal.
- Native producer identity cannot be inferred from progress text. Unknown/colliding logs stay
  exact; reduction eligibility requires lead's full-grammar/boundary decision.
- Checks authorized here: npm ci, typecheck, tiny native captures, fixture hash/golden inspection.
  No repository tests/build/check/smoke/benchmark or CI dispatch. Lead review required; never merge.
