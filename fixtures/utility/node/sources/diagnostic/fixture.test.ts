// Original local fixture; copyright 2026 HuGR-Lean contributors; SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
const nativeEvidenceLanguage: string = 'TypeScript';
test('UTILITY_DIAGNOSTIC_ONLY_CONTEXT', (t) => {
  t.diagnostic('UTILITY_DIAGNOSTIC_ONLY_SENTINEL Ω 🚀');
  assert.equal(2 + 2, 4);
});
