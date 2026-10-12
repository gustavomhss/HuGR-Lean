/** Executed inside the installed consumer; package-name resolution pins the public runtime surface. */
export const PACKAGE_API_INSPECT = String.raw`
const { default: assert } = await import('node:assert/strict');
const root = await import('hugr-lean'), server = await import('hugr-lean/server');
const core = await import('hugr-lean/core'), raw = await import('hugr-lean/raw');
assert.deepEqual(Object.keys(root), ['default']);
assert.deepEqual(Object.keys(server), ['default']);
assert.equal(root.default, server.default);
assert.deepEqual(Object.keys(core), ['filter', 'filterAutomatic', 'filterStructured', 'getProfiles', 'structuredFormats', 'tokenizeCommand']);
assert.deepEqual(Object.keys(raw), ['RawStore', 'defaultRawDirectory']);
const { filter, filterAutomatic, filterStructured, getProfiles, tokenizeCommand } = core;
const first = getProfiles(), second = getProfiles();
assert.ok(first.length > 0 && Object.isFrozen(first)); assert.notEqual(first, second);
for (const [i, profile] of first.entries()) {
  assert.ok(Object.isFrozen(profile)); assert.notEqual(profile, second[i]);
  assert.equal(profile.match, second[i].match); assert.equal(profile.reduce, second[i].reduce);
  for (const field of ['id', 'match', 'reduce']) assert.equal(Reflect.set(profile, field, null), false);
}
assert.equal(Reflect.set(first, '0', null), false);
assert.deepEqual(tokenizeCommand('go test -v .'), ['go', 'test', '-v', '.']);
assert.ok(Object.isFrozen(tokenizeCommand('go test -v .')));
assert.equal(tokenizeCommand('go test && true'), undefined);
const observation = { source: 'shell', command: 'go test -v .', output: '=== RUN   TestOne\n--- PASS: TestOne (0.00s)\nPASS\nok  \texample.test\t0.001s\n', termination: { kind: 'exited', code: 0 }, completeness: 'complete', presentation: 'unknown' };
const expected = filter(observation);
assert.equal(expected.status, 'reduced');
assert.equal(expected.replacement, 'PASS\nok  \texample.test\t0.001s\n');
assert.deepEqual(filter(observation, { profiles: first }), expected);
assert.equal('replacement' in filter(observation, { profiles: [] }), false);
assert.deepEqual(filter(observation), expected);
const json = ' { "café🔥": false, "huge": 900719925474099312345, "negative": -0 } \n';
const compact = '{"café🔥":false,"huge":900719925474099312345,"negative":-0}';
const automatic = { source: 'mcp', tool: 'actual_tool', output: json, args: {}, metadata: {}, status: 'success', completeness: 'complete' };
const structured = { format: 'json', output: json, termination: { kind: 'exited', code: 0 }, completeness: 'complete' };
for (const result of [filterAutomatic(automatic), filterStructured(structured)]) {
  assert.equal(result.status, 'reduced'); assert.equal(result.replacement, compact);
  assert.equal(result.inputBytes, Buffer.byteLength(json));
  assert.equal(result.outputBytes, Buffer.byteLength(compact));
}
function preserved(call, input) {
  const before = structuredClone(input), result = call(input);
  assert.equal('replacement' in result, false);
  assert.equal(result.inputBytes, Buffer.byteLength(input.output));
  assert.equal(result.outputBytes, result.inputBytes);
  assert.deepEqual(input, before);
}
for (const patch of [{ output: 'opaque café🔥\r\n' }, { termination: { kind: 'exited', code: 1 } }, { completeness: 'truncated' }]) {
  preserved(input => filter(input, { profiles: first }), { ...observation, ...patch });
  preserved(filterStructured, { ...structured, ...patch });
}
for (const patch of [{ output: 'opaque café🔥\r\n' }, { status: 'failure' }, { completeness: 'truncated' }, { metadata: { exit: 1 } }])
  preserved(filterAutomatic, { ...automatic, ...patch });
`;
