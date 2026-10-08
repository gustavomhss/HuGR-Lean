// Original MIT tiny C02 default-workspace/feature-list continuation; native capture only.
import { openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cwd = '/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/c02-native-jcOoO0';
const prior = JSON.parse(readFileSync(path.join(root, 'provenance/scope-receipt.json')));
const sha = b => createHash('sha256').update(b).digest('hex');
const sources = prior.sourcesBefore.map(({ file }) => {
  const b = readFileSync(path.join(cwd, file)); return { file, text: b.toString('utf8'), bytes: b.length, sha256: sha(b) };
});
const env = { ...process.env, CARGO_NET_OFFLINE: 'true', CARGO_TERM_COLOR: 'never', CARGO_TARGET_DIR: path.join(cwd, 'target'),
  RUSTC: prior.versions.rustc.executable, RUSTDOC: prior.versions.rustdoc.executable };
for (const key of ['RUSTFLAGS', 'RUSTDOCFLAGS', 'CARGO_ENCODED_RUSTFLAGS', 'RUSTC_WRAPPER', 'RUSTC_WORKSPACE_WRAPPER', 'RUST_TEST_THREADS']) delete env[key];
const cases = [
  ['default-workspace', ['test'], 'cargo test'],
  ['workspace-feature-comma', ['test', '--offline', '--color', 'never', '--workspace', '--lib', '--no-default-features', '--features', 'c02-alpha/extra,c02-alpha/more,c02-beta/extra'], 'cargo test --offline --color never --workspace --lib --no-default-features --features c02-alpha/extra,c02-alpha/more,c02-beta/extra'],
  ['workspace-feature-space', ['test', '--offline', '--color', 'never', '--workspace', '--lib', '--no-default-features', '--features', 'c02-alpha/extra c02-alpha/more c02-beta/more'], 'cargo test --offline --color never --workspace --lib --no-default-features --features "c02-alpha/extra c02-alpha/more c02-beta/more"'],
  ['package-feature-list', ['test', '--offline', '--color', 'never', '-p', 'c02-alpha', '--lib', '--features', 'extra,more', '--no-default-features'], 'cargo test --offline --color never -p c02-alpha --lib --features extra,more --no-default-features'],
];
const receipts = [];
for (const [name, argv, command] of cases) {
  const file = `${name}.txt`, fd = openSync(path.join(root, file), 'wx'), start = new Date().toISOString();
  const p = spawnSync(prior.versions.cargo.executable, argv, { cwd, env, stdio: ['ignore', fd, fd], timeout: 60000 });
  closeSync(fd);
  const b = readFileSync(path.join(root, file));
  const r = { name: `C02/${name}`, command, argv, file, termination: { kind: 'exited', code: p.status },
    completeness: p.error || p.signal || p.status === null ? 'incomplete' : 'complete', presentation: 'unknown',
    version: prior.versions.cargo.version, platform: `${process.platform}/${process.arch}`, start, end: new Date().toISOString(),
    error: p.error ? String(p.error) : null, signal: p.signal,
    boundary: { mechanism: 'shared open regular-file descriptor for stdout/stderr; native OS order, no rewriting',
      stdin: 'ignored', tty: false, timeoutMs: 60000, bytes: b.length, sha256: sha(b) } };
  receipts.push(r); console.log(JSON.stringify(r));
  if (p.status !== 0 || r.completeness !== 'complete') throw Error(`CAPTURE_FAILED ${name}`);
}
for (const s of sources) if (sha(readFileSync(path.join(cwd, s.file))) !== s.sha256) throw Error(`SOURCE_CHANGED ${s.file}`);
const producer = readFileSync(fileURLToPath(import.meta.url));
writeFileSync(path.join(root, 'provenance/default-features-receipt.json'), JSON.stringify({
  schema: 'hugr-lean/c02-default-features-receipt/1', license: 'MIT', cwd, versions: prior.versions,
  environment: { CARGO_NET_OFFLINE: 'true', CARGO_TERM_COLOR: 'never', CARGO_TARGET_DIR: env.CARGO_TARGET_DIR,
    note: 'Bare command has no offline/color/workspace argv additions. Offline/color are environment facts. Other host configuration inherited.' },
  sourcesBefore: sources, sourcesUnchangedAfter: true,
  producer: { file: 'provenance/default-features-capture.mjs', bytes: producer.length, sha256: sha(producer), modifications: 'Original local continuation; no donor.' },
  cases: receipts }, null, 2) + '\n');
