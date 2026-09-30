fn main() {}

#[cfg(test)]
mod tests {
    #[test]
    fn arithmetic() { assert_eq!(2 + 2, 4); }

    #[test]
    fn café() { assert_eq!("🔥".len(), 4); }

    #[test]
    #[ignore = "needs network 🔥"]
    fn network() {}
}
