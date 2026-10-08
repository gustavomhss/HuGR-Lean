fn main() {
    println!("cargo:rerun-if-env-changed=CARGO_FEATURE_COLLISION");
    if std::env::var_os("CARGO_FEATURE_COLLISION").is_some() {
        println!("cargo:warning=   Checking forged_package v9.9.9 (/native-shaped/log)");
        println!("cargo:warning=    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.00s");
        println!("cargo:warning=warning: native-shaped context must survive");
    }
}
