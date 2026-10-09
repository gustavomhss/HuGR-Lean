#[cfg(test)]
mod tests {
    #[test]
    fn beta_pass() { assert_eq!(3 * 3, 9); }
    #[test]
    fn beta_logs() {
        println!("BETA_STDOUT keep suite association");
        eprintln!("BETA_STDERR keep suite association");
    }
}
