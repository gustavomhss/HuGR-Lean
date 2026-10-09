#![feature(test)]
extern crate test;
use test::{black_box, Bencher};

#[bench]
fn beta_identity(b: &mut Bencher) {
    b.iter(|| black_box(c06_beta::identity(black_box(42))));
}
