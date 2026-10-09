test('active beside skip/todo', () => expect(1).toBe(1));
test.skip('skip reason: unavailable service', () => {});
test.todo('todo reason: pending implementation');
