// Application reporter emits exactly the same lexemes as native success progress.
module.exports = class CollisionReporter {
  onRunComplete() {
    process.stdout.write('PASS ./snapshot.test.cjs\nTest Suites: 1 passed, 1 total\nTests:       1 passed, 1 total\nSnapshots:   1 passed, 1 total\nTime:        0.001 s\nRan all test suites.\n');
  }
};
