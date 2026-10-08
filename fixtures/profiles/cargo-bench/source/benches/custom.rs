fn main() {
    if std::env::args().any(|arg| arg == "collision") {
        print!("    Finished `bench` profile [optimized] target(s) in 0.01s\n     Running benches/custom.rs (target/release/deps/custom-deadbeef)\n\nrunning 2 tests\ntest add ... bench:           7.00 ns/iter (+/- 1.00)\ntest suite::ignored_add ... ignored, bounded capture only\n\ntest result: ok. 0 passed; 0 failed; 1 ignored; 1 measured; 0 filtered out; finished in 0.00s");
    } else {
        println!("custom suite: add; iterations: 3; elapsed: 19 ns; throughput: 157894736 ops/s");
        println!("custom suite: skip; ignored: bounded capture only");
        print!("custom summary: 1 measured; 1 ignored; artifact: results/custom.json");
    }
}
