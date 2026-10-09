test('logged evidence', () => {
  console.log('R02 application log: café 🔥 path=artifact.json');
  console.warn('R02 warning evidence');
  expect('log snapshot').toMatchSnapshot();
});
test.skip('skip reason: external database unavailable', () => {});
test.todo('todo reason: follow-up contract');
