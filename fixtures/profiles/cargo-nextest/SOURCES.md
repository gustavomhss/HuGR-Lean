# C07 cargo-nextest native capture provenance

- Baseline: `71bcaea`; branch: `campaign/native-v2/C07`.
- Producer: https://github.com/nextest-rs/nextest at
  `cd1d6d5467322dbc0d39a80cb671d000ac302798`, tag `cargo-nextest-0.9.148`.
- Official asset: `cargo-nextest-0.9.148-universal-apple-darwin.tar.gz` from
  https://github.com/nextest-rs/nextest/releases/download/cargo-nextest-0.9.148/cargo-nextest-0.9.148-universal-apple-darwin.tar.gz
- Asset SHA-256: `6c23b7fb4ca82c571fc8dfedbab45bfa773d45918f933170c85d21cd7f4b852b`.
  Compared with pinned GitHub release digest and downloaded official `.sha256` file.
  Executable SHA-256 and published checksum text live in `capture-receipt.json`.
- Producer license: MIT OR Apache-2.0. Pinned upstream paths `LICENSE-MIT` and
  `LICENSE-APACHE` copied unchanged to `archives/LICENSE-MIT.txt` and
  `archives/LICENSE-APACHE.txt`; individual hashes and modification records in receipt.
  No runtime donor code copied. Rust workspace and capture scripts are original MIT project work.
- Binary reports matching full commit. Official release attribution is recorded;
  build-to-source correspondence was not independently attested.

## Recipe

Create a fresh isolated directory under the approved temporary root. Download only the
named official asset and matching `.sha256` file with `gh release download`.
Run, from this worktree:

```sh
python3 fixtures/profiles/cargo-nextest/capture.py "$ISOLATED_DIRECTORY"
python3 fixtures/profiles/cargo-nextest/capture-more.py
python3 fixtures/profiles/cargo-nextest/finalize-receipt.py
```

First recipe intentionally retains its original expectation mistakes: it captures every
initial command, writes receipts, then exits 1 because `--workspace -p capture-beta`
still selects the workspace (native exit 100), and malformed filter exits 94.
Supplement records initial expectations, corrects observer metadata, and adds genuine
single-package and uncaptured-log witnesses. No original raw file is overwritten.
Supplement refuses duplicate captures. Finalizer archives generated dependency-free lockfile
and corrects the verbose-list description: native nextest emits neither ignored labels nor reasons.

Only tiny original workspace compilation occurred. `HOME`, `CARGO_HOME`,
`XDG_CONFIG_HOME`, and nextest binary path are isolated. Ambient `CARGO_*`, `NEXTEST_*`,
`RUSTFLAGS` and `RUSTDOCFLAGS` removed; existing rustup toolchain location retained.
No Cargo install or global/default config changes. Compilation target remains outside worktree.
Toolchain versions, Darwin host, exact argv/cwd, timestamps and complete termination are recorded.

## Boundary and associations

Each command uses original argv with stdout pipe and stderr redirected to that same pipe
before exec. Collector reads through EOF and waits; no PTY, rewriting, normalization,
truncation or invented inter-stream ordering. Tests may internally capture logs; native
nextest renders those logs or hides them according to the original flags. Raw bytes are untouched.

`cases.json` uses `hugr-lean/native-cases/1`, file-only inputs, no inline duplicate.
Every input has UTF-8 byte length, SHA-256, final-LF/tail bytes and source/receipt association.
Archive declarations are noninput `.txt` path strings. Original source hashes bind the copied
two-package, three-binary, nine-test workspace; Rust ignore reasons stay in source because
the captured reporter does not print them.

All cases declare passthrough pending lead decision. This is capture metadata, not an
executed public-filter assertion or evidence of a new parser. Raw file itself is required
whole-output evidence; no duplicate expected file or reduction golden is claimed.
