fn main() {
    if std::env::var_os("CARGO_FEATURE_OPAQUE_LOG").is_some() {
        println!("cargo:warning=opaque user log: Documenting fake-package v9.9.9");
    }
}
