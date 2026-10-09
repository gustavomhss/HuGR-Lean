"""B04 native-only capture. Run: python3 fixtures/profiles/rollup/capture.py.

Installs exact public npm pin in a temporary directory; writes only local evidence.
No runtime filter, fixture suite, typecheck, build of HuGR-Lean, or CI execution.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import shlex
import shutil
import subprocess
import sys
import tempfile

DEST = Path(__file__).resolve().parent
TEMP = Path('/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode')
PIN = '4.52.4'
COMMIT = 'cd81da74af1d11fda0ee1752cc26f6dc8217e9ca'
SRI = 'sha512-CLEVl+MnPAiKh5pl4dEWSyMTpuflgNQiLGhMv8ezD5W/qP8AKvmYpCOKRRNOh7oRKnauBZ4SyeYkMS+1VSyKwQ=='
SOURCES = {
    'entry.js': "import { answer } from './shared.js';\nconsole.log('雪😀', answer);\nexport { answer };\n",
    'shared.js': 'export const answer = 42;\n',
    'split.js': "export const load = () => import('./lazy.js');\nexport { answer } from './shared.js';\n",
    'lazy.js': "export const lazy = 'lazy chunk';\n",
    'warning.js': "import external from 'b04-absent-dependency';\nexport default external;\n",
    'cycle-a.js': "import { b } from './cycle-b.js';\nexport const a = () => b;\n",
    'cycle-b.js': "import { a } from './cycle-a.js';\nexport const b = () => a;\n",
    'syntax.js': 'export const broken = ;\n',
    'single.config.mjs': "export default { input: 'entry.js', output: { file: 'out/artifact space 雪.mjs', format: 'es', sourcemap: true } };\n",
    'multi.config.mjs': "export default { input: ['entry.js', 'split.js'], output: [\n  { dir: 'out/esm', format: 'es', sourcemap: true, entryFileNames: '[name]-[hash].mjs', chunkFileNames: 'chunks/[name]-[hash].mjs' },\n  { dir: 'out/cjs', format: 'cjs', exports: 'named', entryFileNames: '[name].cjs', chunkFileNames: 'chunks/[name]-[hash].cjs' }\n] };\n",
    'fail.config.mjs': "throw new Error('B04 config failure: preserve exact message 雪😀');\n",
    'plugin.config.mjs': "export default {\n  input: 'entry.js', output: { file: 'out/single.js', format: 'es' },\n  plugins: [{ name: 'b04-opaque-stdout', buildStart() {\n    process.stdout.write('USER B04 opaque stdout 雪😀\\n');\n    process.stdout.write('\\nentry.js → out/single.js...\\n');\n    process.stdout.write('created out/single.js in 1ms\\n');\n  }, generateBundle() { process.stdout.write('USER B04 no-final-LF'); } }]\n};\n",
}
SPECS = [
    ('version', ['--version'], 0),
    ('single', ['--config', 'single.config.mjs'], 0),
    ('multiple-chunks', ['--config', 'multi.config.mjs'], 0),
    ('warning', ['warning.js', '--file', 'out/warning.mjs', '--format', 'es'], 0),
    ('circular', ['cycle-a.js', '--file', 'out/circular.mjs', '--format', 'es'], 0),
    ('quiet', ['--config', 'single.config.mjs', '--silent'], 0),
    ('quiet-warning', ['warning.js', '--file', 'out/quiet-warning.mjs', '--format', 'es', '--silent'], 0),
    ('config-failure', ['--config', 'fail.config.mjs'], 1),
    ('config-missing', ['--config', 'missing.config.mjs'], 1),
    ('syntax-failure', ['syntax.js', '--file', 'out/syntax.mjs', '--format', 'es'], 1),
    ('missing-input', ['absent.js', '--file', 'out/missing.mjs', '--format', 'es'], 1),
    ('stdout-bundle', ['entry.js', '--format', 'es'], 0),
    ('plugin-collision', ['--config', 'plugin.config.mjs'], 0),
    ('quiet-plugin-collision', ['--config', 'plugin.config.mjs', '--silent'], 0),
]


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def dump(name, value):
    (DEST / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def run(argv, cwd, env):
    return subprocess.run(argv, cwd=cwd, env=env, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, timeout=120)


with tempfile.TemporaryDirectory(prefix='B04-rollup-', dir=TEMP) as temporary:
    root = Path(temporary)
    install = root / 'install'
    install.mkdir()
    env = dict(os.environ, NO_COLOR='1', TERM='dumb', LC_ALL='C', LANG='C')
    removed = ['FORCE_COLOR', 'CLICOLOR_FORCE', 'NODE_OPTIONS', 'NODE_PATH', 'ROLLUP_WATCH']
    for key in removed:
        env.pop(key, None)
    npm = shutil.which('npm')
    node = shutil.which('node')
    assert npm and node
    metadata_argv = [npm, 'view', 'rollup@' + PIN, '--registry=https://registry.npmjs.org', '--json']
    meta_proc = run(metadata_argv, install, env)
    assert meta_proc.returncode == 0, meta_proc.stdout
    metadata = json.loads(meta_proc.stdout)
    assert (metadata['version'], metadata['gitHead'], metadata['dist']['integrity'], metadata['license']) == (PIN, COMMIT, SRI, 'MIT')
    package = {'name': 'b04-native-capture', 'version': '1.0.0', 'private': True,
               'dependencies': {'rollup': PIN}}
    (install / 'package.json').write_text(json.dumps(package) + '\n')
    install_argv = [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund',
                    '--registry=https://registry.npmjs.org', '--cache', str(root / 'npm-cache')]
    install_proc = run(install_argv, install, env)
    (DEST / 'install-output.txt').write_bytes(install_proc.stdout)
    assert install_proc.returncode == 0, install_proc.stdout
    lock_raw = (install / 'package-lock.json').read_bytes()
    lock = json.loads(lock_raw)
    assert lock['packages']['node_modules/rollup']['integrity'] == SRI
    (DEST / 'package-lock.txt').write_bytes(lock_raw)
    (DEST / 'registry-metadata.txt').write_bytes(meta_proc.stdout)
    license_raw = (install / 'node_modules/rollup/LICENSE.md').read_bytes()
    (DEST / 'LICENSE-ROLLUP.txt').write_bytes(license_raw)
    launcher = str(install / 'node_modules/.bin/rollup')
    version_proc = run([launcher, '--version'], install, env)
    assert version_proc.returncode == 0 and version_proc.stdout == b'rollup v4.52.4\n'
    version = version_proc.stdout.decode().rstrip('\n')
    records = []
    for suffix, flags, expected_exit in SPECS:
        cwd = root / suffix
        cwd.mkdir()
        for name, text in SOURCES.items():
            (cwd / name).write_text(text, encoding='utf-8')
        argv = [launcher] + flags
        proc = run(argv, cwd, env)
        raw = proc.stdout
        name = 'B04-' + suffix
        (DEST / (suffix + '.txt')).write_bytes(raw)
        artifacts = []
        for path in sorted((cwd / 'out').rglob('*')):
            if path.is_file():
                content = path.read_bytes()
                archive = 'artifacts/' + suffix + '/' + path.relative_to(cwd).as_posix() + '.txt'
                target = DEST / archive
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
                artifacts.append({'path': path.relative_to(cwd).as_posix(), 'archive': archive,
                                  'bytes': len(content), 'sha256': digest(content)})
        records.append({
            'name': name, 'family': 'rollup', 'version': version, 'platform': platform.platform(),
            'file': suffix + '.txt', 'status': 'passthrough', 'source': 'shell',
            'argv': argv, 'command': shlex.join(argv), 'cwd': str(cwd),
            'termination': {'kind': 'exited', 'code': proc.returncode},
            'completeness': 'complete', 'presentation': 'unknown',
            'inputBytes': len(raw), 'outputBytes': len(raw), 'sha256': digest(raw),
            'eof': {'readThroughEOF': True, 'finalLF': raw.endswith(b'\n'), 'lastBytesHex': raw[-32:].hex()},
            'boundary': 'stdout PIPE, stderr STDOUT before exec; drained through EOF then waited; no PTY, normalization or truncation',
            'completionAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'provenance': {'record': 'capture-receipt.json', 'originalCase': name, 'sha256': digest(raw)},
            'artifacts': artifacts,
        })
        print(name, 'exit', proc.returncode, 'bytes', len(raw), 'artifacts', len(artifacts))
        # Native recipe sanity, not a runtime/profile test. Keep raw even on unexpected exit.
        if proc.returncode != expected_exit:
            raise RuntimeError((name, proc.returncode, expected_exit, raw))
    native_package = install / 'node_modules/@rollup'
    installed_native = {str(path.relative_to(install)): json.loads(path.read_bytes())
                        for path in native_package.glob('*/package.json')}
    receipt = {
        'schema': 'hugr-lean/native-capture/1', 'baseline': '71bcaea',
        'python': sys.version, 'platform': platform.platform(),
        'node': run([node, '--version'], install, env).stdout.decode(),
        'npm': run([npm, '--version'], install, env).stdout.decode(),
        'producer': {'package': 'rollup', 'version': PIN, 'gitHead': COMMIT, 'sri': SRI,
                     'tarball': metadata['dist']['tarball'], 'license': 'MIT',
                     'licensePath': 'node_modules/rollup/LICENSE.md', 'licenseSha256': digest(license_raw)},
        'installedNativePackages': installed_native,
        'metadataCommand': metadata_argv, 'metadataExit': meta_proc.returncode,
        'metadataSha256': digest(meta_proc.stdout), 'installCommand': install_argv,
        'installCwd': str(install), 'installExit': install_proc.returncode,
        'installOutputSha256': digest(install_proc.stdout), 'package': package,
        'lockSha256': digest(lock_raw), 'recipeSha256': digest(Path(__file__).read_bytes()),
        'environment': {'set': {k: env[k] for k in ['NO_COLOR', 'TERM', 'LC_ALL', 'LANG']},
                        'removed': removed, 'otherwise': 'inherited'},
        'sources': {name: {'output': text, 'bytes': len(text.encode()), 'sha256': digest(text.encode())}
                    for name, text in SOURCES.items()},
        'caseIds': [record['name'] for record in records],
        'cases': records,
        'limitations': ['npm registry gitHead is package metadata, not independently attested binary-to-source correspondence',
                        'single macOS x86_64 host, non-TTY merged pipe; no other versions/platforms/watch/API claims'],
    }
    dump('capture-receipt.json', receipt)
    archives = ['LICENSE-ROLLUP.txt', 'package-lock.txt', 'registry-metadata.txt', 'install-output.txt']
    archives += [artifact['archive'] for record in records for artifact in record['artifacts']]
    dump('cases.json', {'schema': 'hugr-lean/native-cases/1', 'family': 'rollup',
                        'baseline': '71bcaea', 'archives': archives, 'cases': records})
