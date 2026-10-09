// Capture-local baseline observation. No test runner, build, mutation, or runtime edits.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { filter } from '../../../src/core/index.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const hash = (raw) => createHash('sha256').update(raw).digest('hex');
const manifest = JSON.parse(readFileSync(join(root, 'cases.json'), 'utf8'));
const observations = [];
for (const item of manifest.cases) {
  const raw = readFileSync(join(root, item.file));
  assert.equal(hash(raw), item.sha256);
  assert.equal(raw.length, item.inputBytes);
  const output = raw.toString('utf8');
  assert.equal(Buffer.compare(Buffer.from(output), raw), 0, 'UTF-8 round trip must preserve native bytes');
  const observation = { source: item.source, command: item.command, output, termination: item.termination,
    completeness: item.completeness, presentation: item.presentation };
  const actual = filter(observation);
  const expectedStatus = item.name === 'R02-snapshot-passed' ? 'reduced' : 'passthrough';
  assert.equal(actual.status, expectedStatus, `${item.name}: unexpected baseline disposition`);
  if (expectedStatus === 'reduced') {
    const expected = readFileSync(join(root, 'captures/snapshot-passed/expected.txt'), 'utf8');
    assert.equal(actual.replacement, expected, 'Independent hand-authored golden differs');
    item.status = 'reduced';
    item.disposition = 'BASELINE_PRESERVED';
    item.expectedFile = 'captures/snapshot-passed/expected.txt';
    item.outputBytes = Buffer.byteLength(expected);
  } else {
    assert.equal('replacement' in actual, false);
    assert.equal(actual.outputBytes, raw.length);
  }
  item.baselineReason = actual.reason;
  observations.push({ name: item.name, actual, expectedStatus, expectedFile: item.expectedFile ?? null,
    sha256: hash(raw), removableBytes: item.inputBytes - item.outputBytes });
}
// Calibrate equality/hash instrument with a destructive in-memory control; raw files stay untouched.
const witness = manifest.cases.find((item) => item.name === 'R02-snapshot-failed');
assert.ok(witness);
const original = readFileSync(join(root, witness.file));
const corrupted = Buffer.from(original.toString('utf8').replace('"count": 2', '"count": 9'));
assert.notEqual(hash(corrupted), witness.sha256, 'Failure evidence corruption must be detectable');
const collision = manifest.cases.find((item) => item.name === 'R02-reporter-collision-only');
assert.ok(collision);
const collisionRaw = readFileSync(join(root, collision.file), 'utf8');
const shapeControl = filter({ source: 'shell', command: 'jest', output: collisionRaw,
  termination: collision.termination, completeness: 'complete', presentation: 'unknown' });
assert.equal(shapeControl.status, 'reduced', 'Known native-looking reporter output must exercise grammar');
// Counterfactual is deliberately NOT a native case or altered original argv.
writeFileSync(join(root, 'baseline-observations.json'), JSON.stringify({ baseline: manifest.baseline,
  reach: 'one public-filter call per captured case; no suites/typecheck/CI; in-memory controls only',
  observations, controls: { failureHashMutationDetected: true,
    collisionCounterfactual: { command: 'jest', originalCommand: collision.command, result: shapeControl,
      interpretation: 'Native grammar cannot authenticate producer; actual explicit reporter argv is refused' } } }, null, 2) + '\n');
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
manifest.archives = files(root).filter((path) => !path.endsWith('/input.txt') && path !== join(root, 'cases.json'))
  .map((path) => relative(root, path)).sort();
assert.equal(new Set(manifest.cases.map((item) => item.name)).size, manifest.cases.length);
assert.ok(manifest.archives.includes('LICENSE.jest.txt'));
writeFileSync(join(root, 'cases.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(observations.map(({ name, actual, removableBytes }) => ({ name, status: actual.status,
  reason: actual.reason, inputBytes: actual.inputBytes, outputBytes: actual.outputBytes, removableBytes })), null, 2));
