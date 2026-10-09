# Original MIT conditional-warning native control

Captured for second cold review on 2026-10-08 at pre-fix parser commit
`4718c0d1d50d77df6afe8fd101f9afeed5186cc3`. Original project/capture/golden work is MIT
under the repository LICENSE; no donor material. Existing native cases were not recaptured.

## Native boundary

- Cargo: `cargo 1.98.0 (797e8a9bc 2026-08-05)`.
- Rustc: `rustc 1.98.0 (88d9e12ae 2026-08-18)`.
- Host: macOS 15.3.2, x86_64-apple-darwin.
- Cwd: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/c01-testcontrol`.
- Exact argv: `cargo check --all-targets --offline --color never`.
- Fresh dependency-free project, no external network, fresh local target/lock state.
- Python ran `subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
  timeout=90)`. Both streams enter one pipe before execution, not post-hoc concatenation.
  Exit 0 observed after pipe EOF/process completion, no timeout/signal/truncation.
  Separate stream attribution unavailable; presentation conservatively `unknown`.
- Native UTF-8 text was JSON-rendered to the tool transcript, then transcribed with
  apply_patch, preserving source path, Unicode, timing, order and LF exactly. Independent
  golden deletes only the leading Checking row. No OpenCode producer-authentication claim.

## Complete unchanged source

`Cargo.toml`:
```toml
[package]
name = "conditional-warning"
version = "0.4.1"
edition = "2024"
license = "MIT"
```

`src/lib.rs`:
```rust
pub fn value() -> u32 { 11 }

#[cfg(test)]
fn test_only_café() {}
```

Both files end in LF. Cargo generated local lock/build artifacts only. Source remained
unchanged during capture. Reproduction timing/source root may vary.

## Observed conditional grammar

Complete native output contains one dead_code diagnostic followed by
`warning: \`conditional-warning\` (lib test) generated 1 warning`, then Finished. It contains
no normal `(lib) generated` row: the function exists only in the test configuration.
The owned test uses the existing paired-warning case as a positive control for detecting
normal-lib summaries before asserting this native control's unpaired disposition.

Therefore all-targets does not universally require paired lib-test/lib totals. The parser
requires totals for actual pending diagnostics and validates every printed duplicate count;
it does not fabricate evidence or a missing-summary guarantee for optional independent
summaries absent from the observed complete input. Every printed summary remains exact.
