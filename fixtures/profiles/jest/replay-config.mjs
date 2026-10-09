// Freeze lead source from Git; scoped native corpus audit, not a suite or approved golden.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const sha = raw => createHash('sha256').update(raw).digest('hex');
const commit = 'f157b388f9ffa4a46d6c19bef980f1725045cc5c';
const parent = '/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode';
const temporary = mkdtempSync(join(parent, 'R02-config-replay-'));
const git = args => execFileSync('git', args, { cwd: fileURLToPath(new URL('../../../', import.meta.url)) });
assert.equal(git(['rev-parse', commit]).toString().trim(), commit);
const archive = git(['archive', commit, 'src', 'scripts/native-corpus.mjs']);
execFileSync('tar', ['-x', '-C', temporary], { input: archive });
const { filter } = await import(pathToFileURL(join(temporary, 'src/core/index.ts')).href);
const { readNativeCorpus } = await import(pathToFileURL(join(temporary, 'scripts/native-corpus.mjs')).href);
const corpusRoot = join(temporary, 'corpus');
mkdirSync(corpusRoot);
writeFileSync(join(corpusRoot, 'index.json'), JSON.stringify({ schema: 'hugr-lean/native-index/1', families: ['jest'] }));
cpSync(root, join(corpusRoot, 'jest'), { recursive: true });
const cases = await readNativeCorpus(corpusRoot);
assert.equal(cases.length, 14);
const results = cases.map(entry => {
  const actual = filter(entry.observation);
  const delivered = actual.replacement ?? entry.observation.output;
  return { name: entry.name, command: entry.observation.command, desiredStatus: 'passthrough',
    rawSHA256: sha(Buffer.from(entry.observation.output)), actual, preservationViolation: delivered !== entry.expected };
});
const configured = results.filter(item => item.name.startsWith('native/R02-config-'));
assert.equal(configured.length, 2);
for (const item of configured) {
  assert.equal(item.actual.status, 'reduced');
  assert.equal(item.preservationViolation, true);
  assert.equal(item.command.includes('--reporters'), false);
  assert.ok(item.actual.replacement.startsWith('+ ./snapshot.test.cjs\n'));
}
const full = configured.find(item => item.name.endsWith('config-full-collision'));
assert.ok(full.actual.replacement.includes('  - custom reporter output (1 ms)\n'));
assert.equal(full.actual.inputBytes, 196);
assert.equal(full.actual.outputBytes, 191);
assert.equal(configured.find(item => item.name.endsWith('config-collision')).actual.outputBytes, 157);
const snapshot = results.find(item => item.name === 'native/R02-snapshot-passed');
assert.equal(snapshot.actual.status, 'reduced');
assert.equal(snapshot.preservationViolation, true);
// Scoped receipt binding control: break hash in copied receipt, observe rejection, restore, audit once.
const receiptPath = join(corpusRoot, 'jest/normalized-receipt.json');
const originalReceipt = readFileSync(receiptPath);
const corrupt = JSON.parse(originalReceipt);
corrupt.cases.find(item => item.name === 'R02-config-full-collision').boundary.sha256 = '0'.repeat(64);
writeFileSync(receiptPath, JSON.stringify(corrupt));
let rejection;
try { await readNativeCorpus(corpusRoot); } catch (error) { rejection = error.message; }
assert.ok(rejection?.includes('receipt hash mismatch'));
writeFileSync(receiptPath, originalReceipt);
assert.equal((await readNativeCorpus(corpusRoot)).length, 14);
const record = { sourceCommit: commit, sourceTree: git(['rev-parse', `${commit}:src`]).toString().trim(),
  archiveSHA256: sha(archive), temporary,
  reach: '14 Jest cases only; frozen lead public filter; no suite/typecheck/build/CI; actual argv unchanged',
  classification: 'baseline-bug; unsafe replacements are historical proof, not approved goldens',
  results, controls: { malformedReceiptRejected: rejection, receiptRestored: true } };
writeFileSync(join(root, 'config-lead-replay.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ sourceCommit: commit, configured: configured.map(({ name, actual }) => ({ name,
  inputBytes: actual.inputBytes, outputBytes: actual.outputBytes, replacement: actual.replacement })),
  scopedReceiptAudit: { cases: cases.length, malformedReceiptRejected: rejection, restored: true } }, null, 2));
