// Original MIT C02 continuation collector; no parser or golden generation.
import { readFileSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cwd = '/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/c02-native-jcOoO0';
const previous = JSON.parse(readFileSync(path.join(root, 'provenance/receipt.json')));
const sha = b => createHash('sha256').update(b).digest('hex');
const files = [...previous.sourcesBefore.map(s => s.file), 'alpha/examples/selected.rs', 'Cargo.lock'];
const sources = files.map(file => { const b = readFileSync(path.join(cwd, file)); return { file, text: b.toString('utf8'), bytes: b.length, sha256: sha(b) }; });
const env = { ...process.env, CARGO_NET_OFFLINE: 'true', CARGO_TERM_COLOR: 'never', CARGO_TARGET_DIR: path.join(cwd, 'target'),
  RUSTC: previous.versions.rustc.executable, RUSTDOC: previous.versions.rustdoc.executable };
for (const key of previous.environment.cleared) delete env[key];
const cases = [
  ['doc-target', ['-p', 'c02-alpha', '--doc']],
  ['all-targets', ['-p', 'c02-alpha', '--all-targets']],
  ['examples', ['-p', 'c02-alpha', '--examples']],
  ['example-target', ['-p', 'c02-alpha', '--example', 'selected']],
  ['custom-profile', ['-p', 'c02-beta', '--lib', '--profile', 'c02']],
  ['multi-package', ['-p', 'c02-alpha', '-p', 'c02-beta', '--lib']],
];
const receipts = [];
for (const [name, flags] of cases) {
  const argv = ['test', '--offline', '--color', 'never', ...flags];
  const file = `${name}.txt`, fd = openSync(path.join(root, file), 'wx');
  const start = new Date().toISOString();
  const result = spawnSync(previous.versions.cargo.executable, argv, { cwd, env, stdio: ['ignore', fd, fd], timeout: 60000 });
  closeSync(fd);
  const b = readFileSync(path.join(root, file));
  const receipt = { name: `C02/${name}`, family: 'cargo-test', command: `cargo ${argv.join(' ')}`, argv, file,
    termination: { kind: 'exited', code: result.status }, completeness: result.error || result.signal || result.status === null ? 'incomplete' : 'complete',
    presentation: 'unknown', version: previous.versions.cargo.version, platform: `${process.platform}/${process.arch}`,
    start, end: new Date().toISOString(), signal: result.signal, error: result.error ? String(result.error) : null,
    boundary: { mechanism: 'shared open regular-file descriptor for stdout/stderr; OS order, no rewriting', stdin: 'ignored', tty: false, timeoutMs: 60000, bytes: b.length, sha256: sha(b) } };
  receipts.push(receipt); console.log(JSON.stringify(receipt));
  if (result.status !== 0 || receipt.completeness !== 'complete') throw Error(`CAPTURE_FAILED ${name}`);
}
for (const s of sources) if (sha(readFileSync(path.join(cwd, s.file))) !== s.sha256) throw Error(`SOURCE_CHANGED ${s.file}`);
const producer = readFileSync(fileURLToPath(import.meta.url));
writeFileSync(path.join(root, 'provenance/scope-receipt.json'), JSON.stringify({ schema: 'hugr-lean/c02-scope-receipt/1',
  cwd, license: 'MIT', versions: previous.versions, sourcesBefore: sources, sourcesUnchangedAfter: true,
  environment: 'Same offline/toolchain/cleared flags as original receipt; remaining host configuration inherited.',
  producer: { file: 'provenance/scope-capture.mjs', bytes: producer.length, sha256: sha(producer), modifications: 'Original local continuation collector; no donor.' }, cases: receipts }, null, 2) + '\n');
