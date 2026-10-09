// Original MIT tiny C02 cold-review collector; no parser or expected-output generation.
import { openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cwd = '/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/c02-native-jcOoO0/review-project';
const previous = JSON.parse(readFileSync(path.join(root, 'provenance/receipt.json')));
const sha = b => createHash('sha256').update(b).digest('hex');
const sources = ['Cargo.toml', 'code/library.rs', 'src/main.rs', 'code/entry.rs', 'checks/custom.rs', 'code/example.rs'].map(file => {
  const b = readFileSync(path.join(cwd, file)); return { file, text: b.toString('utf8'), bytes: b.length, sha256: sha(b) };
});
const env = { ...process.env, CARGO_NET_OFFLINE: 'true', CARGO_TERM_COLOR: 'never', CARGO_TARGET_DIR: path.join(cwd, 'target'),
  RUSTC: previous.versions.rustc.executable, RUSTDOC: previous.versions.rustdoc.executable };
for (const key of previous.environment.cleared) delete env[key];
const cases = [
  ['review-main-bin', ['--bin', 'app']],
  ['review-custom-bin', ['--bin', 'worker-tool']],
  ['review-custom-test', ['--test', 'verify']],
  ['review-custom-example', ['--example', 'showroom']],
  ['review-renamed-profile', ['--lib', '--profile', 'review_fast']],
  ['review-exact-prefix', ['--lib', '--', '--exact', '--skip', 'tests::alpha', '--test-threads=1']],
  ['review-exact-full', ['--lib', '--', '--exact', '--skip', 'tests::alpha_one', '--test-threads=1']],
  ['review-substring-prefix', ['--lib', '--', '--skip', 'tests::alpha', '--test-threads=1']],
];
const receipts = [];
for (const [name, flags] of cases) {
  const argv = ['test', '--offline', '--color', 'never', ...flags], file = `${name}.txt`;
  const fd = openSync(path.join(root, file), 'wx'), start = new Date().toISOString();
  const r = spawnSync(previous.versions.cargo.executable, argv, { cwd, env, stdio: ['ignore', fd, fd], timeout: 60000 });
  closeSync(fd);
  const b = readFileSync(path.join(root, file));
  const receipt = { name: `C02/${name}`, command: `cargo ${argv.join(' ')}`, argv, file,
    termination: { kind: 'exited', code: r.status }, completeness: r.error || r.signal || r.status === null ? 'incomplete' : 'complete',
    presentation: 'unknown', version: previous.versions.cargo.version, platform: `${process.platform}/${process.arch}`,
    start, end: new Date().toISOString(), error: r.error ? String(r.error) : null, signal: r.signal,
    boundary: { mechanism: 'one shared open regular-file descriptor for stdout/stderr; native OS order, no rewriting',
      stdin: 'ignored', tty: false, timeoutMs: 60000, bytes: b.length, sha256: sha(b) } };
  receipts.push(receipt); console.log(JSON.stringify(receipt));
  if (r.status !== 0 || receipt.completeness !== 'complete') throw Error(`CAPTURE_FAILED ${name}`);
}
for (const s of sources) if (sha(readFileSync(path.join(cwd, s.file))) !== s.sha256) throw Error(`SOURCE_CHANGED ${s.file}`);
const producer = readFileSync(fileURLToPath(import.meta.url)), lock = readFileSync(path.join(cwd, 'Cargo.lock'));
writeFileSync(path.join(root, 'provenance/review-receipt.json'), JSON.stringify({ schema: 'hugr-lean/c02-review-receipt/1',
  cwd, license: 'MIT', versions: previous.versions, sourcesBefore: sources, sourcesUnchangedAfter: true,
  environment: 'Offline, direct pinned tools, cleared flags as original receipt; other host configuration inherited.',
  lockAfter: { text: lock.toString('utf8'), bytes: lock.length, sha256: sha(lock) },
  producer: { file: 'provenance/review-capture.mjs', bytes: producer.length, sha256: sha(producer), modifications: 'Original local collector; no donor.' },
  cases: receipts }, null, 2) + '\n');
