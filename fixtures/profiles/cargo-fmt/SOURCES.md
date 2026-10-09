# C04 native cargo-fmt captures

Original local fixture programs and recipe, MIT; no donor copies. Capture-only packet
at baseline `07ffe15e2263c2925778022194c5385807216603`, branch `campaign/native-v2/C04`.
Existing `fixtures/utility/cargo` and `fixtures/runners` remain regression anchors;
their build/test corpus was reused by reference, not recaptured.

## Native facts

Captured 2026-10-08, Darwin x86_64 (`darwin/x64` in cases):

- `cargo 1.98.0 (797e8a9bc 2026-08-05)`
- `rustfmt 1.9.0-stable (88d9e12ae1 2026-08-18)`
- `rustc 1.98.0 (88d9e12ae 2026-08-18)`

The rustfmt binary belongs to the installed Rust 1.98.0 toolchain but its own reported
version is 1.9.0-stable. Do not relabel it 1.98.0.
`cases.json` stores original argv, actual cwd, normal exit code, complete capture,
unknown presentation, versions/platform and per-output SHA-256. Status values are
proposed passthrough dispositions, not implemented parser support.

`output/*.txt` are unmodified native bytes. stdout/stderr share one OS pipe through
`/bin/sh -c 'exec "$@" 2>&1'`; command identity remains original Cargo argv, not the
capture shell. No stream concatenation, stripping, path rewriting or invented LF.
`sha256.txt` binds outputs, source snapshots, recipe and manifest. Empty outputs are
real zero-byte files with SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

## Reproduction and source record

From this worktree, choose a new disposable directory under the approved temp parent:

```sh
node fixtures/profiles/cargo-fmt/capture.mjs /var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/c04-fmt-reproduction
```

Recipe copies `project/` verbatim before native execution, uses inherited environment
plus `CARGO_NET_OFFLINE=true` and `CARGO_TERM_COLOR=never`, and records output after
normal process termination. No dependency downloads, compilation or formatting writes.
Final native cwd was `.../opencode/c04-fmt-native-project-v2`; native paths resolve via
`/private/var/...`, preserved exactly. Reproduction at a different cwd changes those
path bytes and their hashes. No claim of cross-platform byte-identical output.

Preliminary exploration used `.../opencode/c04-fmt-native-project`: all three members
included the syntax-broken member. It established that plain `fmt --check` ignores
`default-members` and was not silent. Final sources exclude `broken` and `silent`;
`silent` is an independent clean workspace, while syntax failure uses an explicit
manifest path. Final captures were made from those committed source snapshots;
preliminary projects remain disposable evidence outside the repository.

## Material policy and limits

Every diff, source filename, diagnostic snippet, command/path line, help line and
failed output is required. Silent success contains zero material and proves no
reduction. Verbose clean output contains only source identity and the rustfmt command;
preserve both pending independent lead investigation. Thus all ten cases propose
passthrough, with zero removable bytes: **exact-only; investigate**. No fake progress,
reduced golden, parser, mutation suite or completeness claim for C04 implementation.
Synthetic unknown/truncated/forged-success negatives belong in later tests, not here.

## Capture checks

`npm ci` and `npm run typecheck` completed; the same typecheck with a nonexistent
`--types c04_missing_calibration_type` failed with TS2688, then normal typecheck passed.
`shasum -a 256 -c sha256.txt` matched every inventory entry; a deliberately false
recipe digest failed. Recursive source comparison against the final disposable
project matched. These are capture/compiler checks, not parser preservation tests.
`git diff --check` reports native diff lines containing a single space and native
blank EOF lines; those required captured bytes are deliberately preserved unchanged.

## Clean all-workspace supplement — 2026-10-09

Base `22ddaa6`; original MIT five-file `supplement-project/` workspace, two library
crates alpha/beta, no dependencies or donor material. Shared original capture recipe
`../go-build/capture-supplements.mjs`, exact recipe SHA in `supplement-receipt.json`.
Actual argv `cargo fmt --all --check`, original disposable cwd in receipt. Separate
env metadata: RUSTUP_TOOLCHAIN=stable, CARGO_NET_OFFLINE=true, CARGO_TERM_COLOR=never;
other host environment inherited. No local toolchain change, build or formatting write.
Installed stable tools: cargo 1.98.0 (797e8a9bc 2026-08-05), rustc 1.98.0
(88d9e12ae 2026-08-18), rustfmt 1.9.0-stable (88d9e12ae1 2026-08-18).

Source snapshot copied verbatim; before/after hashes/bytes/LF/tails equal for workspace
manifest, both crate manifests and both lib.rs files. Normal native exit 0; stdout,
stderr and callback-order combined output are genuinely empty, read through both
pipe EOF events. This supplement uses separate native pipes, unlike old shared-pipe
captures; callback arrival order is not a kernel cross-stream ordering claim.

Modification record: appended stable passthrough case/inline empty expectation,
declared receipt archive string; `sha256.txt` cases.json digest refreshed from actual
bytes only. Every old ledger row except derived manifest digest unchanged; old
outputs, diffs, whitespace, sources and capture.mjs unchanged. Supplement files
bound by receipt rather than silently extending old ledger scope.
Receipt JSON layout compacted by adjacent `go-build/compact-supplement-receipts.mjs`,
with deep-equal parsed facts and unchanged native stream/source hashes.
Receipt stores metadata, source snapshots and actual captured streams; no fake physical artifact.

Verification: adjacent `go-build/verify-supplements.mjs` reads these two families
only, checks 27 public-filter passthrough results, original fmt byte/hash ledger,
supplement recipe/source/stream facts and eight corruption controls; copied mutations
restored. This adds clean --all proof, not reduction support. No full suite/typecheck
or CI run; lead review and final campaign verification pending.
