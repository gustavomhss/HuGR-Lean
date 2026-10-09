# C06 hosted native capture acceptance

Capture only; candidate progress deletion is unapproved. Every output remains exact.
Original MIT tiny projects, no external crates. Builtin metrics come from test::Bencher,
not literal payloads. Custom logs are authored collision text, never measurements.

| Case | Predetermined source and outcome |
| --- | --- |
| default | Alpha default: two builtin suites, one ignored reason, custom log collision |
| cached | Same command/target after default; measurements run again, compilation reused |
| workspace | Alpha and beta suites, native names/units/metrics and package associations |
| selector | builtin sum_256 only, one measured and one filtered out |
| list | builtin --list; names and bench classification, no measurement required |
| ignored | qualified suite::ignored_sum --ignored --exact; one measured, one filtered |
| custom | harness=false literal progress collision; absent final LF retained |

All require exit zero and shared stdout/stderr pipe EOF. Timeout/nonzero/failed expectations
are retained as failure archives, not complete successful benchmark evidence. Source and recipe
snapshots, toolchain manifest, versions, raw bytes, hashes and candidate/run identities upload
even if capture fails. No runtime parser or reduction support is claimed.

Historical stable E0554 and literal fake-metric captures remain at repository commit
6a268e284f9cee8a29a9bd07f3b598a8f176e75a, fixtures/profiles/cargo-bench/** (MIT).
They were not recaptured or relabeled as builtin measurements.
