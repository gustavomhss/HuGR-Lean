import { describe, test, expect } from 'vitest';
import { branch } from './src/math.js';
let attempts = 0;
describe('alpha suite café', () => {
  test('retry succeeds second attempt', () => {
    attempts += 1;
    console.log(`R03_RETRY_ATTEMPT=${attempts}`);
    expect(attempts).toBe(2);
    expect(branch(1)).toBe(2);
  });
  test('stdout and stderr evidence', () => {
    console.log('R03_STDOUT alpha café');
    console.error('R03_STDERR alpha warning');
    expect(branch(-1)).toBe(-2);
  });
  test.skip('R03_SKIP unavailable service', () => {});
  test.todo('R03_TODO future branch');
});
