// Original HuGR-Lean utility fixture; SPDX-License-Identifier: MIT
/// Original dependency-free addition example.
///
/// ```
/// assert_eq!(hugr_utility_cargo::add(2, 3), 5);
/// ```
pub fn add(left: u32, right: u32) -> u32 { left + right }

#[cfg(test)]
mod tests {
    #[test]
    fn passing_00_original_dependency_free_native_evidence_keeps_suite_context_and_long_identity_without_external_dependencies() { assert_eq!(super::add(2, 3), 5); }
    #[test]
    fn passing_01_original_dependency_free_native_evidence_keeps_suite_context_and_long_identity_without_external_dependencies() { assert_eq!(super::add(2, 3), 5); }
    #[test]
    fn passing_02_original_dependency_free_native_evidence_keeps_suite_context_and_long_identity_without_external_dependencies() { assert_eq!(super::add(2, 3), 5); }
    #[test]
    fn passing_03_original_dependency_free_native_evidence_keeps_suite_context_and_long_identity_without_external_dependencies() { assert_eq!(super::add(2, 3), 5); }
    #[test]
    fn passing_04_original_dependency_free_native_evidence_keeps_suite_context_and_long_identity_without_external_dependencies() { assert_eq!(super::add(2, 3), 5); }
    #[test]
    fn passing_05_original_dependency_free_native_evidence_keeps_suite_context_and_long_identity_without_external_dependencies() { assert_eq!(super::add(2, 3), 5); }
    #[test]
    fn duplicate_suite_identity() { assert_eq!(super::add(1, 1), 2); }
    #[test]
    #[ignore = "original ignored reason: café 🦀 — native Unicode"]
    fn ignored_unicode_reason() { panic!("ignored sentinel must not execute"); }
}
