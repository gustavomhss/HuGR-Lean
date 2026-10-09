# Original MIT ordinary-invocation native captures

Scope extension after lead landed `9e797c42a17c717540e0a0f2560fe84130789243`:
offline is an optional Cargo execution flag, not evidence of producer identity. These four
captures were genuinely executed without it, not relabelled from earlier offline captures.
Original project/captures/independent goldens are MIT under the repository LICENSE; no donor
material. Existing native inputs/goldens were reused without recapture or modification.

## Capture environment and boundary

- Date: 2026-10-08; pre-extension parser SHA `9e797c42a17c717540e0a0f2560fe84130789243`.
- Cargo: `cargo 1.98.0 (797e8a9bc 2026-08-05)`.
- Rustc: `rustc 1.98.0 (88d9e12ae 2026-08-18)`.
- Platform: macOS 15.3.2, x86_64-apple-darwin.
- Cwd: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/c01-default-invocations`.
- Exact commands, executed sequentially: `cargo build`, `cargo check`,
  `cargo build --release -p ridge-lib`, `cargo check --release -p ridge-lib`.
  No appended offline/color flags. Cargo selected its default noncolored pipe presentation;
  presentation metadata remains conservatively `unknown`.
- Fresh dependency-free project, no external packages or registry network needed. First
  build created its local lock/target state; check then used fresh metadata. Release calls
  used the same source with a new release profile target state. Source was never changed.
- Python executed each exact argv with `subprocess.run(argv, stdout=subprocess.PIPE,
  stderr=subprocess.STDOUT, timeout=90)`. Both streams entered one pipe before execution,
  not post-hoc concatenation. Exit 0 observed after complete pipe EOF/process completion;
  no signal/timeout/truncation. Separate stream attribution unavailable.
- Native UTF-8 bytes were decoded, JSON-rendered to the tool transcript and transcribed via
  apply_patch. `.txt` retains native path/timing/order/Unicode/LF; `.expected.txt` independently
  removes only the leading Compiling/Checking row. No OpenCode producer-authentication claim.

## Complete unchanged original source

`Cargo.toml`:
```toml
[package]
name = "ridge-lib"
version = "0.8.2"
edition = "2024"
license = "MIT"

[features]
default = ["standard"]
standard = []
detail = []
```

`src/lib.rs`:
```rust
pub fn value() -> u32 { 23 }

fn dormant_café() {}
```

Both source files end in LF. Cargo generated local lock/build artifacts only. Reproduction
timing/cache/source-root paths can vary. Synthetic optional-offline/package/default-feature
variants in the owned tests are property inputs, not additional native capture labels.
