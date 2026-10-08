# C03 source pins and reproduction

Original MIT-authored tiny dependency-free workspace: `project/**`. Original source,
recipe and captures are pinned at commit `e89de8b963ada834769959c1d8189c8d84e8c934`, paths
`fixtures/profiles/cargo-clippy/{project,capture.mjs,source-hashes.txt,cases.json}`.
No donor source copied. Current source/recipe SHA-256 values: `source-hashes.txt`.

Original manifest is preserved byte-for-byte in `capture-receipt.json` (Git blob
`f9a6773382ebe1cac2fca15275671070d6b56d3b`). It retains versions, argv, cwd, environment,
termination, completeness, boundary and historical derivative recipes/hashes. Current
`cases.json` normalizes only actual native Clippy cases to shared schema; synthetic
negatives now live in tests. Existing Cargo warning regression stays referenced in place.

Pins verified by native `cargo --version`, `rustc --version`, `cargo clippy --version`,
`rustup component list --installed`: Cargo `1.98.0 (797e8a9bc 2026-08-05)`, rustc
`1.98.0 (88d9e12ae 2026-08-18)`, Clippy `0.1.98 (88d9e12ae1 2026-08-18)` and installed
`clippy-x86_64-apple-darwin`. Reach: macOS x86_64, explicit installed host target.

Recipe: from repository root run
`node fixtures/profiles/cargo-clippy/capture.mjs /absolute/fresh/disposable/project`.
Parent must exist; project must not exist. Recipe copies sources, invokes original native
argv sequentially, offline, color disabled, one build job. Lock contains only local packages.
Preserve command order/cache state. Ambient Cargo config is not claimed hermetic.

New native `C03/profile-dev` ran `cargo clippy --offline --workspace --profile dev` in the
original disposable cwd after collision capture, same cleared variables/environment.
Feature switch triggered real recompilation; actual stderr and independent one-row suffix
golden are recorded with capture time, hash and pinned project source in its flat case.

All native processes exited normally; stdout empty. Input files retain original stderr
UTF-8 bytes, paths and timings. No ANSI stripping, concatenation ordering, path replacement
or command rewriting. Rust naturally canonicalized `/var` to `/private/var`. Reruns need
not hash-identical. Recipe now emits shared native manifest without synthetic negatives;
this is a recorded modification of original pinned recipe, not a new receipt framework.

Focused verification: `npx tsx --test tests/profile-cargo-clippy.test.ts`,
`npm run typecheck`; byte suffix/hash controls and four restored preservation/admission
mutations documented in CASES.md. No global suite, build, smoke, benchmark or CI dispatch.
