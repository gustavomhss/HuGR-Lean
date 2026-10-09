pub mod detail;

pub fn first(values: &[i32]) -> Option<&i32> {
    values.get(0)
}

#[cfg(feature = "extra")]
pub fn feature_lint(value: bool) -> bool {
    if value { true } else { false }
}
