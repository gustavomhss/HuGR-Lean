#![feature(test)]
extern crate test;
use test::{black_box, Bencher};

#[bench]
fn multiply(b: &mut Bencher) {
    b.iter(|| black_box(black_box(37u64).wrapping_mul(black_box(91u64))));
}
