import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  maxWorkers: 1, fileParallelism: false,
  coverage: { provider: 'v8', include: ['src/math.js'], reporter: ['text', 'json-summary'], reportsDirectory: './coverage' },
  projects: [
    { test: { name: 'alpha', include: ['alpha.test.js'], retry: 1 } },
    { test: { name: 'beta', include: ['beta.test.js'], retry: 1 } },
  ],
} });
