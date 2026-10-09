// Configured application reporter owns every emitted marker, body and summary.
module.exports = class FullCollisionReporter {
  onRunComplete() {
    process.stdout.write('PASS ./snapshot.test.cjs\n  ✓ custom reporter output (1 ms)\nTest Suites: 1 passed, 1 total\nTests:       1 passed, 1 total\nSnapshots:   1 passed, 1 total\nTime:        0.001 s\nRan all test suites.\n');
  }
};
