/** Narrow current-lead reader/default-filter check; mutations live in private copy. */
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const lead = process.argv[2];
assert.ok(lead, 'Pass current lead worktree path');
const { readNativeCorpus } = await import(pathToFileURL(path.join(lead, 'scripts/native-corpus.mjs')));
const { filter } = await import(pathToFileURL(path.join(lead, 'src/core/index.ts')));
const owned = fileURLToPath(new URL('../', import.meta.url));
const root = await mkdtemp('/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/p04-reader-');
const family = path.join(root, 'bun-install');
try {
  await cp(owned, family, { recursive: true });
  await writeFile(path.join(root, 'index.json'), JSON.stringify({ schema: 'hugr-lean/native-index/1',
    families: ['bun-install'], exactFamilies: ['bun-install'] }));
  const check = async () => {
    const cases = await readNativeCorpus(root);
    assert.equal(cases.length, 28);
    for (const item of cases) {
      const result = filter(item.observation);
      assert.equal(result.status, 'passthrough', item.name);
      assert.equal(result.replacement ?? item.observation.output, item.observation.output, item.name);
      assert.equal(result.outputBytes, Buffer.byteLength(item.observation.output), item.name);
    }
  };
  await check();
  const input = path.join(family, 'supplement/visible/registry-trusted-manifest.txt');
  const original = await readFile(input);
  const broken = Buffer.from(original);
  const at = broken.indexOf('P04_DEP_POSTINSTALL_EXECUTED_v1');
  assert.ok(at >= 0);
  broken[at] = 88;
  await writeFile(input, broken);
  await assert.rejects(readNativeCorpus(root), /receipt hash mismatch/);
  await writeFile(input, original);
  const receiptFile = path.join(family, 'supplement/visible/receipt.json');
  const bytes = await readFile(receiptFile);
  const receipt = JSON.parse(bytes);
  receipt.cases[1].command += ' --silent';
  await writeFile(receiptFile, JSON.stringify(receipt));
  await assert.rejects(readNativeCorpus(root), /receipt command mismatch/);
  receipt.cases[1].command = JSON.parse(bytes).cases[1].command;
  receipt.cases[1].boundary.readThroughEOF = false;
  await writeFile(receiptFile, JSON.stringify(receipt));
  await assert.rejects(readNativeCorpus(root), /receipt EOF not complete/);
  await writeFile(receiptFile, bytes);
  await check();
  console.log('Current lead reader/filter: 28 exact cases; marker/receipt/EOF controls rejected; private copy restored.');
} finally {
  await rm(root, { recursive: true, force: true });
}
