#[test]
fn integration_pass() { assert!(true); }

#[test]
#[ignore = "integration ignored reason"]
fn integration_ignored() { eprintln!("INTEGRATION_IGNORED_STDERR keep"); }
