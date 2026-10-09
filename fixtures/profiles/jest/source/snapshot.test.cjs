const { choose } = require('./math.cjs');
test('snapshot café 🔥', () => {
  expect({ text: choose(true), count: process.env.R02_FAIL ? 2 : 1 }).toMatchSnapshot();
});
