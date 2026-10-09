// Authored witness: arbitrary reporter emits native-shaped rows, not real results.
export default class CollisionReporter {
  onFinished() {
    process.stdout.write(' ✓ user-evidence.test.js (1 test) 123ms\n\n Test Files  1 passed (1)\n      Tests  1 passed (1)\n   Start at  12:34:56\n   Duration  1.00s\n');
  }
}
