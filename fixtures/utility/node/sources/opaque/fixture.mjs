// Original local fixture; copyright 2026 HuGR-Lean contributors; SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
test('UTILITY_OPAQUE_CONTEXT', () => {
  console.log('UTILITY_OPAQUE_OUTPUT_SENTINEL user-owned output Ω 🚀');
  process.stderr.write('UTILITY_OPAQUE_STDERR_SENTINEL exact stderr Ω 🚀\n');
  assert.equal(2 + 2, 4);
});
