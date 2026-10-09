//! Tiny native documentation capture.
/// Public value.
pub fn value() -> u8 { 7 }
/// Private value, visible with --document-private-items.
fn private_value() -> u8 { value() }
#[cfg(feature = "doc-warning")]
/// Link to [`missing_native_item`] intentionally warns.
pub fn warning_value() -> u8 { private_value() }
#[cfg(feature = "syntax-fail")]
mod broken;
