fn main() {
    use std::io::Write;
    // Deliberate user-log collision. No measured benchmark metrics in this binary.
    std::io::stdout().write_all(b"    Finished `bench` profile [optimized] target(s) in 0.01s\ncustom user log: native-looking progress; no measurement; no final LF").unwrap();
}
