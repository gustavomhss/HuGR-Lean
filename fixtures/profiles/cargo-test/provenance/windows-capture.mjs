// Original MIT C02 Windows continuation; native capture only. Run on a GitHub-hosted Windows runner:
//   node fixtures/profiles/cargo-test/provenance/windows-capture.mjs <output-directory>
// Writes each raw capture plus windows-receipt.json into <output-directory>; never rewrites bytes.
import { mkdirSync, mkdtempSync, openSync, closeSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const out = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || process.platform !== 'win32') throw Error('USAGE: Windows host and an output directory');
mkdirSync(out, { recursive: true });
const sha = b => createHash('sha256').update(b).digest('hex');
const work = mkdtempSync(path.join(realpathSync.native(os.tmpdir()), 'c02-windows-'));

const tests = (prefix, n) => Array.from({ length: n }, (_, i) => `#[test] fn ${prefix}_${i}() { assert_eq!(1, 1); }`).join('\n');
const projects = {
  // Shape of the Orchestra native item fixture: one lib target at a custom root path, no doctests.
  native: {
    'Cargo.toml': '[package]\nname = "native_item_fixture"\nversion = "0.1.0"\nedition = "2021"\n[lib]\npath = "native.rs"\n',
    'native.rs': `${tests('case', 30)}\n`,
  },
  c02w: {
    'Cargo.toml': '[package]\nname = "c02w"\nversion = "0.1.0"\nedition = "2021"\n\n[[test]]\nname = "contract"\npath = "checks/contract.rs"\n',
    'src/lib.rs': [
      '/// Adds two numbers.',
      '///',
      '/// ```',
      '/// assert_eq!(c02w::add(2, 2), 4);',
      '/// ```',
      'pub fn add(a: u32, b: u32) -> u32 { a + b }',
      '',
      '/// Identity.',
      '///',
      '/// ```',
      '/// assert_eq!(c02w::identity(7), 7);',
      '/// ```',
      'pub fn identity(v: u32) -> u32 { v }',
      '',
      '#[cfg(test)]',
      'mod tests {',
      '    #[test] fn alpha_one() { assert_eq!(super::add(1, 1), 2); }',
      '    #[test] fn alpha_two() { assert_eq!(super::add(1, 2), 3); }',
      '    #[test] fn alpha_three() { assert_eq!(super::identity(3), 3); }',
      '    #[test] fn alpha_four() { assert_eq!(super::identity(4), 4); }',
      '    #[test] #[ignore = "native skip: café 🦀 — retained"] fn alpha_skipped() {}',
      '}',
      '',
    ].join('\n'),
    'tests/integration.rs': `${tests('integration', 3)}\n`,
    'checks/contract.rs': `${tests('contract', 2)}\n`,
  },
  c02f: {
    'Cargo.toml': '[package]\nname = "c02f"\nversion = "0.1.0"\nedition = "2021"\n',
    'src/lib.rs': [
      '#[cfg(test)]',
      'mod tests {',
      '    #[test] fn passes() { assert_eq!(1, 1); }',
      '    #[test] fn fails() { assert_eq!(1, 2, "NATIVE FAILURE MUST KEEP café 🦀"); }',
      '}',
      '',
    ].join('\n'),
  },
};
const sources = [];
for (const [project, files] of Object.entries(projects)) {
  for (const [file, text] of Object.entries(files)) {
    const target = path.join(work, project, ...file.split('/'));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text, { flag: 'wx' });
    const b = readFileSync(target);
    sources.push({ file: `${project}/${file}`, text, bytes: b.length, sha256: sha(b) });
  }
}

const base = { ...process.env, CARGO_NET_OFFLINE: 'true', CARGO_TERM_COLOR: 'never' };
for (const key of ['RUSTFLAGS', 'RUSTDOCFLAGS', 'CARGO_ENCODED_RUSTFLAGS', 'RUSTC_WRAPPER', 'RUSTC_WORKSPACE_WRAPPER',
  'RUST_TEST_THREADS', 'CARGO_TARGET_DIR', 'CARGO_BUILD_TARGET_DIR']) delete base[key];
const version = tool => {
  const p = spawnSync(tool, ['--version'], { env: base, encoding: 'utf8' });
  const where = spawnSync('where.exe', [tool], { env: base, encoding: 'utf8' });
  return { version: p.stdout.trim(), executable: where.stdout.split(/\r?\n/)[0] };
};
const versions = { cargo: version('cargo'), rustc: version('rustc'), rustdoc: version('rustdoc') };
const host = spawnSync('rustc', ['-vV'], { env: base, encoding: 'utf8' }).stdout;
const triple = /^host: (\S+)$/m.exec(host)?.[1];
if (!triple) throw Error('HOST_TRIPLE_UNKNOWN');
const drive = work.slice(0, 1);
const shared = path.join(work, 'shared-target');
const verbatim = `\\\\?\\${path.join(work, 'verbatim-target')}`;
const unc = `\\\\localhost\\${drive}$${path.join(work, 'unc-target').slice(2)}`;
const color = ['--offline', '--color', 'never'];
// [name, project, argv, display command, target dir override, expected exit]
const cases = [
  ['windows-native-lib', 'native', ['test'], 'cargo test', undefined, 0],
  ['windows-default', 'c02w', ['test'], 'cargo test', undefined, 0],
  ['windows-lib', 'c02w', ['test', '--lib'], 'cargo test --lib', undefined, 0],
  ['windows-test-target', 'c02w', ['test', ...color, '--test', 'integration'], 'cargo test --offline --color never --test integration', undefined, 0],
  ['windows-custom-test', 'c02w', ['test', ...color, '--test', 'contract'], 'cargo test --offline --color never --test contract', undefined, 0],
  ['windows-release-target', 'c02w', ['test', ...color, '--lib', '--release', '--target', triple],
    `cargo test --offline --color never --lib --release --target ${triple}`, undefined, 0],
  ['windows-absolute-target', 'c02w', ['test', ...color, '--lib'], 'cargo test --offline --color never --lib', shared, 0],
  ['windows-verbatim-target', 'c02w', ['test', ...color, '--lib'], 'cargo test --offline --color never --lib', verbatim, 0],
  ['windows-unc-target', 'c02w', ['test', ...color, '--lib'], 'cargo test --offline --color never --lib', unc, 0],
  ['windows-failure', 'c02f', ['test'], 'cargo test', undefined, 101],
];
const receipts = [], surprises = [];
for (const [name, project, argv, command, targetDir, expected] of cases) {
  const cwd = path.join(work, project), env = { ...base, ...(targetDir ? { CARGO_TARGET_DIR: targetDir } : {}) };
  const file = `${name}.txt`, fd = openSync(path.join(out, file), 'wx'), start = new Date().toISOString();
  const p = spawnSync(versions.cargo.executable, argv, { cwd, env, stdio: ['ignore', fd, fd], timeout: 300000 });
  closeSync(fd);
  const b = readFileSync(path.join(out, file));
  const r = { name: `C02/${name}`, command, argv, file, cwd, cargoTargetDir: targetDir ?? null,
    termination: { kind: 'exited', code: p.status },
    completeness: p.error || p.signal || p.status === null ? 'incomplete' : 'complete', presentation: 'unknown',
    version: versions.cargo.version, platform: `${process.platform}/${process.arch}`, start, end: new Date().toISOString(),
    error: p.error ? String(p.error) : null, signal: p.signal,
    boundary: { mechanism: 'shared open regular-file descriptor for stdout/stderr; native OS order, no rewriting',
      stdin: 'ignored', tty: false, timeoutMs: 300000, bytes: b.length, sha256: sha(b),
      crlfRows: (b.toString('utf8').match(/\r\n/g) ?? []).length, finalLF: b.at(-1) === 10 } };
  receipts.push(r); console.log(JSON.stringify(r));
  if (p.status !== expected || r.completeness !== 'complete') surprises.push(name);
}
for (const s of sources) if (sha(readFileSync(path.join(work, ...s.file.split('/')))) !== s.sha256) throw Error(`SOURCE_CHANGED ${s.file}`);
const producer = readFileSync(fileURLToPath(import.meta.url));
writeFileSync(path.join(out, 'windows-receipt.json'), JSON.stringify({
  schema: 'hugr-lean/c02-windows-receipt/1', license: 'MIT', work, versions, rustcHost: host,
  runner: { os: process.env.RUNNER_OS ?? null, image: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null,
    repository: process.env.GITHUB_REPOSITORY ?? null, sha: process.env.GITHUB_SHA ?? null, runId: process.env.GITHUB_RUN_ID ?? null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null },
  environment: { CARGO_NET_OFFLINE: 'true', CARGO_TERM_COLOR: 'never',
    note: 'CARGO_TARGET_DIR unset unless cargoTargetDir names it. Offline/color are environment facts. Other host configuration inherited.' },
  sourcesBefore: sources, sourcesUnchangedAfter: true, unexpectedOutcomes: surprises,
  producer: { file: 'provenance/windows-capture.mjs', bytes: producer.length, sha256: sha(producer), modifications: 'Original continuation; no donor.' },
  cases: receipts }, null, 2) + '\n');
if (surprises.length) console.log(`UNEXPECTED_OUTCOMES ${surprises.join(' ')}`);
