# C06 GitHub Actions native provenance

Original project and driver authored under repository MIT license; no donor code.
Toolchain pinned to nightly-2026-10-08, rustc commit
1d81eb4ad9cd207e3e638bd32b17ec4fce8412a6, official manifest:
https://static.rust-lang.org/dist/2026-10-08/channel-rust-nightly.toml.
Runner records actual rustup/cargo/rustc verbose versions and platform in environment.json.

identity.json binds candidate/github/workflow/checkout SHA and Actions run/attempt.
Each case receipt binds argv/cwd, shared pipe EOF, exit, timeout, raw hash and source candidate.
cases.json snapshots hash recipe/project/metadata/raw files. Raw .txt equals shared pipe bytes;
no normalization, invented measurement or progress deletion. Custom literal text is a collision.
Capture success attests bounded native execution only, not final CI or parser admission.

Workflow exists only on campaign/cargo-bench-actions. Lead imports fixtures only, never workflow.
Official immutable action pins verified against upstream tag refs:
checkout v4.2.2 = 11bd71901bbe5b1630ceea73d27597364c9af683;
upload-artifact v4.6.2 = ea165f8d65b6e75b540449e92b4886f43607fa02.
https://github.com/actions/checkout/releases/tag/v4.2.2
https://github.com/actions/upload-artifact/releases/tag/v4.6.2
