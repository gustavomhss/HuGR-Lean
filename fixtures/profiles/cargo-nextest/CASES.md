# C07 native evidence packet — capture only

All IDs below have prefix `C07-`; input is `raw/<suffix>.txt`.
Disposition: `CAPTURED_EXACT_PENDING_LEAD_DECISION`; requested passthrough.
Required evidence: whole raw file, including logs, names, binary/package associations,
skip counts, summaries, diagnostics, paths and exact EOF. Proposed removable bytes: **0**.
Acceptance test name: **not added or run (capture-only assignment)**.

| Suffix | Native variant / observed evidence | Exit |
| --- | --- | --- |
| version | 0.9.148, full matching producer commit and host | 0 |
| cargo-version | Cargo 1.98.0 | 0 |
| rustc-version | rustc 1.98.0, verbose host/LLVM evidence | 0 |
| run-help | Actual pinned flag/reporter reference | 0 |
| success-default | Six passes across three binaries; three skips; default reporter hides successful test logs | 0 |
| success-logs | Same selection; all status/footer rows; immediate stdout/stderr; native-shaped user output | 0 |
| logs-final | Expression selects two logging tests across packages; seven skips; final stdout/stderr | 0 |
| ignored-only | Two ignored tests execute; seven skips; immediate ignored stdout/stderr | 0 |
| ignored-all | Eight passes, one failure filtered; both ignored tests run; final successful logs | 0 |
| failure | All nonignored tests continue with no-fail-fast; six pass, one fails, two skip; panic and immediate-final logs | 100 |
| package-filter | `--workspace -p capture-beta` selects workspace; real failure cancels remaining tests; initial observer expectation retained | 100 |
| positional-filter | `-- alpha_pass`; one pass, eight skips | 0 |
| exclude-name | Expression excludes failure plus libtest `--skip alpha_logs`; five passes, four skips | 0 |
| no-tests | Empty expression selection with explicit `--no-tests pass`; zero run, nine skips | 0 |
| list | Seven nonignored names associated with three binaries; ignored names omitted | 0 |
| list-filter | Two expression-selected names in two packages | 0 |
| invalid-flag | Native unknown-flag diagnostic and usage | 2 |
| invalid-filter | Native parse spans/errors; exit 94; initial observer expectation 2 retained | 94 |
| isolated-package | `-p capture-beta` without workspace; two passes, one binary; stdout/stderr | 0 |
| no-capture-collision | Two tests; seven skips; serial uncaptured stdout/stderr; warning that test-threads flag is ignored; PASS/Summary/Finished collisions | 0 |
| status-none | Pass/status footer suppression flags still retain start and summary | 0 |
| list-ignored-all | Verbose list contains all nine names, binary paths/cwd/build platform; no ignored reason or label emitted | 0 |
| list-help | Actual pinned native list flag reference | 0 |

## Reduction boundary

User approved exact retention of ambiguous logs. Collision witness is original Rust
`alpha_collision`, not manually edited reporter output. Both captured-log sections and
`--no-capture` contain native-shaped PASS, Summary, Starting, Finished and separator text.
Deleting matching progress lines without a producer boundary would erase user data.
Default hidden logs are native reporter policy, not filtering savings; collector cannot
recover bytes producer did not emit. No deletion, parser stub, baseline red/green or completed
runtime support is proposed.

Native footer timings, run IDs, panic thread IDs and compilation paths vary on recapture.
Hashes attest these exact saved bytes, not deterministic fresh-run equality.
Bounded reach: pinned Darwin plain pipe reporter, serial default profile, stated flags.
Custom profiles/reporters, color/TTY, other OS versions, retries/flaky/timeouts, JUnit/JSON,
archive execution, partitioning and cross-target runs were not captured.
Safe-format implementation and corpus promotion remain lead work; no blanket scope waiver.
