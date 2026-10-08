# Original native C01 captures (MIT)

All project source, captures and independently proposed goldens in this packet are original
work for HuGR-Lean, licensed MIT under the repository LICENSE. No donor material was copied.
Native command output is unedited: no path, timing, order, Unicode or newline normalization.
The deliberately adversarial project is original; output still comes from real Cargo, not
synthetic native text. Goldens are proposals, not captures and not parser-generated.

## Environment and boundary

- Capture date: 2026-10-08; baseline `07ffe15e2263c2925778022194c5385807216603`.
- Cargo: `cargo 1.98.0 (797e8a9bc 2026-08-05)`.
- Rustc: `rustc 1.98.0 (88d9e12ae 2026-08-18)`.
- Platform: `macOS-15.3.2-x86_64-i386-64bit-Mach-O`, host target `x86_64-apple-darwin`.
- Cwd: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/c01-tiny`.
  Cargo prints its canonical `/private/var/...` source paths; those are retained.
- No external dependencies or network; every command includes `--offline --color never`.
  Workspace default members are app and peer; collision is explicitly selected or excluded.
- First 17 retained captures used Python `subprocess.run(argv, stdout=subprocess.PIPE,
  stderr=subprocess.STDOUT, timeout=90)` sequentially, with exact argv from cases.json.
  OS redirects both child streams to one pipe before execution; no post-hoc concatenation.
  `run` returned exit code and complete pipe bytes after EOF/process completion; no timeout
  or signal occurred. Output was UTF-8 decoded and JSON-rendered to the tool transcript,
  then transcribed into `.txt` with `apply_patch`. The `.txt` files contain decoded native
  bytes, not JSON quoting. Per-stream attribution is unavailable at this combined boundary.
- `build-all-features-targets` was executed directly through the shell tool with the exact
  recorded command. Its two native rows and successful completion came from that tool's
  combined output; separate stdout/stderr attribution and cross-stream ordering unavailable.
  Presentation is conservatively `unknown` for every case despite explicitly disabled color.
- No OpenCode after-hook capture or producer-authenticated boundary claimed. Completion
  metadata is observed process completion, not inferred from the textual Finished row.

## Capture sequence/cache state

First batch, in order: release-workspace, custom-package-lib, release-bin-target,
release-example, check-workspace, check-custom-all-targets, check-lib-target,
check-bin-examples, build-warnings, check-warnings, build-collision, build-cached,
check-cached, build-failure. Second batch: check-custom-targets-success,
an unretained warm `cargo build --release -p c01-peer --lib --all-features --offline --color never`,
build-cached-clean, check-collision. Last: build-all-features-targets.
All used the same initially fresh local target directory. Warm invocation emitted only
Finished, was redundant with build-cached-clean, and is intentionally not a corpus case.
Cargo generated its local lockfile/target artifacts; nothing from those outputs was edited
into text captures. First batch all-features check legitimately enables the fail feature.

## Complete original tiny project source

Paths below are relative to cwd. Recreate verbatim to reproduce grammar; timing, scheduling,
absolute paths and cache-dependent messages may vary and are not promised byte-identical.

`Cargo.toml`:
```toml
[workspace]
members = ["app", "peer", "collision"]
default-members = ["app", "peer"]
resolver = "2"

[profile.small]
inherits = "release"
opt-level = 1
debug = true
```

`app/Cargo.toml`:
```toml
[package]
name = "c01-app"
version = "0.1.0"
edition = "2024"
license = "MIT"

[features]
default = ["base"]
base = []
extra = []
warn = []
fail = []
```

`app/src/lib.rs`:
```rust
#[cfg(feature = "warn")]
fn unused_café() {}
#[cfg(feature = "fail")]
compile_error!("C01 required diagnostic café 🦀");
pub fn value() -> u32 { 7 }
```

`app/src/main.rs`: `fn main() { assert_eq!(c01_app::value(), 7); }`

`app/examples/tiny.rs`: `fn main() { println!("{}", c01_app::value()); }`

`peer/Cargo.toml`:
```toml
[package]
name = "c01-peer"
version = "0.1.0"
edition = "2024"
license = "MIT"
```

`peer/src/lib.rs`: `pub fn peer() -> u32 { 9 }`

`collision/Cargo.toml`:
```toml
[package]
name = "c01-collision"
version = "0.1.0"
edition = "2024"
license = "MIT"
```

`collision/src/lib.rs`: `pub fn collision() {}`

`collision/build.rs`:
```rust
fn main() {
    println!("cargo::warning=   Compiling invented v9.8.7 (/producer/log)");
    println!("cargo::warning=    Finished `release` profile [optimized] target(s) in 0.00s");
    println!("cargo::warning=C01 unknown producer log café 🦀; retain exactly");
}
```

Every source file above ends in LF. Source was unchanged during all captures.
Corpus mutation controls operate in memory only; native source/captures were not mutated.
