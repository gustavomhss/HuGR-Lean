//! Original binary uses its package library, which uses the workspace dependency.
pub fn documented_value() -> u64 { c05_alpha::value() }
fn main() { std::hint::black_box(documented_value()); }
