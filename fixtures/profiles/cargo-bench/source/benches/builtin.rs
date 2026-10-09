#![feature(test)]
extern crate test;
use test::{black_box, Bencher};

#[bench]
fn sum_256(b: &mut Bencher) {
    let values = vec![3u64; 256];
    b.bytes = 2048;
    b.iter(|| black_box(c06_alpha::sum(black_box(&values))));
}

mod suite {
    use super::*;
    #[bench]
    #[ignore = "explicit ignored measurement only"]
    fn ignored_sum(b: &mut Bencher) {
        let values = vec![5u64; 64];
        b.iter(|| black_box(c06_alpha::sum(black_box(&values))));
    }
}
