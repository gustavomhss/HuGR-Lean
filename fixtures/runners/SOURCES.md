# Runner fixture provenance and support

## Pinned donor fixtures

Repository: https://github.com/dPeluChe/trs

Commit: `0175ae73f36709fd4a9242b2e431d026d6f82bb3`

License: MIT, Copyright (c) 2026 dPeluChe. Pinned license:
https://github.com/dPeluChe/trs/blob/0175ae73f36709fd4a9242b2e431d026d6f82bb3/LICENSE

The lead owns the central donor license/notice. These files were read through
the GitHub contents API, then copied with `apply_patch`. No donor implementation
or old HuGR implementation was copied.

| Local file | Donor path at the pinned commit | Git blob SHA-1 | Modifications |
| --- | --- | --- | --- |
| `build_cargo_errors.txt` | `tests/fixture_data/build_cargo_errors.txt` | `01c4d6b98b3b6dad3962f33bd17d7b64a6e15478` | None; exact bytes |
| `cargo_test_real_failures.txt` | `tests/fixture_data/cargo_test_real_failures.txt` | `66f4a414ea48ac742288f280d54f0d5446e0221f` | None; exact bytes, including leading/trailing blanks |
| `pytest_real_default.txt` | `tests/fixture_data/pytest_real_default.txt` | `e73456c12b7fc523378262a82cbaf14c99142caf` | None; exact bytes |

All three fixtures exercise passthrough, including when exit metadata incorrectly
says zero. Tests verify their canonical LF Git blob hashes (checkout CRLF is
normalized only in the fixture-reading test helper).

## Native conformance samples

`native/` contains original, tiny Rust, Python and Go samples under this package's
MIT license. Success fixtures were captured from these samples on macOS:

| Fixture | Tool | Invocation in `native/` |
| --- | --- | --- |
| `cargo_test_success.txt` | Cargo 1.98.0 | `cargo test --color never` |
| `cargo_build_success.txt` | Cargo 1.98.0 | `cargo build --color never` |
| `pytest_success.txt` | pytest 9.0.3, pluggy 1.6.0, Python 3.14.5 | `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python3 -m pytest --color=no` |
| `go_test_success.txt` | Go 1.27.1 | `go test -v` |

Native output lines, Unicode, paths and timings are retained. Only these tools'
output was copied, excluding shell directory/version output. The normal
plugin-enabled pytest run was also inspected; its plugin/asyncio rows are
intentionally unsupported.

## Deliberately narrow support

| Profile | Accepted argv | Entire output grammar |
| --- | --- | --- |
| `cargo-test` | `cargo test`, optionally `--color never` or `--color=never` | Compilation progress, modern unoptimized test-profile finish, one native test executable, flat libtest results and one consistent successful summary |
| `cargo-build` | `cargo build`, same optional color flags | Compilation progress followed by one modern unoptimized dev-profile finish |
| `pytest` | `pytest`, `python -m pytest` or `python3 -m pytest`, optionally `--color=no` | Default pytest 9.0.3 / pluggy 1.6.0 session; platform/root, optional configfile, collection, nonwrapped per-file dot/skip progress and one consistent successful summary |
| `go-test-verbose` | `go test -v`, optionally `.` | Flat, sequential tests in one package, paired RUN/PASS or RUN/SKIP, native PASS and timed package summary |

Only complete shell observations with exited code zero qualify. All diagnostics,
warnings, unknown logs, reporter/version/flag variants, wrapped pytest progress,
Cargo doc-tests/multiple executables, Go logs/subtests/parallel tests/cached
summaries and other unsupported output return `undefined`. Thus their original
output, including all skip reasons and compilation diagnostics, survives.

## Per-profile preservation contract

Passing test names and fully passing file names are intentionally removable
presentation. They are not critical identities. Failure and skip identities are
critical; original native final summaries are always critical. Cargo and pytest
verify native counts before deleting successful progress. Go's native summary
has no numeric test total: its grammar verifies unique matching RUN/result pairs,
the final PASS, and one timed package summary, without synthesizing a count.

| Profile | Critical evidence in accepted reductions | Allowed presentation deletion | Additional retained context |
| --- | --- | --- | --- |
| `cargo-test` | Original `test result: ok.` summary; every ignored test's name and complete reason row | Compilation progress, `running N tests`, passing `test ... ok` rows including their names, blank separators | Original Finished and Running executable rows |
| `cargo-build` | Original Finished dev-profile summary | Compilation progress including crate names | None |
| `pytest` | Original final summary; every per-file progress row containing a skip, including its file identity and skip marks | Session banner, collection progress, fully passing file rows including their names, blank separators | Original platform/version, rootdir, and optional configfile rows |
| `go-test-verbose` | Original timed package summary and final PASS; every skipped test's RUN and SKIP pair, including its identity | Passing RUN/PASS pairs including their test names | None |

Default pytest exposes skipped file identity, not individual skipped test names
or reasons. The whole mixed progress row is retained, including its incidental
passing marks. Printed skip reasons outside a supported grammar trigger exact
passthrough, as do failures, warnings, compile diagnostics and user logs. These
outputs produce no Reduction, so their entire original evidence is preserved.

Every retained line, including additional context and any retained skip or
diagnostic evidence, must also belong to `required` as an intact UTF-16 source
span. Runner `pieces` are source spans only: text pieces, synthetic totals and
synthetic summaries are forbidden. Direct tests check both emitted output and
required declarations, using each fixture's supported actual command and argv.

Runtime version is observable only in pytest's banner; Cargo/Go admission is
grammar-based, not a claim to detect their binary version.
