#![feature(test)]
extern crate test;

#[bench]
fn add(b: &mut test::Bencher) {
    b.iter(|| c06_tiny::add(test::black_box(1), 2));
}

mod suite {
    #[bench]
    #[ignore = "bounded capture only"]
    fn ignored_add(b: &mut test::Bencher) {
        b.iter(|| c06_tiny::add(test::black_box(2), 3));
    }
}
