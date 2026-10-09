#!/usr/bin/env python3
"""B02 isolated native captures. No server, PTY, output rewrite, or parser invocation."""
import argparse
import base64
import datetime
import hashlib
import json
import os
import shlex
from pathlib import Path
import platform
import shutil
import signal
import subprocess
import tempfile
import urllib.request

HERE = Path(__file__).resolve().parent
TEMP = Path('/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode')
BASE = '248c303'
VERSIONS = {'next': '15.5.9', 'react': '19.1.0', 'react-dom': '19.1.0',
            'typescript': '5.9.3', '@types/react': '19.1.0', '@types/node': '22.15.30'}
ENV = {**os.environ, 'NEXT_TELEMETRY_DISABLED': '1', 'CI': '1',
       'NO_COLOR': '1', 'TZ': 'UTC', 'RAYON_NUM_THREADS': '1', 'UV_THREADPOOL_SIZE': '1'}
ENV.pop('FORCE_COLOR', None)
CONFIG = "module.exports = { experimental: { cpus: 1, workerThreads: false }, generateBuildId: async () => 'B02-tiny' };\n"
SOURCES = {
    'package.json': json.dumps({'name': 'b02-next-native', 'version': '1.0.0',
                               'private': True, 'license': 'MIT', 'dependencies': VERSIONS}, indent=2) + '\n',
    'next.config.js': CONFIG,
    'tsconfig.json': json.dumps({'compilerOptions': {'target': 'ES2017', 'lib': ['dom', 'dom.iterable', 'esnext'],
        'allowJs': True, 'skipLibCheck': True, 'strict': True, 'noEmit': True, 'esModuleInterop': True,
        'module': 'esnext', 'moduleResolution': 'bundler', 'resolveJsonModule': True, 'isolatedModules': True,
        'jsx': 'preserve', 'incremental': True}, 'include': ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
        'exclude': ['node_modules']}, indent=2) + '\n',
    'next-env.d.ts': '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n',
    'pages/index.tsx': "export default function Home() { return <main>B02 tiny static</main>; }\n",
    'pages/dynamic.tsx': "export async function getServerSideProps() { return { props: { label: 'B02 dynamic' } }; }\nexport default function Dynamic({ label }: { label: string }) { return <main>{label}</main>; }\n",
    'pages/blog/[slug].tsx': "export async function getStaticPaths() { return { paths: [{ params: { slug: 'one' } }], fallback: false }; }\nexport async function getStaticProps() { return { props: { label: 'B02 SSG' } }; }\nexport default function Blog({ label }: { label: string }) { return <main>{label}</main>; }\n",
}
VARIANTS = {
    'routes': {},
    'css-warning': {
        'pages/_app.tsx': "import type { AppProps } from 'next/app';\nimport '../style.css';\nexport default function App({ Component, pageProps }: AppProps) { return <Component {...pageProps} />; }\n",
        'style.css': '.b02 { display: flex; justify-content: end; }\n'},
    'config-warning': {'next.config.js': CONFIG.replace('experimental:', 'b02UnknownOption: true, experimental:')},
    'typecheck-failure': {'pages/index.tsx': "const label: number = 'B02 wrong type';\nexport default function Home() { return <main>{label}</main>; }\n"},
    'build-failure': {'pages/index.tsx': "const missing = require('./b02-does-not-exist');\nexport default function Home() { return <main>{missing}</main>; }\n"},
    'config-collision': {'next.config.js': "console.log('   Creating an optimized production build ...');\nconsole.log('Route (pages)                                Size  First Load JS');\n" + CONFIG},
    'plugin-collision': {'next.config.js': "class B02CollisionPlugin { apply(compiler) { compiler.hooks.beforeCompile.tap('B02CollisionPlugin', () => { console.log('   Creating an optimized production build ...'); console.log(' ✓ Compiled successfully'); }); } }\n" + CONFIG.replace("generateBuildId:", "webpack: (config) => { config.plugins.push(new B02CollisionPlugin()); return config; }, generateBuildId:")},
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def capture(name, argv, cwd, timeout):
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    proc = subprocess.Popen(argv, cwd=cwd, env=ENV, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, start_new_session=True)
    timed_out = False
    try:
        data, _ = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(proc.pid, signal.SIGKILL)
        data, _ = proc.communicate(timeout=10)
    filename = name + '.txt'
    (HERE / filename).write_bytes(data)
    version = 'Next.js 15.5.9 / React 19.1.0'
    if name in {'B02-node-version', 'B02-npm-version'}:
        version = argv[0] + ' ' + data.decode('utf-8').strip()
    row = {'name': name, 'family': 'next', 'version': version,
           'platform': platform.platform(), 'file': filename, 'source': 'shell',
           'status': 'passthrough', 'disposition': 'pending-policy', 'argv': argv,
           'command': shlex.join(argv), 'cwd': str(cwd),
           'termination': {'kind': 'timed_out'} if timed_out else {'kind': 'exited', 'code': proc.returncode},
           'processReturncode': proc.returncode, 'timeoutSeconds': timeout,
           'completeness': 'truncated' if timed_out else 'complete', 'presentation': 'unknown',
           'inputBytes': len(data), 'outputBytes': len(data), 'sha256': digest(data),
           'startedAt': started, 'completionAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'boundary': 'stdout pipe; stderr redirected to stdout before exec; communicate through EOF and wait; no PTY or normalization',
           'eof': {'readThroughEOF': True, 'bytes': len(data), 'sha256': digest(data),
                   'finalLF': data.endswith(b'\n'), 'lastBytesHex': data[-16:].hex()},
           'provenance': {'record': receipt_path().name, 'originalCase': name, 'sha256': digest(data)}}
    print(name, row['termination'], len(data), flush=True)
    return row


def receipt_path():
    resumed = HERE / 'resume-receipt.json'
    return resumed if resumed.exists() else HERE / 'capture-receipt.json'


def state():
    return json.loads(receipt_path().read_text())


def persist(receipt):
    save_json(receipt_path(), receipt)
    inputs = {row['file'] for row in receipt['cases']}
    archives = sorted(p.relative_to(HERE).as_posix() for p in HERE.rglob('*')
                      if p.is_file() and p.name != 'cases.json' and p.relative_to(HERE).as_posix() not in inputs)
    save_json(HERE / 'cases.json', {'schema': 'hugr-lean/native-cases/1', 'family': 'next',
                                  'baseline': BASE, 'cases': receipt['cases'], 'archives': archives})


def prepare():
    if (HERE / 'capture-receipt.json').exists():
        raise RuntimeError('Existing receipt: use install/build subcommands; do not overwrite native evidence')
    workspace = Path(tempfile.mkdtemp(prefix='B02-next-', dir=TEMP))
    for name, text in SOURCES.items():
        path = workspace / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    save_json(HERE / 'source-recipes.json', {'origin': 'authored B02 tiny project, MIT',
                                            'base': SOURCES, 'variants': VARIANTS})
    receipt = {'schema': 'B02-capture/1', 'baseline': BASE, 'workspace': str(workspace),
               'environmentOverrides': {k: ENV[k] for k in ['NEXT_TELEMETRY_DISABLED', 'CI', 'NO_COLOR', 'TZ']},
               'environmentRemoved': ['FORCE_COLOR'], 'cases': [], 'sources': [], 'packages': []}
    persist(receipt)
    for executable in ['node', 'npm']:
        receipt['cases'].append(capture('B02-' + executable + '-version', [executable, '--version'], workspace, 15))
        persist(receipt)
    for package, version in VERSIONS.items():
        slug = package.replace('@', '').replace('/', '-')
        url = 'https://registry.npmjs.org/' + package.replace('/', '%2f') + '/' + version
        with urllib.request.urlopen(url, timeout=30) as response:
            data = response.read()
        metadata_file = 'registry-' + slug + '.json'
        (HERE / metadata_file).write_bytes(data)
        metadata = json.loads(data)
        assert metadata['version'] == version, (package, metadata['version'])
        receipt['packages'].append({'name': package, 'version': version, 'gitHead': metadata.get('gitHead'),
            'license': metadata.get('license'), 'repository': metadata.get('repository'), 'dist': metadata['dist'],
            'metadataFile': metadata_file, 'metadataURL': url, 'metadataSha256': digest(data)})
        persist(receipt)
    install(receipt)


def resume():
    if (HERE / 'resume-receipt.json').exists():
        raise RuntimeError('Resume already initialized')
    receipt = state()
    shutil.copyfile(HERE / 'cases.json', HERE / 'ENOSPC-cases.json')
    receipt['previousReceipt'] = 'capture-receipt.json'
    receipt['resume'] = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'availableBytes': shutil.disk_usage(TEMP).free,
        'historicalCheckpoint': '3941ecd58b85a7baef3bedde8c17c333b5edce31',
        'authorization': 'User cleared campaign temporary storage and authorized tiny native captures'}
    workspace = Path(receipt['workspace'])
    if not workspace.exists():
        workspace = Path(tempfile.mkdtemp(prefix='B02-next-resume-', dir=TEMP))
        receipt['workspace'] = str(workspace)
    for name, text in SOURCES.items():
        path = workspace / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    receipt['environmentOverrides'].update({'RAYON_NUM_THREADS': '1', 'UV_THREADPOOL_SIZE': '1'})
    save_json(HERE / 'resume-receipt.json', receipt)
    persist(receipt)


def install(receipt):
    workspace = Path(receipt['workspace'])
    if any(row['name'] == 'B02-install' for row in receipt['cases']):
        raise RuntimeError('Install capture already exists; preserve receipt instead of overwriting it')
    available = shutil.disk_usage(workspace).free
    if available < 1024 ** 3:
        receipt['blockers'] = [{'kind': 'insufficient-disk', 'availableBytes': available,
                               'minimumBytes': 1024 ** 3, 'stage': 'npm install not started'}]
        persist(receipt)
        raise RuntimeError('B02 install requires 1 GiB free; metadata retained; native build coverage blocked')
    row = capture('B02-install', ['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund',
                                  '--registry=https://registry.npmjs.org', '--cache', str(workspace / 'npm-cache')], workspace, 180)
    receipt['cases'].append(row)
    persist(receipt)
    if row['termination'] != {'kind': 'exited', 'code': 0}:
        raise RuntimeError('Install failed; exact evidence retained')
    shutil.copyfile(workspace / 'package-lock.json', HERE / 'npm-lock.json')
    receipt['lockSha256'] = digest((HERE / 'npm-lock.json').read_bytes())
    receipt.pop('blockers', None)
    for package in VERSIONS:
        root = workspace / 'node_modules' / package
        info = json.loads((root / 'package.json').read_text())
        assert info['version'] == VERSIONS[package], (package, info['version'])
        license_paths = sorted(p for p in root.iterdir() if p.name.lower().startswith('license') and p.is_file())
        if not license_paths:
            raise RuntimeError('Missing installed license: ' + package)
        for license_path in license_paths:
            target = 'LICENSE.' + package.replace('@', '').replace('/', '-') + '.txt'
            shutil.copyfile(license_path, HERE / target)
            receipt['sources'].append({'package': package, 'version': info['version'],
                'installedPath': str(license_path), 'packagePath': license_path.name, 'archive': target,
                'producerPin': next(p for p in receipt['packages'] if p['name'] == package),
                'sha256': digest(license_path.read_bytes()), 'modifications': 'none; exact installed package license bytes'})
    receipt['cases'].append(capture('B02-next-version', ['node', 'node_modules/next/dist/bin/next', '--version'], workspace, 15))
    receipt['installedProducerFiles'] = []
    for path in [workspace / 'node_modules/next/dist/bin/next',
                 *sorted((workspace / 'node_modules/@next').glob('swc-*/*.node'))]:
        data = path.read_bytes()
        receipt['installedProducerFiles'].append({'path': str(path), 'bytes': len(data), 'sha256': digest(data)})
    persist(receipt)


def verify_sri():
    receipt = state()
    checks = []
    lock = json.loads((HERE / 'npm-lock.json').read_text())
    for package in receipt['packages']:
        expected = package['dist']['integrity']
        algorithm, encoded = expected.split('-', 1)
        hasher = hashlib.new(algorithm)
        size = 0
        with urllib.request.urlopen(package['dist']['tarball'], timeout=30) as response:
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > 64 * 1024 * 1024:
                    raise RuntimeError('Tarball exceeded 64 MiB bound')
                hasher.update(chunk)
        actual = base64.b64encode(hasher.digest()).decode('ascii')
        if actual != encoded or lock['packages']['node_modules/' + package['name']]['integrity'] != expected:
            raise RuntimeError('Tarball/lock SRI mismatch: ' + package['name'])
        checks.append({'name': package['name'], 'version': package['version'], 'url': package['dist']['tarball'],
                       'bytes': size, 'verifiedIntegrity': expected, 'lockCorrespondence': True})
    receipt['sriEvidence'] = 'sri-verification.json'
    save_json(HERE / 'sri-verification.json', {'recipe': 'stream exact registry tarball through declared hash; compare digest and actual npm lock integrity',
              'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'checks': checks})
    persist(receipt)


def license_capture():
    receipt = state()
    package = next(p for p in receipt['packages'] if p['name'] == 'next')
    commit = package['gitHead']
    source_path = 'license.md'
    url = f'https://raw.githubusercontent.com/vercel/next.js/{commit}/{source_path}'
    with urllib.request.urlopen(url, timeout=30) as response:
        data = response.read()
    target = HERE / 'LICENSE.next-upstream.txt'
    if target.exists():
        raise RuntimeError('License capture already exists')
    target.write_bytes(data)
    receipt['sources'].append({'repository': 'https://github.com/vercel/next.js', 'commit': commit,
        'path': source_path, 'url': url, 'license': 'MIT', 'archive': target.name,
        'sha256': digest(data), 'modifications': 'none; exact pinned upstream bytes',
        'reach': 'Source license only; package SRI, installed producer, and build correspondence not verified'})
    persist(receipt)


def build(variant, attempt, timeout):
    receipt = state()
    name = 'B02-' + variant + ('-' + attempt if attempt else '')
    if any(row['name'] == name for row in receipt['cases']):
        raise RuntimeError('Capture exists: ' + name)
    workspace = Path(receipt['workspace'])
    if not (workspace / 'node_modules/next/dist/bin/next').is_file():
        raise RuntimeError('Pinned Next install missing; build not started')
    if shutil.disk_usage(workspace).free < 512 * 1024 ** 2:
        raise RuntimeError('B02 tiny build requires 512 MiB free; build not started')
    for path in [workspace / 'pages', workspace / '.next']:
        if path.exists():
            shutil.rmtree(path)
    for extra in ['style.css', 'tsconfig.tsbuildinfo']:
        (workspace / extra).unlink(missing_ok=True)
    source = {**SOURCES, **VARIANTS[variant]}
    for filename, text in source.items():
        path = workspace / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    source_hashes = {key: digest((workspace / key).read_bytes()) for key in source}
    save_json(HERE / 'resume-source-recipes.json', {'origin': 'authored B02 tiny project, MIT',
        'base': SOURCES, 'variants': VARIANTS,
        'modifications': 'Build-failure uses require rather than typed import to reach webpack after successful TS validation; other recipes unchanged'})
    row = capture(name, ['node', 'node_modules/next/dist/bin/next', 'build'], workspace, timeout)
    row['variant'] = variant
    row['sourceRecipe'] = {'file': 'resume-source-recipes.json', 'base': 'base', 'overlay': 'variants.' + variant}
    row['sourceHashes'] = source_hashes
    row['postBuildSourceHashes'] = {key: digest((workspace / key).read_bytes()) for key in source}
    receipt['cases'].append(row)
    persist(receipt)
    artifacts = []
    for path in sorted((workspace / '.next').rglob('*')):
        if path.is_file():
            data = path.read_bytes()
            artifact = {'path': path.relative_to(workspace).as_posix(), 'bytes': len(data), 'sha256': digest(data)}
            if path.name in {'BUILD_ID', 'routes-manifest.json', 'build-manifest.json', 'prerender-manifest.json', 'pages-manifest.json'}:
                artifact['content'] = data.decode('utf-8')
            artifacts.append(artifact)
    artifact_file = name + '.artifacts.json'
    save_json(HERE / artifact_file, {'recipe': 'inspect .next recursively after process exit; hash raw file bytes; retain named manifests verbatim',
                                   'termination': row['termination'], 'artifacts': artifacts})
    row['artifactEvidence'] = artifact_file
    persist(receipt)


def evidence():
    receipt = state()
    rows = []
    generated = Path(receipt['workspace']) / 'next-env.d.ts'
    generated_bytes = generated.read_bytes()
    generated_name = 'generated-next-env.d.ts.txt'
    (HERE / generated_name).write_bytes(generated_bytes)
    for row in receipt['cases']:
        data = (HERE / row['file']).read_bytes()
        observed = {'name': row['name'], 'file': row['file'], 'bytes': len(data),
                    'sha256': digest(data), 'matchesReceipt': digest(data) == row['sha256'],
                    'termination': row['termination'], 'completeness': row['completeness']}
        if 'sourceRecipe' in row:
            recipe = json.loads((HERE / row['sourceRecipe']['file']).read_text())
            sources = {**recipe['base'], **recipe['variants'][row['variant']]}
            observed['recipeHashCorrespondence'] = {key: digest(text.encode('utf-8')) == row['sourceHashes'][key]
                                                   for key, text in sources.items()}
            observed['generatedNextEnvCorrespondence'] = digest(generated_bytes) == row['postBuildSourceHashes']['next-env.d.ts']
            archive = json.loads((HERE / row['artifactEvidence']).read_text())
            observed['retainedManifestHashes'] = {item['path']: digest(item['content'].encode('utf-8')) == item['sha256']
                for item in archive['artifacts'] if 'content' in item}
        rows.append(observed)
    historical = []
    for name in ['capture-receipt.json', 'bootstrap-failure.json', 'bootstrap-node-version.log',
                 'bootstrap-npm-version.log', 'source-recipes.json']:
        original = subprocess.check_output(['git', 'show', '3941ecd:fixtures/profiles/next/' + name], cwd=HERE)
        current = (HERE / name).read_bytes()
        historical.append({'file': name, 'sha256': digest(current), 'unchangedSinceENOSPCCheckpoint': current == original})
    control = receipt['cases'][0]
    control_bytes = (HERE / control['file']).read_bytes()
    save_json(HERE / 'evidence-inventory.json', {'recipe': 'recompute raw input, authored source recipe, retained manifest and historical checkpoint byte correspondence; no parser or test execution',
        'cases': rows, 'historical': historical, 'generatedNextEnv': {'file': generated_name, 'sha256': digest(generated_bytes)},
        'hashCalibration': {'case': control['name'], 'unchangedMatches': digest(control_bytes) == control['sha256'],
                            'inMemoryAppendedNulMatches': digest(control_bytes + b'\0') == control['sha256'],
                            'fileModified': False},
        'reach': 'Artifact byte correspondence only; independent corpus/filter preservation verification remains lead-owned'})
    persist(receipt)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', 'resume', 'install', 'sri', 'license', 'build', 'evidence', 'index'])
    parser.add_argument('variant', nargs='?', choices=list(VARIANTS))
    parser.add_argument('--attempt', default='')
    parser.add_argument('--timeout', type=int, default=90)
    args = parser.parse_args()
    if args.attempt and not all(c.isalnum() or c == '-' for c in args.attempt):
        parser.error('attempt must be alphanumeric/hyphen')
    if not 1 <= args.timeout <= 300:
        parser.error('timeout must be between 1 and 300 seconds')
    if args.action == 'prepare':
        prepare()
    elif args.action == 'resume':
        resume()
    elif args.action == 'install':
        install(state())
    elif args.action == 'sri':
        verify_sri()
    elif args.action == 'license':
        license_capture()
    elif args.action == 'evidence':
        evidence()
    elif args.action == 'build':
        if args.variant is None:
            parser.error('build requires variant')
        build(args.variant, args.attempt, args.timeout)
    else:
        persist(state())
