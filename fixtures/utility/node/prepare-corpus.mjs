// Acceptance-only data preparation. Never executes native commands or imports production filtering.
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const native = '/Users/gustavoschneiter/Documents/HuGR/_worktrees/hugr-lean-utility-node-native/.native-captures/node-m78clV';
const index = JSON.parse(readFileSync(join(native, 'capture-index.json'), 'utf8'));
const digest = (data) => createHash('sha256').update(data).digest('hex');
assert.equal(index.producer.sha256, '5b9f2059081fb482ff059ea71dbda1372206a1dafd57e1d1d57965c8cfac8d19');
assert.equal(index.cases.length, 10);

// Independently inspected native line ranges; not parser-derived. Both launchers have these positions.
const ranges = (id, count) => id.includes('-flat-') ? [[1, 1], [74, 82]] :
  id.includes('-nested-') ? [[1, 2], [75, 99], [106, 114]] : [[1, count]];
const rows = (text) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
function checked(base, artifact) {
  const data = readFileSync(join(base, artifact.file));
  assert.equal(data.length, artifact.bytes, artifact.file);
  assert.equal(digest(data), artifact.sha256, artifact.file);
  return data;
}
function copy(artifact) {
  checked(native, artifact);
  const destination = join(root, artifact.file);
  mkdirSync(dirname(destination), { recursive: true });
  assert.equal(existsSync(destination), false, `refusing overwrite: ${destination}`);
  copyFileSync(join(native, artifact.file), destination);
  checked(root, artifact);
}
function golden(item, original) {
  const lines = rows(original);
  assert.equal(lines.length, item.id.includes('-flat-') ? 82 : item.id.includes('-nested-') ? 114 : lines.length);
  return ranges(item.id, lines.length).flatMap(([first, last]) => lines.slice(first - 1, last)).join('');
}
function required(item, original) {
  const lines = rows(original), anchors = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].replace(/\n$/, '');
    if (text && ranges(item.id, lines.length).some(([first, last]) => i + 1 >= first && i + 1 <= last)) {
      let occurrence = 0, cursor = original.indexOf(text);
      while (cursor < offset) { occurrence++; cursor = original.indexOf(text, cursor + text.length); }
      assert.equal(cursor, offset, `line anchor ${item.id}:${i + 1}`);
      anchors.push({ text, occurrence });
    }
    offset += lines[i].length;
  }
  return anchors;
}
const [operation, ...ids] = process.argv.slice(2);
if (operation === 'copy') {
  assert.ok(ids.length);
  for (const id of ids) {
    const item = index.cases.find((entry) => entry.id === id);
    assert.ok(item, `unknown case: ${id}`);
    for (const key of ['original', 'stdout', 'stderr', 'capture']) copy(item[key]);
    for (const source of item.fixtureSources) copy(source);
    const expected = golden(item, checked(root, item.original).toString('utf8'));
    writeFileSync(join(root, 'captures', id, 'output.expected.log'), expected, { flag: 'wx' });
  }
} else if (operation === 'manifest') {
  const cases = index.cases.map((item) => {
    const original = checked(root, item.original).toString('utf8');
    const file = `captures/${item.id}/output.expected.log`;
    const expected = readFileSync(join(root, file));
    assert.equal(expected.toString('utf8'), golden(item, original));
    const role = item.intent === 'noise-candidate' ? 'noise' : 'exact';
    const saved = item.original.bytes - expected.length;
    return { id: item.id, profile: 'node-test', command: item.command, role,
      expectedStatus: role === 'noise' ? 'reduced' : 'passthrough',
      exitCode: item.exitCode, complete: item.complete, signal: item.signal, timedOut: item.timedOut,
      capture: item.capture, fixtureSources: item.fixtureSources,
      original: item.original, stdout: item.stdout, stderr: item.stderr,
      expected: { file, sha256: digest(expected), bytes: expected.length },
      required: required(item, original), material: saved >= 1024 && saved >= item.original.bytes * 0.1 };
  });
  // One physical line per field/anchor: decoded evidence remains visible to review budgets.
  const header = { schema: 'hugr-lean/utility-corpus/1', family: 'node', tools: index.tools,
    producer: { script: index.producer.file, sourceSHA256: index.producer.sha256 } };
  const body = cases.map(({ required, ...item }) => `  {\n${Object.entries(item).map(([key, value]) =>
    `    ${JSON.stringify(key)}: ${JSON.stringify(value)},`).join('\n')}\n    "required": [\n${required.map((anchor) =>
    `      ${JSON.stringify(anchor)}`).join(',\n')}\n    ]\n  }`).join(',\n');
  writeFileSync(join(root, 'manifest.json'), `${JSON.stringify(header).slice(0, -1)},"cases":[\n${body}\n]}\n`, { flag: 'wx' });
  console.log(cases.map((item) => ({ id: item.id, input: item.original.bytes, expected: item.expected.bytes,
    sha256: item.expected.sha256, anchors: item.required.length, material: item.material })));
} else throw new Error('expected copy <case IDs> or manifest');
