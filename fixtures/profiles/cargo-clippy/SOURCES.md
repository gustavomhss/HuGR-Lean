# C03 sources and reproduction

Original MIT-authored tiny dependency-free workspace: `project/**`; source and recipe
SHA-256 values: `source-hashes.txt`. Cargo lock contains only two local packages.
No donor source copied. Baseline regression is referenced in place, unchanged:
`fixtures/utility/cargo/warning/original.log`, commit
`07ffe15e2263c2925778022194c5385807216603`; original receipt/provenance remains authoritative.
It is a `cargo test` warning, not native Clippy evidence.

Pins verified by real commands: `cargo --version`, `rustc --version`,
`cargo clippy --version`, `rustup component list --installed`.
Cargo `1.98.0 (797e8a9bc 2026-08-05)`, rustc `1.98.0 (88d9e12ae 2026-08-18)`,
Clippy `0.1.98 (88d9e12ae1 2026-08-18)`, installed
`clippy-x86_64-apple-darwin`. Full material is recorded once in `cases.json`.

Recipe: from repository root, run
`node fixtures/profiles/cargo-clippy/capture.mjs /absolute/fresh/disposable/project`.
Parent must exist; project must not exist. Default uses approved temporary directory.
Recipe copies sources then runs original native argv recorded per case, sequentially,
offline with one build job and terminal color disabled. No installs or dependencies.
Target/cache state is retained between commands; changing order changes evidence.
Actual cwd/platform/environment/time and raw capture SHA-256 accompany the packet.
Ambient Cargo config is not claimed hermetic; concrete successful lint output is evidence.

Each native process exited normally within timeout, stdout empty. Fixture is unchanged
stderr UTF-8 bytes, no concatenation order inference, ANSI stripping, path substitution,
command rewriting, or output shaping. Rust canonicalizes `/var` to `/private/var` in
progress paths naturally. Timing/path bytes remain original; reruns need not hash-identical.

Four exact-only derivatives are explicitly labeled: appended opaque line, changed warning
heading, removed completion/truncated metadata, unknown boundary metadata. These are
negative witnesses, not extra native captures. Expected reduction files remove only
the leading native progress prefix; suffix byte identity is independently checked.

Capture-only handoff: parser/tests/mutation and CI belong to later lead work. Local
allowed repository checks are `npm ci` and `npm run typecheck`; no full suite or CI run.

Capture validation independently checked the complete case-ID set, source/capture hashes,
golden byte-suffix identity, later progress retention, and diagnostic/context sentinels.
In-memory golden-byte corruption was rejected; this is capture validation, not a parser
preservation mutation. Compiler control with a deliberately missing `--types` entry
produced TS2688; normal typecheck was then rerun. No tracked mutation was made.
