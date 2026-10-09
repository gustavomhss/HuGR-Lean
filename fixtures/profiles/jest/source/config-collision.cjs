module.exports = {
  ...require('./jest.config.cjs'),
  testMatch: ['**/snapshot.test.cjs'],
  maxWorkers: 1,
  reporters: ['./collision-reporter.cjs'],
};
