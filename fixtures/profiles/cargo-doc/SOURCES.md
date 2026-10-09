# C05 local native source record

Baseline: `07ffe15` (campaign scaffold). Author: C05 capture agent. License: repository MIT.
All Rust material and capture recipes were authored locally; no donor material was copied.
Source paths are `project/**`; source hashes below bind the exact project used, not upstream fixtures.

Native versions, captured from successful `--version` commands on 2026-10-08:

- `cargo 1.98.0 (797e8a9bc 2026-08-05)`
- `rustdoc 1.98.0 (88d9e12ae 2026-08-18)`
- `rustc 1.98.0 (88d9e12ae 2026-08-18)`; host `x86_64-apple-darwin`, LLVM 22.1.8.
- Capture runtime: Node v22.17.1; platform `darwin/x64`.

Reproduce: `node fixtures/profiles/cargo-doc/capture.mjs`, then optional
`capture-bins.mjs` and `capture-checking.mjs` in that same directory. Each prints JSON;
it does not write goldens or execute HuGR. Paths, scheduling and timings will differ.
Project is copied into a disposable macOS temporary directory, removed after capture.
No external or local package dependencies; workspace has two crates and an alpha build script.
Cargo creates its own lockfile and artifact tree in that disposable copy.

All recorded argv are actual `cargo doc --offline ...` invocations, including default-members
selection. Environment for every case: `CARGO_TERM_COLOR=never`, `CARGO_NET_OFFLINE=true`,
`RUSTFLAGS=''`, `RUSTDOCFLAGS=''`, `LC_ALL=C`, and `CARGO_TARGET_DIR` equal to its
`targetDirectory` field. Other environment variables inherit the capture process; no claim
of hermetic host/config isolation. `cached` immediately repeats `default` with its target tree.

Boundary: `/bin/sh -c 'exec "$@" 2>&1' capture <actual argv>` connects both native
descriptors to one pipe before Node captures bytes. Completed exited streams only, no
stdout/stderr concatenation, terminal rendering, OpenCode wrapper, path normalization,
timing substitution, warning editing, or synthetic native output. All committed streams
end in LF. `native.txt` is literal decoded UTF-8, bound by raw SHA-256 and byte length.
Expected proposals were independently written as literal text, without invoking a filter.
Artifact hashes were taken from actual generated crate-root HTML before deleting the project;
HTML is not vendored. Native `Generated` path/count text is retained, including singular
`and 1 other file`. Wall-clock `elapsedMs` and Cargo's own `Finished ... in ...` differ by design.

Recipe SHA-256:

| Path | SHA-256 |
| --- | --- |
| capture.mjs | 7aa1862f9d7c1b4b39024505d8e753e0449233dca39669d6bd9d68fcb08c64a8 |
| capture-bins.mjs | 400814ccb5bd9d8794cd32c50e1a6c37891f227904bf8718072c8a4438d6e438 |
| capture-checking.mjs | 9d0bd63b520f223215e088934e218ca1253a431c48c105a1f9c9119c15c7082c |

Project SHA-256 (paths relative to `project/`):

| Path | SHA-256 |
| --- | --- |
| Cargo.toml | 00d9c1e9a193152d822bc533417c15c8df5e3a7f08405b808c5d8fd1c0d3eecd |
| alpha/Cargo.toml | 68fb41b6bcc387f8d04e014fa9805a3b9ee363539540e15edccbe1ef7d433297 |
| alpha/build.rs | 7335033faf5a8dc3513d39e781325979cdc1f515d8e525100680bbdc4ab74d1a |
| alpha/src/broken.rs | bbfe721f470ffee879d4d32da4b3aa9ffaf1cfa24820b8c542880bce211f1ea8 |
| alpha/src/lib.rs | 3ff02d0dd0fa01fd5654016da033d52e58f8c0885491026d7c4a988aa343c874 |
| alpha/src/main.rs | 6bb83563d85a21d793f1ae9bc19735be73fba80040b06c51bb698f0320d13670 |
| beta/Cargo.toml | 4332d6d2efd4778d2efb28a5e433cee08a9bc6b21795c1078e0b9eae4bd37abb |
| beta/src/lib.rs | 5a89edfa119c16044e06e4e3a539bdfb0608fa40857579601a52265257d546a3 |

Modification record: `capture-checking.mjs` appends exactly
`\n[[bin]]\nname = "doc-tool"\npath = "src/main.rs"\n` to disposable alpha manifest.
Modified manifest SHA-256: `d5b93884d176acb38ddcc49323634be3d00bfbfefa6a508f63689364a1d115ce`.
Case ID records capture intent; despite its name, `checking-warning` emits `Documenting`,
not `Checking`. It proves a distinct bin artifact and rustc dead-code warning, not Checking grammar.

Aborted attempt: first capture hit harness 120-second timeout before printing JSON. Its
recipe hashed every target file; no stream from that attempt is admitted as complete.
Recipe changed to hash only generated crate-root HTML and bound each child to 60 seconds.
Final main capture and both supplements exited successfully; syntax-fail native child exited 101.

## Approved bounded grammar: added native witnesses (2026-10-09 UTC)

`capture-three.mjs` SHA-256: `e6df9213de9b722cb7341b7b31db75e8a85086d506969594c8725c40248bf132`.
Recipe copies beta to gamma, changes gamma package name to doc-gamma, adds gamma workspace member,
and captures actual `--workspace --no-deps --features doc-alpha/doc-warning --jobs 1`.
Native output proves `and 2 other files` and two Documenting rows after a complete warning frame/summary.
Modified root Cargo.toml SHA: `cea0619844c913f90d77ceb90ad6ced61777e8502f16b9718a242cc2082ad373`;
gamma/Cargo.toml SHA: `d9f1dc2ff33b85bf48b40d62f28ee7cf517f0e099c072b0ab731b1011c65b4a4`;
gamma/src/lib.rs SHA: `5a89edfa119c16044e06e4e3a539bdfb0608fa40857579601a52265257d546a3`.

`capture-options.mjs` SHA-256: `56b8ac47ecbc7761e9aa00e6a0232b1715ce215626ccf901abea2fbbfaf35a69`.
Recipe appends exactly `\n[profile.custom-doc]\ninherits = "dev"\n` to disposable root manifest.
Modified manifest SHA: `fee5c1edaf0f0ecd732a495044d539b581f09f9c7f085c152abb7034b89ab13e`.
Actual argv includes --manifest-path Cargo.toml, --profile custom-doc, host --target, -p doc-alpha,
--features doc-warning, --no-deps and --offline. Native finish retains the custom profile name;
artifact retains the requested target. Both additional captures completed with exit 0, same tool
versions, environment and merged-stream boundary as above. Their independent expected proposals
were authored literally; no filter generated them. All root HTML hashes were measured before cleanup.

The archived `capture-bins.mjs` header describes a failed Checking-capture intention. Its immutable
executed recipe bytes are retained for hash binding; actual output disproves that intention.
