# C05 cargo-doc: reduction blocked by unauthenticated producers

Flat `cases.json`: `hugr-lean/native-cases/1`. All cases have actual argv, standard
Observation metadata, native input/hash, identity expectation and completed-stream provenance.
Each row names native input and current expectedProposalFile; stable test prefix is `C05 <id>`.
Public-filter disposition is checked through custom `familyProfiles`, without shared registry edits.
Current dispositions below supersede prior reduction proposals. Native corpus tests use
`C05 <id> independent public custom-filter golden`. For formerly reduced cases, expectedProposalFile
now points to native.txt: identity preservation is the oracle. Their old expected.txt files remain
historical rejected proposals, not current goldens or reduction proof.

| Mandatory case ID | Required variant/combination | Proposed disposition | Removable UTF-8 bytes |
| --- | --- | --- | ---: |
| default | doc/default-members, cold | exact/unsafe ambiguous | 0 |
| cached | identical argv, immediately warm | exact/no removable material | 0 |
| no-deps | --no-deps, cold | exact/unsafe ambiguous | 0 |
| workspace | --workspace + --no-deps, two artifacts | exact/unsafe ambiguous | 0 |
| package | -p doc-beta, one artifact | exact/unsafe ambiguous | 0 |
| features | --features doc-warning + --no-deps, rustdoc context/count | exact/unsafe ambiguous | 0 |
| explicit-target | --target x86_64-apple-darwin + --no-deps, triple in artifact path | exact/unsafe ambiguous | 0 |
| private-items | --document-private-items + --no-deps | exact/unsafe ambiguous | 0 |
| workspace-warning | workspace + qualified features + private items, warning + two artifacts | exact/unsafe ambiguous | 0 |
| opaque-log | build-script user log colliding with progress text, workspace | exact/unsafe ambiguous | 0 |
| syntax-fail | feature-selected syntax error, exit 101 | exact/failed | 0 |
| bins-warning | --bins + --no-deps, Cargo filename collision + later progress + rustc warning | exact/unsafe ambiguous | 0 |
| checking-warning | same bin argv, distinct bin name in project variant; rustc warning | exact/unsafe ambiguous | 0 |
| three-warning | three packages + features + serial jobs; post-warning progress; plural artifacts | exact/unsafe ambiguous | 0 |
| profile-path | generic custom profile + manifest path + package + target + features | exact/unsafe ambiguous | 0 |

## Current retention policy

Every `Compiling`, `Checking`, and `Documenting` row is retained, including unrelated leading
`   Compiling user-log v9.9.9 (/tmp/unrelated)`. Artifact agreement cannot prove producer identity.
Validated non-bin output returns a whole-output required source span; core rejects equal-size
replacement. Unknown output refuses parsing. All --bins output refuses parsing until target/artifact
binding is corroborated independently of fixture names. No safe deletion is proved here.
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
Diagnostic item must equal ASCII snippet slice at native column/caret, not appear elsewhere.
Non-ASCII snippet/item and tab alignment are unsupported and refuse parsing. Unicode paths remain supported.

## Blockers / lead handoff

- Shared registry and corpus-reader integration remain lead-owned. Custom-profile implementation
  has native preservation witnesses; no reduction, installed/default-registry or campaign-completion claim.
- No `Checking` line was produced by these dependency-free Cargo 1.98 captures. Its syntax is
  retained in synthetic counterexamples, not native reduction support. Plural artifact spelling has the three-package witness.
- Cold-review protecting names: `C05 progress producer collisions preserve unrelated prefix and matched Documenting`,
  `C05 diagnostic exact native column refuses displaced item and unsupported alignment`, and
  `C05 bins unbound artifacts refuse entire output without fixture hardcodes`.
  These are synthetic counterexamples derived from pinned native streams, not new native captures.
- Native producer identity cannot be inferred from progress text. Unknown/colliding logs stay
  exact. Missing authenticated producer boundary blocks mandatory reduction; human scope decision required.
- Accepted argv: direct cargo doc; optional --offline; --no-deps/--workspace/--bins/private-items;
  -p/--features/--target/--profile/--manifest-path/--jobs with generic syntax-checked values.
  Duplicate/unknown flags, package+workspace, errors, new warning forms, C0/C1/Cf, partial outputs,
  inconsistent counters/profile/target/artifacts and extra/missing rows are exact. Only observed
  unoptimized+debuginfo seconds finish grammar is admitted; release/minutes/JSON remain exact.
  Presentation must be unknown as captured; rendered input is refused because core normalization
  can erase controls before the profile sees the output.
- Checks authorized here: owned focused test, typecheck, tiny native captures and fixture inspection.
  No full tests/build/check/smoke/benchmark or CI dispatch. Lead review required; never merge.

Current corpus savings: 11,215 input/output UTF-8 bytes, 0 removable bytes. Prior 2,661-byte
claim depended on unsafe deletion and is withdrawn. Captures and raw hashes are unchanged.
