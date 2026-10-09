# C05 cargo-doc: human-approved bounded capture-only corpus

Flat `cases.json`: `hugr-lean/native-cases/1`. Native evidence was independently audited;
this recovery normalizes reader transport only. Each case has globally unique `cargo-doc-<id>`
name, family `cargo-doc`, string Cargo version/platform copied from native facts, `file` copied
from original `outputFile`, and `status: passthrough`. `provenance.sha256` copies original
`rawSHA256`; local `SOURCES.md` record, recipe binding and completed-stream flag remain intact.
Actual argv, command, exits, capture metadata and artifacts remain unchanged.
No current expected fields are present: raw input itself is the exact identity expectation.
Top-level `archives` lists all 15 unchanged `<id>/expected.txt` historical proposals;
these are not current goldens or reduction proof.

Human approved exact preservation of ambiguous Cargo doc output as a bounded capture-only
scope decision. This corpus claims zero savings, not a reduction waiver or runtime no-op profile.
Lead imports fixtures only; source/test from earlier branch commits are not part of this handoff.

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

## Preservation boundary

Every `Compiling`, `Checking`, and `Documenting` row is retained, including unrelated leading
`   Compiling user-log v9.9.9 (/tmp/unrelated)`. Artifact agreement cannot prove producer identity.
Raw identity is required for every case, including failed syntax and unbound --bins artifacts.
No safe deletion is proved here.
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

## Genuine gaps / lead handoff

- Shared registry and corpus-reader integration remain lead-owned. This fixture-only handoff
  claims native capture preservation, not reduction, installed routing or campaign completion.
- No `Checking` line was produced by these dependency-free Cargo 1.98 captures. Its syntax is
  retained in synthetic counterexamples, not native reduction support. Plural artifact spelling has the three-package witness.
- Cold-review protecting names: `C05 progress producer collisions preserve unrelated prefix and matched Documenting`,
  `C05 diagnostic exact native column refuses displaced item and unsupported alignment`, and
  `C05 bins unbound artifacts refuse entire output without fixture hardcodes`.
  These are synthetic counterexamples derived from pinned native streams, not new native captures.
- Native producer identity cannot be inferred from progress text. Human scope decision accepts
  exact output for this bounded corpus; authenticated producer boundaries remain a genuine gap.
- Explicit targets are host `x86_64-apple-darwin` only: no nonhost cross-target witness.
  All native commands use --offline: no no-offline witness. Inherited user Cargo configuration
  is not isolated or independently covered. Native fully progress-shaped stdout collision is
  not captured; synthetic collision counterexamples do not fill that gap. The opaque-log capture
  is native but does not prove that fully progress-shaped stdout case.
- Accepted argv: direct cargo doc; optional --offline; --no-deps/--workspace/--bins/private-items;
  -p/--features/--target/--profile/--manifest-path/--jobs with generic syntax-checked values.
  Duplicate/unknown flags, package+workspace, errors, new warning forms, C0/C1/Cf, partial outputs,
  inconsistent counters/profile/target/artifacts and extra/missing rows are exact. Only observed
  unoptimized+debuginfo seconds finish grammar is admitted; release/minutes/JSON remain exact.
  Presentation must be unknown as captured; rendered input is refused because core normalization
  can erase controls before the profile sees the output.
- Recovery checks: narrow raw hashes, recipe/project/archive byte preservation and capture metadata.
  No tests/typecheck/CI dispatch for this fixture-only normalization. Lead review required; never merge.

Current corpus savings: 11,215 input/output UTF-8 bytes, 0 removable bytes. Prior 2,661-byte
claim depended on unsafe deletion and is withdrawn. Captures and raw hashes are unchanged.
