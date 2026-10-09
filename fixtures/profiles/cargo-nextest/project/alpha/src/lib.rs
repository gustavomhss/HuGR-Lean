#[cfg(test)]
mod tests {
    #[test]
    fn alpha_pass() { assert_eq!(2 + 2, 4); }

    #[test]
    fn alpha_logs() {
        println!("ALPHA_STDOUT keep café 🦀");
        eprintln!("ALPHA_STDERR keep diagnostic");
    }

    #[test]
    #[ignore = "original ignored reason: manual fixture"]
    fn alpha_ignored() { println!("IGNORED_STDOUT keep"); }

    #[test]
    fn alpha_collision() {
        // Deliberate native-shaped user output, not copied from a donor fixture.
        println!("        PASS [   0.001s] capture-alpha tests::alpha_pass");
        eprintln!("     Summary [   0.001s] 99 tests run: 99 passed, 0 skipped");
        println!("------------");
        println!("    Starting 99 tests across 99 binaries");
        eprintln!("    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.01s");
    }

    #[test]
    fn alpha_failure() {
        println!("FAIL_STDOUT keep payload");
        eprintln!("FAIL_STDERR keep diagnostic");
        assert_eq!(7, 9, "original failure evidence");
    }
}
