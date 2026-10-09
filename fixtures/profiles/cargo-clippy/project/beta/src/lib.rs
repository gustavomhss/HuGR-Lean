pub fn contains(values: &[i32], value: i32) -> bool {
    values.iter().any(|item| *item == value)
}
