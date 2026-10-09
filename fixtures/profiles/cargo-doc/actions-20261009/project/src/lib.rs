//! Original dependency-using library for bounded Rustdoc capture.
pub fn value() -> u64 { c05_beta::value() }

/// This item exists only when private user Cargo config supplies rustdocflags.
#[cfg(capture_user_config)]
pub fn user_config_marker() -> u64 { 73 }

/// This item exists only for aarch64 documentation targets.
#[cfg(target_arch = "aarch64")]
pub fn aarch64_marker() -> u64 { 64 }
