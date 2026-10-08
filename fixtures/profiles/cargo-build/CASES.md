# C01 — approved native build/check packet

State: REVIEW. Lead approved the 11 candidate reductions on 2026-10-08. Baseline:
`07ffe15e2263c2925778022194c5385807216603`. `cases.json` status is the acceptance
disposition for the isolated public filter with `{ profiles: familyProfiles }`.
Registry integration remains lead-owned; paths stay relative to this packet directory.
Cold review FIX-FIRST requested structural project values; three genuinely renamed-project
captures extend the matrix below. Native provenance: `STRUCTURAL-SOURCES.md`.
Second cold review freezes deletion after the first diagnostic and validates summary target
contexts against selectors. Native unpaired test-warning control: `CONDITIONAL-SOURCES.md`.

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
| structural-build | renamed build + ship profile + spark + additive lib/bin/example + two dependency versions + two warnings | R | three Compiling rows; Locking required |
| structural-check | renamed check + ship profile + spark + additive lib/bin + dependency versions + two warnings | R | three Checking rows |
| structural-check-buildscript | renamed release check + build script Compiling + dependencies Checking + two warnings | R | three Compiling/Checking rows |
| conditional-test-warning | check + all-targets + cfg(test)-only unused function; unpaired lib-test warning | R | leading Checking row only |

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

For R cases, remove only leading Compiling/Checking source rows. A retained Locking preamble
does not end the leading deletion phase. The first diagnostic permanently closes that phase:
recognized progress before totals, after totals or between later diagnostic blocks stays exact
as required source evidence. Unknown progress grammar and progress inside a diagnostic body
refuse the whole stream. Warning blocks, totals, finish and native Locking stay intact.
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

`tests/profile-cargo-build.test.ts` names every case ID against independent byte-exact goldens
using the public filter. It also tests unknown insertion at every row boundary, missing/extra
finish, counterfeit warning/context/totals, arity/duplicates/conflicts, wrong native profile,
Unicode/CRLF/control bytes, metadata refusal and one delegated original default-build fixture.
Actual original-profile red and production-mutation/restoration receipts: `VERIFICATION.md`.
No registry integration or installed-runtime support claimed. Capture-only integrity audit
remains historical; all native inputs and goldens stay unchanged.

## Closed implementation boundary

New grammar requires `--offline`. Flags are exactly captured spellings plus existing
`--color=never`; duplicate flags, bool values, missing arguments, release/profile conflicts
and exclude-without-workspace refuse. Selectors are additive, including lib/bin/example,
all-targets and workspace/package combinations. Package/exclusion/profile/bin/example values
use structural Unicode identifier grammar with hyphens/underscores. Features use unique
nonempty comma-separated identifiers, including package/feature.
Target values are structural names or JSON source paths, including relative paths and spaces
when quoted. No literal project/package/profile/feature/version/path whitelist remains.
The unchanged core literal-command tokenizer still rejects non-ASCII argv, backslashes and
`?` even when quoted; those public invocations remain exact. Source output paths/Unicode are
not subject to that argv tokenizer. No core-boundary expansion is claimed.
The original no-new-grammar build argv delegates directly to the unchanged original profile.

Native progress uses structural package/SemVer/source-path fields. Dependencies, repeated
package names at different versions, and Compiling within check are valid. Build does not
admit Checking. Complete stream validation permits progress only outside diagnostic bodies;
only the leading phase can delete it, and the first diagnostic closes deletion permanently.
Native finish compares profile with argv name (default dev or release) and parses optimization
syntactically: optimized/unoptimized with optional debuginfo, finite two-decimal seconds.
It never infers optimization from profile name.

Warnings admit bounded `function NAME is never used` dead_code blocks: structural source paths,
positive source positions, corresponding source line/name/highlight, optional native default-lint
note and terminating blank row. Multiple diagnostics and per-package/target native totals use
printed counts, plural forms and known duplicate counts; no warning inferred from feature names.
New diagnostics allow repeated package/target totals (distinct versions have the same printed
name); replayed duplicate-only totals for an already completed context refuse. Unseen warning
kinds/help/context layouts refuse instead of silently accepting arbitrary producer rows.
All recognized warning bytes survive. Package-prefixed build-script warnings refuse the whole
stream. Metadata refusal is backed by direct reducer checks for nonzero/incomplete facts.

## Conditional summary/selector contract

Normal `(lib)` totals can belong to dependencies regardless of `-p` or target selectors.
Test contexts require `--all-targets` within this closed build/check vocabulary; `--tests`
is not an admitted flag. A lib-only invocation cannot admit lib-test/bin-test totals.
Ordinary bin totals require default selection or matching `--bin`, `--bins`, `--all-targets`;
example totals require matching `--example`, `--examples`, `--all-targets`. Non-dependency
contexts must match `-p` when selecting one package without `--workspace`; workspace/package
union retains generic workspace target identities. Selectors remain additive.

Actual pending diagnostic blocks must have consistent printed totals before Finished.
Native `conditional-test-warning` proves an all-targets lib-test total can legitimately stand
alone when the warning exists only under cfg(test). No universally paired lib-test/lib totals
are inferred. Optional duplicate-only summaries absent from complete input are not claimed
missing evidence; when present they are validated and retained byte-exact. The tests explicitly
accept the valid unpaired control and the paired case with its optional final duplicate-only
summary omitted, while refusing a missing total for a pending actual warning block.
