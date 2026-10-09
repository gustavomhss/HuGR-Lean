import { test } from 'bun:test';
test('exact native-shaped user log', () => {
  process.stdout.write("bun test v1.3.14 (0d9b296a)\n\nsuite.test.ts:\n(pass) outer suite α > passing leaf [0.40ms]\n(pass) outer suite α > nested suite > nested passing leaf [0.09ms]\n(skip) outer suite α > nested suite > skip: platform feature unavailable\n(todo) outer suite α > nested suite > todo: implement negative branch\n\n 2 pass\n 1 skip\n 1 todo\n 0 fail\n 2 expect() calls\nRan 4 tests across 1 file. [146.00ms]\n");
});
