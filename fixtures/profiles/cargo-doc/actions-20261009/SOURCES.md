# C05 hosted supplement provenance and scope

Original MIT project/driver; no donor source. Base 22ddaa6, exclusive cargo-doc fixture stem.
Historical fifteen cases, raw files, recipes and artifact bindings remain historical facts;
their generated per-build HTML is not recovered by this supplement.

Hosted Ubuntu only. Private RUSTUP_HOME/CARGO_HOME and dated nightly-2026-10-08.
Rust commit 1d81eb4ad9cd207e3e638bd32b17ec4fce8412a6. Official manifest captured verbatim:
https://static.rust-lang.org/dist/2026-10-08/channel-rust-nightly.toml.
Actual verbose rustup/cargo/rustc/rustdoc versions and environment recorded in environment.json.
Official immutable action pins:
https://github.com/actions/checkout/releases/tag/v4.2.2
11bd71901bbe5b1630ceea73d27597364c9af683
https://github.com/actions/upload-artifact/releases/tag/v4.6.2
ea165f8d65b6e75b540449e92b4886f43607fa02

Predecided cases (all exact passthrough, no approved progress deletion):
- default-nooffline: cargo doc without --offline, root default members, lib+bin, local dependency.
- bins-checking: --bins --no-deps with fresh target directory; binary uses own library and beta.
  A native Checking row is required for this proof; absence retains raw as a blocked finding.
- cross-aarch64: --target aarch64-unknown-linux-gnu --no-deps after private rust-std target install;
  generated c05_alpha HTML must contain target-conditional aarch64_marker.
- config-control: --lib --no-deps, no user config; generated HTML must exclude user_config_marker.
- user-config: same --lib --no-deps, fresh target, private CARGO_HOME/config.toml supplies
  build.rustdocflags=["--cfg", "capture_user_config"]; HTML must include user_config_marker.
  Marker item pages and crate-root pages retained with original generated paths and hashes.

Each process shares one stdout/stderr pipe and waits for EOF. Timeout/nonzero outputs retained;
failed expectations remain named failures, never successful proof. Source/recipe/config snapshots
and hashes bind actual candidate/workflow/checkout/run. Upload runs even on capture failure.
No local Rust installation or native execution. Branch-only workflow must never be imported
to lead/default full CI. Capture success is not final CI or blanket Rustdoc compatibility.
