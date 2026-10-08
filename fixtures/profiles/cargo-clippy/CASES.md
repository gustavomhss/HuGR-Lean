# C03: Cargo Clippy evidence suffix

Baseline `07ffe15e2263c2925778022194c5385807216603`; capture commit
`e89de8b963ada834769959c1d8189c8d84e8c934`. Native manifest uses shared
`hugr-lean/native-cases/1`, flat cases with actual commands, version, platform and boundary
provenance. Original manifest retained byte-for-byte as `capture-receipt.json`.

| C03/name | Native coverage | Public filter with familyProfiles |
| --- | --- | --- |
| workspace | Two packages, lib/bin, multiline source/help/codes | Leading Compiling removed; later beta Checking retained |
| cache | Same workspace, cached diagnostic replay | Exact: no removable leading progress |
| package-features-target | `-p`, feature, host target, all-targets | Leading Compiling removed; duplicate lib/bin/test counts retained |
| checking-target | Second package, host target, lib | Leading Checking removed |
| workspace-features-target-cache | Workspace + qualified feature + target/cache | Exact: no removable leading progress |
| two-packages | Repeated `-p`, lib/cache | Exact: no removable leading progress |
| deny-warnings | Workspace, `-- -D warnings`, exit 101 | Entire failure exact, even with falsely successful metadata |
| collision | Real build-script forged progress/finish/context warnings | Entire output exact |
| profile-dev | Explicit `--profile dev`, rebuild after feature switch | Leading Compiling removed |

Tests: `tests/profile-cargo-clippy.test.ts`. Native suffix goldens are independent files,
also checked against literal one-row removal, never parser-generated. Public empty-profile
baseline produced RED; custom family profiles satisfy reductions. Default registry routing
is lead-owned and is not claimed here.

## Finite grammar and preservation

Only leading native Compiling/Checking before first diagnostic can be removed. Complete
native warning frames require location, contiguous numbered source, caret, lint URL/code,
default note or code already seen within that compiler target, optional native help diff,
and diagnostic blank boundary.
Package/target summaries validate counts, plurals, suggestion selectors/counts and full-duplicate
association with an earlier matching package/target context. Successful profile finish must
be the last row. All later progress and the entire diagnostic suffix are one required UTF-16
span; UTF-8 byte metrics remain core-owned. No arbitrary deduplication.

Closed flags: optional `--offline`, `--workspace`, repeated distinct `-p`, `--features`,
`--target`, `--all-targets`, `--lib`, `--profile`, and exact `-- -D warnings`. Identifier
values are generic; no fixture title, package, source-path or lint-name constants.

Synthetic unknown/new-format/unbound/count/frame/plural/context/control/error/metadata
negatives are generated in tests, not represented as native cases. Unicode paths/source,
CRLF, optional offline, generic identifiers and profiles are positive transformations.
Existing `fixtures/utility/cargo/warning/original.log` remains a `cargo test` regression
reference only; not new Clippy proof. Historical derivative recipes/hashes remain in receipt.

Mutation probes removed help, warning rows and later progress separately; independent
golden preservation test went RED each time. Bypassing pending diagnostic count check made
inflated-count refusal test RED. All mutations restored before focused suite and typecheck.

Known shared boundary: core strips supported terminal-rendered SGR before profile sees it.
Direct profile refuses raw ESC; public filter can reduce the stripped form. C0/C1 rejection
is verified for controls delivered to profile. Raw-SGR exactness needs lead-owned core decision.
