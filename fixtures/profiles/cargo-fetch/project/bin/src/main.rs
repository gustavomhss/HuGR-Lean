fn main() {
    let unused_native_warning = 1;
    println!("C08 original local executable; extra={}", cfg!(feature = "extra"));
}
