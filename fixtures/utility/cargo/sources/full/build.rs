// Original HuGR-Lean utility fixture; SPDX-License-Identifier: MIT
fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    // Explicit preparation delay: once on the cold build, never filter latency.
    std::thread::sleep(std::time::Duration::from_secs(61));
}
