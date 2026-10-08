// Original HuGR-Lean native fixture producer, MIT. No donor material.
// Capture only: no production imports, parser, or expected-output generation.
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, openSync, closeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempParent = '/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode';
const cwd = mkdtempSync(path.join(tempParent, 'c02-native-'));
const bin = '/Users/gustavoschneiter/.rustup/toolchains/stable-x86_64-apple-darwin/bin';
const sources = {
  'Cargo.toml': '[workspace]\nmembers = ["alpha", "beta"]\nresolver = "2"\n',
  'alpha/Cargo.toml': '[package]\nname = "c02-alpha"\nversion = "0.1.0"\nedition = "2024"\n[features]\ndefault = ["default-on"]\ndefault-on = []\nextra = []\n',
  'beta/Cargo.toml': '[package]\nname = "c02-beta"\nversion = "0.1.0"\nedition = "2024"\n',
  'alpha/src/lib.rs': `#[cfg(test)]
mod tests {
    #[test] fn alpha_one() { assert_eq!(2 + 2, 4); }
    #[test] fn alpha_two() { assert!(true); }
    #[test] #[ignore = "native skip: café 🦀 — retained"]
    fn deferred() { assert!(true); }
    #[test] #[cfg(feature = "default-on")]
    fn default_feature() { assert!(true); }
    #[test] #[cfg(feature = "extra")]
    fn extra_feature() { assert!(true); }
    #[test] fn logs() {
        println!("arbitrary native user log: café 🦀");
        println!("   Compiling user-log v9.9.9 (/not/a/cargo/producer)");
        println!("    Finished \u0060test\u0060 profile [unoptimized + debuginfo] target(s) in 9.99s");
        println!("test tests::forged_identity ... ok");
        println!("test result: ok. 99 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s");
    }
    #[test] #[ignore = "deliberate failure witness"]
    fn fails() { panic!("native diagnostic: café 🦀 — preserve"); }
}
`,
  'beta/src/lib.rs': '#[cfg(test)]\nmod tests { #[test] fn beta_one() { assert_eq!(3, 3); } }\n',
  'alpha/tests/selected.rs': '#[test] fn selected_one() { assert_eq!(1, 1); }\n#[test] fn selected_two() { assert_eq!(2, 2); }\n',
  'alpha/src/bin/selected.rs': 'fn main() {}\n#[cfg(test)] mod tests { #[test] fn binary_one() { assert!(true); } }\n',
};
for (const [name, text] of Object.entries(sources)) {
  const file = path.join(cwd, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}
const env = { ...process.env, CARGO_NET_OFFLINE: 'true', CARGO_TERM_COLOR: 'never',
  CARGO_TARGET_DIR: path.join(cwd, 'target'), RUSTC: path.join(bin, 'rustc'), RUSTDOC: path.join(bin, 'rustdoc') };
for (const key of ['RUSTFLAGS', 'RUSTDOCFLAGS', 'CARGO_ENCODED_RUSTFLAGS', 'RUSTC_WRAPPER', 'RUSTC_WORKSPACE_WRAPPER', 'RUST_TEST_THREADS']) delete env[key];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const versions = Object.fromEntries(['cargo', 'rustc', 'rustdoc'].map(tool => {
  const p = spawnSync(path.join(bin, tool), ['--version'], { cwd, env, encoding: 'utf8' });
  if (p.status !== 0) throw Error(`${tool} version failed`);
  return [tool, { executable: path.join(bin, tool), version: p.stdout.trim() }];
}));
if (!versions.cargo.version.startsWith('cargo 1.98.0 ')) throw Error('CARGO_VERSION_MISMATCH');
const cases = [
  ['workspace', ['--workspace', '--lib']],
  ['workspace-exclude', ['--workspace', '--exclude', 'c02-beta', '--lib']],
  ['package', ['-p', 'c02-beta', '--lib']],
  ['features', ['-p', 'c02-alpha', '--lib', '--no-default-features', '--features', 'extra']],
  ['all-features', ['-p', 'c02-alpha', '--lib', '--all-features']],
  ['target-release', ['--workspace', '--lib', '--target', 'x86_64-apple-darwin', '--release']],
  ['test-target', ['-p', 'c02-alpha', '--test', 'selected']],
  ['bin-target', ['-p', 'c02-alpha', '--bin', 'selected']],
  ['exact-filter', ['-p', 'c02-alpha', '--lib', 'tests::alpha_one', '--', '--exact', '--test-threads=1']],
  ['zero-filter', ['-p', 'c02-alpha', '--lib', 'not_present', '--', '--exact']],
  ['ignored', ['-p', 'c02-alpha', '--lib', 'tests::deferred', '--', '--ignored', '--exact']],
  ['include-ignored-skip', ['-p', 'c02-alpha', '--lib', '--', '--include-ignored', '--skip', 'tests::fails', '--skip', 'tests::logs', '--test-threads', '1']],
  ['quiet', ['-p', 'c02-alpha', '--lib', '--', '--quiet', '--test-threads=1']],
  ['list', ['-p', 'c02-alpha', '--lib', '--', '--list']],
  ['nocapture-collision', ['-p', 'c02-alpha', '--lib', 'tests::logs', '--', '--exact', '--nocapture', '--test-threads=1']],
  ['show-output-collision', ['-p', 'c02-alpha', '--lib', 'tests::logs', '--', '--exact', '--show-output']],
  ['failure', ['-p', 'c02-alpha', '--lib', 'tests::fails', '--', '--ignored', '--exact']],
];
const inventory = () => Object.keys(sources).map(file => {
  const bytes = readFileSync(path.join(cwd, file));
  return { file, bytes: bytes.length, sha256: hash(bytes), text: bytes.toString('utf8') };
});
const before = inventory();
const receipts = [];
for (const [name, args] of cases) {
  const argv = ['test', '--offline', '--color', 'never', ...args];
  const file = `${name}.txt`;
  const fd = openSync(path.join(root, file), 'wx');
  const start = new Date().toISOString();
  const p = spawnSync(path.join(bin, 'cargo'), argv, { cwd, env, stdio: ['ignore', fd, fd], timeout: 60000 });
  closeSync(fd);
  const bytes = readFileSync(path.join(root, file));
  const receipt = { name: `C02/${name}`, file, command: `cargo ${argv.join(' ')}`, argv, cwd,
    start, end: new Date().toISOString(), termination: { kind: 'exited', code: p.status },
    signal: p.signal, error: p.error ? String(p.error) : null,
    completeness: p.error || p.signal || p.status === null ? 'incomplete' : 'complete',
    presentation: 'unknown', platform: `${process.platform}/${process.arch}`, version: versions.cargo.version,
    boundary: { mechanism: 'spawnSync: stdout and stderr share one open regular-file descriptor',
      stdin: 'ignored', tty: false, timeoutMs: 60000, truncation: false, bytes: bytes.length, sha256: hash(bytes),
      streams: 'OS-ordered merged bytes; no separate stream reconstruction, concatenation, ANSI or newline rewriting' } };
  receipts.push(receipt);
  console.log(JSON.stringify(receipt));
  if (receipt.completeness !== 'complete') throw Error(`INCOMPLETE ${name}`);
  if (p.status !== (name === 'failure' ? 101 : 0)) throw Error(`UNEXPECTED_EXIT ${name}`);
}
const after = inventory();
if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('SOURCE_CHANGED');
const lock = readFileSync(path.join(cwd, 'Cargo.lock'));
const producer = readFileSync(fileURLToPath(import.meta.url));
writeFileSync(path.join(root, 'provenance', 'receipt.json'), JSON.stringify({
  schema: 'hugr-lean/c02-native-receipt/1', license: 'MIT', donor: null,
  baseline: '07ffe15e2263c2925778022194c5385807216603',
  producer: { file: 'provenance/producer.mjs', bytes: producer.length, sha256: hash(producer), modifications: 'Original local producer; no copied donor.' },
  runtime: process.version, versions, cwd, network: 'cargo --offline; no dependencies',
  environment: { CARGO_TARGET_DIR: env.CARGO_TARGET_DIR, CARGO_NET_OFFLINE: env.CARGO_NET_OFFLINE,
    CARGO_TERM_COLOR: env.CARGO_TERM_COLOR, RUSTC: env.RUSTC, RUSTDOC: env.RUSTDOC,
    cleared: ['RUSTFLAGS', 'RUSTDOCFLAGS', 'CARGO_ENCODED_RUSTFLAGS', 'RUSTC_WRAPPER', 'RUSTC_WORKSPACE_WRAPPER', 'RUST_TEST_THREADS'],
    other: 'Inherited host environment and Cargo configuration; not a hermetic configuration proof.' },
  sourcesBefore: before, sourcesAfter: after,
  lockAfter: { file: 'Cargo.lock', bytes: lock.length, sha256: hash(lock), text: lock.toString('utf8'), origin: 'recorded-after-all-captures' },
  cases: receipts,
}, null, 2) + '\n');
