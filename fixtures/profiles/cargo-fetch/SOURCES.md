# C08 native Cargo fetch/install provenance

Capture-only packet, based on `71bcaea2d5f0bf72e9128ebf80517ad1099f6cdd`.
Owner: `campaign/native-v2/C08`; only `fixtures/profiles/cargo-fetch/**` assigned.

## Producer and boundary

- Real `cargo 1.98.0 (797e8a9bc 2026-08-05)` and
  `rustc 1.98.0 (88d9e12ae 2026-08-18)`, darwin/x64.
- `RUSTUP_TOOLCHAIN=1.98.0` pins execution, without modifying global toolchain settings.
  Cargo's resulting toolchain-override warning is retained, including help and note.
- Every Cargo child writes stdout and stderr to the **same open file descriptor**.
  Synchronous exit wait precedes reading; no text replacement, stream concatenation,
  ANSI removal, path rewriting or EOF normalization touches native inputs.
- `cases.json` records original argv, shell-display command, absolute cwd, environment
  overrides, start, elapsed time, exit, byte length, EOF and SHA-256. Inputs use `file`
  only. `presentation=unknown` describes redirected, non-terminal-rendered output.
- Collector SHA-256 is bound per capture. The supplementary installed-state collector
  preserves original captures and appends its own native observation.
- Temporary root:
  `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/c08-native-P2aQXf`.
  Cargo home, target, install root and TMPDIR all live beneath it. Verbose collision
  uses a separate cold target. Offline-cold failure uses a separate empty Cargo home.
- Native state remains in that temporary root. Executables are not vendored;
  per-install absolute artifact paths, modes, sizes and hashes live in `cases.json`.
  Each successful path install executes the actual resulting binary directly:
  exit and output hash recorded, output archived. These small executable-output
  archives concatenate stdout then stderr; they are not Cargo input observations.

## Original project and public dependency

`project/**` is original MIT fixture code, authored for C08; no donor source copied.
`captured-project/**` preserves executed source, generated native lockfiles, missing-lock
project and impossible-version project. Per-file captured-project hashes are recorded.
Local binary has no dependencies. Its unused variable intentionally produces native
warning/snippet/help/summary evidence. Features `extra` and `collision` are original.

Fetch needs one actual public download: `itoa = "=1.0.15"`, no enabled optional features.
Cargo downloaded it from crates.io; archive checksum:
`4a5f13b858c8d314ee3e8f639011f7ccefe71f97f96e50151fb991f267928e2c`.
Registry package declares `MIT OR Apache-2.0`, repository `https://github.com/dtolnay/itoa`;
its `.cargo_vcs_info.json` records commit
`e2766b868e4ac1ae2bf5bea1ac43d4c0da23b899`, root path.
Pinned package files used by Cargo: `Cargo.toml`, `src/lib.rs`; modifications: none.
Dependency archive/source/license text is not copied into this repository. Checksum and
commit are package metadata, not an independently audited binary-to-source attestation.
Cold resolution's `available: v1.0.18` advice remains exact; registry advice may change
on reproduction despite the pinned fetched version.

## Reproduction

Run in a fresh copy of this packet to avoid overwriting historical raw observations:

```sh
node fixtures/profiles/cargo-fetch/capture.mjs
node fixtures/profiles/cargo-fetch/capture-installed-state.mjs
```

Requires installed Cargo/Rust 1.98.0 and this macOS temporary parent, plus public
crates.io access for cold fetch and impossible-version resolution. Main collector
creates fresh isolated directories and copies only original `project/**`. Supplement
uses the newly recorded root. Native absolute paths, timing, binary hashes and available
registry versions can differ; reproduce semantics, not historical byte equality.
No global installation, private registry, large dependency graph or profile runtime
execution is part of these recipes.

## Scope, candidates and review

All entries declare exact passthrough with zero approved removable bytes. This is an
expected disposition for future corpus promotion, not a tested public-filter result.
No fixture-only tests, typechecks, full checks, smoke, benchmark or CI ran.
Native fetch/install and execution of tiny original bin are capture operations.

Possible future deletion candidates: index/download/compile progress only. None is
approved. Resolution/version advice, every installed/replaced/listed package and
executable path, Finished summary, native diagnostics, build-script warnings and
visible build-script stdout remain requested evidence. No proposed golden removes them.

Human exact-preservation approval applies to documented producer ambiguity only;
it does not waive absent variants. The verbose build-script collision is **prefixed**
by Cargo with `[c08-local-bin 0.1.0]`; it does not prove an unprefixed spoof at this
boundary. Normal verbosity hides arbitrary build-script stdout but exposes its
`cargo::warning` through a native warning wrapper. Those distinctions are retained.

Repeated local `install --path` replaces the already-installed package without
`--force`. The case name records input state, not an invented ignored/no-op result.
`install --list --root ...` independently confirms installed version and executable.
Registry-install `Ignored ... already installed` is not claimed: requested local-path
operation did not produce that variant. A demand for that distinct registry behavior
would need separate scope; this packet does not silently substitute a fabricated line.
Full family completeness, parser support, producer authentication and reductions are
not claimed. Independent capture review and corpus promotion remain pending.
