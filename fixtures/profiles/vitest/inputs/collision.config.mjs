import base from './vitest.config.mjs';
export default { ...base, test: { ...base.test, reporters: ['./collision-reporter.mjs'] } };
