// Original MIT fixture; SPDX-License-Identifier: MIT
fn original_unused_warning_sentinel() {}
#[cfg(test)]
mod tests {
    #[test]
    fn compiler_warning_control() { assert_eq!(2 + 3, 5); }
}
