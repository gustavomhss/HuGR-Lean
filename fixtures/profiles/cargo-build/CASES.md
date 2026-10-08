# C01 — capture-only policy packet

State: CAPTURED, pending lead approval before parser work. Baseline:
`07ffe15e2263c2925778022194c5385807216603`. `cases.json` status means **proposed**
public-filter disposition, not implemented support. `cargo-check` is a proposed family;
its files stay relative to this cargo-build packet directory.

## Finite mandatory variants

Each row is `C01/<stem>`; native input is `<stem>.txt`, independent policy golden is
`<stem>.expected.txt`. Goldens were manually selected from source evidence, without running
any HuGR parser. R = mandatory reduction proposal; N = no removable material; F = failed,
all bytes required; A = unsafe/ambiguous, exact refusal witness, **not** N or completion waiver.

| Stem | Mandatory combination | Proposal | Removable material |
| --- | --- | --- | --- |
| release-workspace | build + release + workspace + exclude | R | two Compiling rows |
| custom-package-lib | build + custom profile + -p + lib + no-default-features + extra | R | Compiling row |
| release-bin-target | build + release + -p + named bin + explicit host target + feature | R | Compiling row |
| release-example | build + release + -p + named example | R | Compiling row |
| check-workspace | check + workspace + exclude | R | two Checking rows |
| check-custom-all-targets | check + custom + -p + all-targets + all-features + no-default-features + error | F | none permitted on exit 101 |
| check-lib-target | check + -p + lib + explicit target + no-default-features + extra | R | Checking row |
| check-bin-examples | check + release + -p + bins + examples + extra | R | Checking row |
| build-warnings | build + -p + lib + feature + multiline Unicode warning | R | Compiling row only |
| check-warnings | check + -p + lib + feature + multiline Unicode warning | R | Checking row only |
| build-collision | build + build-script native-shaped progress/summary + unknown Unicode log | A | none under refusal proposal |
| build-cached | build + cached lib + replayed warning | N | none: warning and summary only |
| check-cached | check + cached lib + replayed warning | N | none: warning and summary only |
| build-failure | build + release + -p + lib + feature + Unicode compile error | F | none permitted on exit 101 |
| check-custom-targets-success | check + custom + -p + all-targets + no-default-features + feature list + duplicate warnings | R | Checking row only |
| build-cached-clean | build + release + -p + lib + all-features + warm cache | N | none: summary only |
| check-collision | check + cached build-script logs + new Checking row | A | none under refusal proposal |
| build-all-features-targets | build + custom + -p + all-targets + all-features | R | Compiling row |

Existing dev build and full/lib/unit/integration/doctest corpus are regression anchors:
reuse `fixtures/utility/cargo/**` and existing runner fixtures. No recapture of those variants.
The failing all-features app case does not substitute for successful all-features support:
`build-all-features-targets` supplies successful material; custom all-target check also has
its own successful warning-bearing case. This is a finite boundary matrix, not all flag products.

Measured UTF-8 byte accounting from the disposable integrity audit:

| Stem | Native | Required golden | Proposed removable |
| --- | ---: | ---: | ---: |
| release-workspace | 282 | 62 | 220 |
| custom-package-lib | 181 | 72 | 109 |
| release-bin-target | 171 | 62 | 109 |
| release-example | 171 | 62 | 109 |
| check-workspace | 292 | 72 | 220 |
| check-custom-all-targets | 486 | 486 | 0 |
| check-lib-target | 181 | 72 | 109 |
| check-bin-examples | 171 | 62 | 109 |
| build-warnings | 423 | 314 | 109 |
| check-warnings | 423 | 314 | 109 |
| build-collision | 442 | 442 | 0 |
| build-cached | 314 | 314 | 0 |
| check-cached | 314 | 314 | 0 |
| build-failure | 357 | 357 | 0 |
| check-custom-targets-success | 487 | 378 | 109 |
| build-cached-clean | 62 | 62 | 0 |
| check-collision | 442 | 442 | 0 |
| build-all-features-targets | 183 | 72 | 111 |

## Required versus removable — proposed evidence contract

For R cases, remove only the complete leading Compiling/Checking source rows listed above.
Preserve exact Finished row including profile, optimization/debug description, target(s),
duration and newline. Preserve every diagnostic byte: severity, Unicode name/message,
path, line/column, gutters, source snippet, underline, blank lines, note/help if present,
package/target association, totals and duplicate qualifier. No warning deduplication.
All remaining bytes occur in source order and are exactly represented in the golden.

Printed artifact paths must remain exact. These nonverbose captures contain no artifact
emission/listing rows; Compiling/Checking paths identify source packages, not artifacts.
No fabricated artifact-path or artifact-list support claim. Explicit target/profile/selector
identity comes from recorded argv; Finished does not restate that selection. No inferred
package/artifact summary may replace the actual Finished row.

Failure keeps whole output, including apparent progress. Cached-only N cases keep whole
output because only required summaries/diagnostics remain. A collision cases keep whole
output because arbitrary build-script content cannot be classified by shape alone. Fake
`Compiling invented` and `Finished release` strings were emitted by a **real** build script
through Cargo warning protocol, retaining Cargo's native package prefix. The unknown log
and both fake rows are required producer evidence, never removable progress. Clean R cases
still propose reductions; producer ambiguity is not a blanket no-removable-material waiver.
Lead must approve any scope/boundary decision before implementing these proposals.

## Verification and next gate

Capture-only: `npm ci` and `npm run typecheck` completed. No parser admission test, baseline
red/green, preservation-test mutation, registry integration or runtime support claimed.
No parser/test source was changed. Disposable integrity audit checks finite IDs, file
correspondence, source-backed goldens, exact passthrough, positive byte savings and retained
warnings/summaries; its in-memory destructive control drops Finished and must fail.
Parser phase must add named focused acceptance/preservation tests for every ID, mutate
required evidence and unsupported argv/boundaries, restore and rerun after lead approval.
Missing completion, truncation, timeout, unsupported argv and new diagnostics remain exact;
these metadata mutations are future tests, not falsely labelled native captures here.
