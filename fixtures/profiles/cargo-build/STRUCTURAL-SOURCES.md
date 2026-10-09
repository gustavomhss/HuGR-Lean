# Original MIT structural-project native captures

Cold review requested structural project values instead of fixture allowlists. Three added
captures are original work under the repository MIT LICENSE; no donor source was copied.
They are real Cargo output, not synthetic renames. Existing 18 native files/goldens were reused.

## Boundary and environment

Date: 2026-10-08. Pre-fix parser SHA: `f62b356f9f1c2048da5e26bce565ccd970bbc988`.
Cargo: `cargo 1.98.0 (797e8a9bc 2026-08-05)`.
Rustc: `rustc 1.98.0 (88d9e12ae 2026-08-18)`.
Platform: macOS 15.3.2, x86_64-apple-darwin.
Cwd: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/c01-structural/app`.
Printed canonical `/private/var/...` source paths, timings, Unicode, order and LF are unchanged.

Each exact command is in cases.json. Python executed its argv with
`subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=90)`.
Both child streams were redirected into one pipe before execution, not concatenated later.
Process returned exit 0 after pipe EOF, no signal/timeout/truncation. UTF-8 bytes were decoded
and JSON-rendered in the tool transcript, then transcribed unchanged into native `.txt`
using apply_patch. Separate stream attribution unavailable; presentation remains `unknown`.
Independent goldens retain every byte except complete Compiling/Checking rows. The native
Locking row in structural-build remains exact required evidence; it is not removable progress.
No OpenCode boundary/producer-authentication claim.

Sequence: structural-build on fresh local target/lock state; structural-check using that
ship profile cache; structural-check-buildscript using a new release profile. No external
dependencies/network. The two local atlas-core versions are genuine distinct packages.
Cargo check's third capture genuinely emits Compiling for the app's build script before
Checking dependency packages. Two source warnings are unrelated to the selected spark feature.
Project source was unchanged during all captures; Cargo generated only local lock/artifacts.

## Complete project source

Paths relative to `c01-structural/`; all files end in LF.

`app/Cargo.toml`:
```toml
[workspace]
members = ["."]

[package]
name = "atlas-service"
version = "1.2.3-alpha.2"
edition = "2024"
license = "MIT"

[features]
spark = []

[dependencies]
core-new = { package = "atlas-core", path = "../core-new" }
core-old = { package = "atlas-core", path = "../core-old" }

[profile.ship]
inherits = "release"
opt-level = 0
debug = false
```

`app/build.rs`: `fn main() { println!("cargo::rerun-if-changed=build.rs"); }`

`app/src/lib.rs`:
```rust
mod engine;
pub fn value() -> u32 { core_new::value() + core_old::value() }
```

`app/src/engine.rs`:
```rust
// Original MIT structural Cargo diagnostic fixture.

fn latent_café() {}

fn spare_worker() {}
```

`app/src/main.rs`: `fn main() { assert_eq!(atlas_service::value(), 3); }`

`app/examples/demo.rs`: `fn main() { println!("{}", atlas_service::value()); }`

`core-new/Cargo.toml`:
```toml
[workspace]
[package]
name = "atlas-core"
version = "2.4.0"
edition = "2024"
license = "MIT"
```

`core-new/src/lib.rs`: `pub fn value() -> u32 { 2 }`

`core-old/Cargo.toml`:
```toml
[workspace]
[package]
name = "atlas-core"
version = "1.9.0"
edition = "2024"
license = "MIT"
```

`core-old/src/lib.rs`: `pub fn value() -> u32 { 1 }`

Reproduction timings/cache/scheduling/source-root paths can vary. Property tests use explicitly
labelled synthetic transformations; they are not added as native corpus cases.
