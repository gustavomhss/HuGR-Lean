fn main() {
    println!("cargo::rerun-if-changed=build.rs");
    if std::env::var_os("CARGO_FEATURE_COLLISION").is_some() {
        println!("    Updating crates.io index");
        println!(" Downloading crates ...");
        println!("  Downloaded itoa v1.0.15");
        println!("   Compiling c08-local-bin v0.1.0");
        println!("    Finished `release` profile [optimized] target(s) in 0.01s");
        println!("  Installing /producer-controlled/bin/c08-local-bin");
        println!("   Installed package `c08-local-bin v0.1.0` (executable `c08-local-bin`)");
        println!("cargo::warning=build-script evidence: Installing /producer-controlled/bin/c08-local-bin");
    }
}
