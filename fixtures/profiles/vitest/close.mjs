// Fixture-only baseline disposition and source-evidence closure. Run with existing tsx.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { filter } from '../../../src/core/engine.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const read = (path) => readFileSync(join(root, path));
const hash = (data) => createHash('sha256').update(data).digest('hex');
const json = (path) => JSON.parse(read(path).toString('utf8'));
const write = (path, value) => writeFileSync(join(root, path), JSON.stringify(value, null, 2) + '\n');
const manifest = json('cases.json'), packet = json('capture-receipt.json');
function authenticate(item, data) {
  assert.equal(hash(data), item.sha256);
  assert.equal(data.length, item.bytes);
  assert.equal(item.processEOF, true);
  assert.ok(Number.isInteger(item.exitCode) && item.exitCode >= 0);
  assert.equal(data.subarray(-32).toString('hex'), item.tailHex);
}
// Teeth: this instrument must reject raw corruption and absent EOF evidence.
const control = packet.cases[0], controlData = read(manifest.cases[0].file);
assert.throws(() => authenticate(control, Buffer.concat([controlData, Buffer.from('CORRUPTED')])));
assert.throws(() => authenticate({ ...control, processEOF: null }, controlData));
const observe = (command, output, code = 0) => ({ source: 'shell', command, output,
  termination: { kind: 'exited', code }, completeness: 'complete', presentation: 'unknown' });
// Baseline positive control: known passing grammar with delimited timing shrinks.
const shape = read('R03-user-reporter-explicit.txt').toString('utf8');
const positive = filter(observe('vitest run', shape));
assert.equal(positive.status, 'reduced');
assert.equal(filter(observe('vitest run --reporter=custom', shape)).status, 'passthrough');
const results = [];
assert.equal(manifest.cases.length, packet.cases.length);
for (const entry of manifest.cases) {
  const item = packet.cases.find((candidate) => candidate.id === entry.name);
  assert.ok(item);
  const data = read(entry.file), output = data.toString('utf8');
  authenticate(item, data);
  assert.deepEqual(entry.command, item.argv);
  assert.equal(entry.provenance.sha256, item.sha256);
  assert.equal(entry.termination.code, item.exitCode);
  const result = filter(observe(entry.command.join(' '), output, item.exitCode));
  const logicalArgv = item.argv[0] === 'vitest' ? item.argv : ['vitest', ...item.argv.slice(2)];
  const logicalResult = filter(observe(logicalArgv.join(' '), output, item.exitCode));
  if (result.status === 'reduced' || result.status === 'normalized') {
    entry.status = result.status;
    entry.expectedFile = entry.name + '.golden.txt';
    writeFileSync(join(root, entry.expectedFile), result.replacement);
    assert.equal(result.replacement, output.replace(' 123ms\n', '\n'));
  } else {
    assert.equal(result.status, 'passthrough');
    entry.status = 'passthrough';
  }
  results.push({ name: entry.name, command: entry.command, result, logicalArgv, logicalResult });
}
for (const [path, expected] of Object.entries(packet.sources)) assert.equal(hash(read(path)), expected);
const verbose = read('R03-verbose-coverage.txt').toString('utf8');
for (const text of ['|alpha| alpha.test.js', '|beta| beta.test.js', 'R03_RETRY_ATTEMPT=1', 'R03_RETRY_ATTEMPT=2',
                    'R03_STDOUT alpha café', 'R03_STDERR alpha warning', '3 passed | 3 skipped | 1 todo (7)',
                    'R03_SKIP unavailable service', 'R03_TODO future branch', '% Coverage report from v8']) {
  assert.ok(verbose.includes(text), text);
  assert.ok(!verbose.replaceAll(text, '').includes(text));
}
const failure = read('R03-retry-exhausted-coverage.txt').toString('utf8');
assert.equal(failure.split('\n').filter((line) => line === 'R03_FAILURE_ATTEMPT beta').length, 2);
for (const text of ['1 failed | 1 passed (2)', '1 failed | 3 passed | 2 skipped | 1 todo (7)',
                    'beta.test.js:7:22', 'Expected: "expected"', 'Received: "actual"', '% Coverage report from v8']) {
  assert.ok(failure.includes(text), text);
}
for (const name of ['R03-verbose-coverage', 'R03-retry-exhausted-coverage']) {
  const item = packet.cases.find((value) => value.id === name);
  const data = read(item.coverageArtifact);
  assert.equal(hash(data), item.coverageSha256);
  const metrics = JSON.parse(data);
  assert.equal(metrics.total.lines.pct, 100);
  assert.equal(metrics.total.branches.pct, 100);
  assert.ok(Object.keys(metrics).some((key) => key.endsWith('/src/math.js')));
}
assert.equal(read('R03-user-reporter-config-valid.txt').toString('utf8'), shape);
const machine = json('R03-json-projects.txt');
assert.equal(machine.numTotalTests, 7);
assert.equal(machine.numPassedTests, 3);
assert.equal(machine.numPendingTests, 3);
assert.equal(machine.numTodoTests, 1);
assert.equal(machine.testResults.length, 2);
const assertions = machine.testResults.flatMap((suite) => suite.assertionResults);
const retry = assertions.find((item) => item.title === 'retry succeeds second attempt');
assert.equal(retry.status, 'passed');
assert.ok(retry.failureMessages.some((text) => text.includes('expected 1 to be 2')));
const historical = json('recovery-receipt.json');
assert.equal(hash(read('R03-default-projects.txt')), historical.artifacts['R03-default-projects.txt'].sha256);
assert.equal(historical.raw.completeness, 'unknown');
write('closure-receipt.json', { schema: 'R03-baseline-closure/1', baseline: manifest.baseline,
  reach: 'New captured inputs only; default core at frozen baseline. Manifest uses executed argv. Logical Vitest argv replay is separately labeled analysis.',
  controls: ['raw corruption rejected', 'missing EOF rejected', 'native timing shape reduced', 'explicit custom reporter refused'],
  historicalRaw: 'unchanged; completeness unknown', results,
  blocker: 'Configured arbitrary reporter native shape is reduced by existing baseline; golden records actual behavior, not approved evidence deletion.' });
function files(path = root) {
  return readdirSync(path).flatMap((name) => {
    const full = join(path, name);
    return statSync(full).isDirectory() ? files(full) : [full.slice(root.length)];
  });
}
manifest.archives = files().filter((path) => path !== 'cases.json' && !manifest.cases.some((item) => item.file === path || item.expectedFile === path)).sort();
write('cases.json', manifest);
console.log(JSON.stringify(results.map(({ name, result }) => ({ name, status: result.status, reason: result.reason }))));
