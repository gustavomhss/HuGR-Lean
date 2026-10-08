# C03: Cargo Clippy native capture packet

Stage: **CAPTURED**, baseline `07ffe15e2263c2925778022194c5385807216603`.
`cases.json` uses `native-cases-1`; `status` is the proposed public-filter disposition,
not an executed result. No parser admission, red/green, preservation mutation, or test name
is claimed. Lead owns subsequent implementation and focused acceptance tests.

| Case suffix | Required variant / combination | Proposed disposition and evidence |
| --- | --- | --- |
| workspace | Two packages, lib/bin, two source files, multiline lint | Remove leading Compiling only; exact suffix golden |
| cache | Same workspace and cache, replayed warnings | Exact: no leading removable progress |
| package-features-target | `-p`, feature, explicit host target, all-targets | Remove leading Compiling only; keep lib/bin/test duplicate counts |
| checking-target | Second package, explicit target, lib | Remove leading Checking only; exact suffix golden |
| workspace-features-target-cache | Workspace + qualified feature + target/cache | Exact: no leading removable progress |
| two-packages | Repeated `-p`, lib/cache | Exact: no leading removable progress |
| deny-warnings | Workspace, `-- -D warnings`, exit 101 | Entire failure exact: errors, codes, override advice, count |
| collision | Real build-script warnings, forged progress/finish/context | Entire output exact: ambiguous producer context |
| unknown-line | Derived appended opaque producer line | Entire output exact |
| new-format | Derived changed warning heading | Entire output exact |
| incomplete | Derived removed final completion, truncated metadata | Entire output exact |
| unknown-boundary | Native bytes, unknown termination/completeness | Entire output exact |
| existing-warning-regression | Existing `cargo test --color never` compiler warning fixture | Regression reference only; not new Clippy proof |

## Evidence policy

Only leading native `Checking`/`Compiling` lines before diagnostic phase are proposed
removable, after validation of the complete supported output and successful boundary.
Goldens are independent literal suffixes, not filter-generated output. Every warning,
snippet, line/column, help, lint code/link, package/target context, duplicate/suggestion
count, summary, and final completion remains byte-exact. Later Checking (workspace beta)
stays intact. No global progress deletion, deduplication, or normalization.

`removableBytes` records UTF-8 prefix size; future source spans must use UTF-16.
Exact cases use original file as their golden. Unknown/failed/incomplete boundaries
override any potential savings. No-removable cases complete capture, not broader grammar.
Platform coverage is macOS x86_64 only; target flag uses installed host target.
