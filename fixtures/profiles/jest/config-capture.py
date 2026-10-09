"""Two actual config-only Jest captures; preserve historical R02 records unchanged."""
import base64
import datetime
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import shlex
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parent
PARENT = Path('/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode')
assert PARENT.is_dir()
TEMP = Path(tempfile.mkdtemp(prefix='R02-config-', dir=PARENT))
TOOLS = TEMP / 'tools'
TOOLS.mkdir()
PROJECT = TEMP / 'project'
shutil.copytree(ROOT / 'source', PROJECT)
shutil.copytree(ROOT / 'attachments/__snapshots__', PROJECT / '__snapshots__')
(TOOLS / 'package.json').write_text(json.dumps({'private': True, 'dependencies': {'jest': '30.2.0'}}) + '\n')
lock = gzip.decompress((ROOT / 'tool-lock.json.gz').read_bytes())
(TOOLS / 'package-lock.json').write_bytes(lock)
ENV = {**os.environ, 'NO_COLOR': '1', 'CI': 'true', 'TZ': 'UTC', 'LC_ALL': 'C'}
for key in ['FORCE_COLOR', 'R02_FAIL', 'NODE_OPTIONS', 'JEST_WORKERS']:
    ENV.pop(key, None)
ENV['PATH'] = str(TOOLS / 'node_modules/.bin') + os.pathsep + ENV['PATH']
OUT = ROOT / 'config-provenance'
OUT.mkdir()
sha = lambda raw: hashlib.sha256(raw).hexdigest()
BOUNDARY = 'stdout pipe; stderr redirected to stdout before exec; communicate through EOF then wait; no PTY, rewriting, trimming or normalization'

def execute(name, argv, cwd):
    proc = subprocess.Popen(argv, cwd=cwd, env=ENV, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    raw, _ = proc.communicate(timeout=120)
    (OUT / (name + '.log')).write_bytes(raw)
    fact = {'argv': argv, 'command': shlex.join(argv), 'cwd': str(cwd), 'exitCode': proc.returncode,
            'bytes': len(raw), 'sha256': sha(raw), 'readThroughEOF': True, 'finalLF': raw.endswith(b'\n'),
            'lastBytesHex': raw[-32:].hex(), 'boundary': BOUNDARY,
            'completionAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (OUT / (name + '.json')).write_text(json.dumps(fact, indent=2) + '\n')
    assert proc.returncode == 0, f'{name}: exit {proc.returncode}; original log and receipt retained'
    return raw, fact

_, install = execute('install', ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org'], TOOLS)
version_raw, version = execute('version', ['jest', '--version'], PROJECT)
assert version_raw == b'30.1.3\n'
registry = json.loads((ROOT / 'jest-registry.json').read_text())
with urllib.request.urlopen(registry['dist']['tarball'], timeout=30) as response:
    package_raw = response.read()
assert 'sha512-' + base64.b64encode(hashlib.sha512(package_raw).digest()).decode() == registry['dist']['integrity']
verified = []
with tarfile.open(fileobj=io.BytesIO(package_raw), mode='r:gz') as package:
    for member in package.getmembers():
        if member.isfile():
            stream = package.extractfile(member)
            assert stream is not None
            data = stream.read()
            path = Path(member.name).relative_to('package')
            assert data == (TOOLS / 'node_modules/jest' / path).read_bytes(), str(path)
            verified.append({'path': str(path), 'sha256': sha(data)})
sources = [{'file': str(p.relative_to(ROOT)), 'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes())}
           for p in sorted((ROOT / 'source').rglob('*')) if p.is_file()]
records = []
for name, config, size in [('config-collision', 'config-collision.cjs', 160),
                           ('config-full-collision', 'config-full-collision.cjs', 196)]:
    argv = ['jest', '--config=' + config]
    raw, fact = execute(name, argv, PROJECT)
    target = ROOT / 'captures' / name
    target.mkdir()
    (target / 'input.txt').write_bytes(raw)
    assert len(raw) == size, f'{name}: native output changed; preserved, not rewritten'
    record = {'name': 'R02-' + name, 'family': 'jest', 'version': 'Jest package 30.2.0; CLI 30.1.3',
              'platform': platform.platform(), 'file': str((target / 'input.txt').relative_to(ROOT)),
              'status': 'passthrough', 'disposition': 'baseline-bug', 'findingReason': 'configured reporter owns native-looking markers; exact output required',
              'source': 'shell', 'command': fact['command'], 'argv': argv, 'cwd': str(PROJECT),
              'environment': {key: ENV[key] for key in ['PATH', 'NO_COLOR', 'CI', 'TZ', 'LC_ALL']},
              'environmentRemoved': ['FORCE_COLOR', 'R02_FAIL', 'NODE_OPTIONS', 'JEST_WORKERS'],
              'termination': {'kind': 'exited', 'code': 0}, 'completeness': 'complete', 'presentation': 'unknown',
              'boundary': BOUNDARY, 'inputBytes': size, 'outputBytes': size, 'sha256': sha(raw),
              'eof': {key: fact[key] for key in ['bytes', 'sha256', 'readThroughEOF', 'finalLF', 'lastBytesHex']},
              'completionAt': fact['completionAt'], 'attachments': [],
              'provenance': {'record': 'config-capture-receipt.json', 'originalCase': 'R02-' + name, 'sha256': sha(raw)}}
    records.append(record)
receipt = {'baseline': '56cc2f308deb63d4a39bd4d66a590150338fa208', 'leadReplay': 'f157b388f9ffa4a46d6c19bef980f1725045cc5c',
           'temp': str(TEMP), 'install': install, 'cliVersion': version, 'packageVersion': '30.2.0',
           'packageIntegrity': registry['dist']['integrity'], 'installedPackageFilesVerified': verified,
           'originalLockSHA256': sha(lock), 'installedLockSHA256': sha((TOOLS / 'package-lock.json').read_bytes()),
           'node': subprocess.check_output(['node', '--version']).decode().strip(),
           'npm': subprocess.check_output(['npm', '--version']).decode().strip(),
           'sources': sources, 'snapshotRecipe': 'copy existing archived snapshots unchanged; no seeding test rerun', 'records': records}
(ROOT / 'config-capture-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
manifest = json.loads((ROOT / 'cases.json').read_text())
manifest['cases'].extend(records)
# Old reduction proof and golden remain historical archives, not approved current expectations.
for case in manifest['cases']:
    if case['status'] == 'reduced':
        case['historicalExpectedFile'] = case.pop('expectedFile')
        case['historicalDisposition'] = case['disposition']
        case['historicalOutputBytes'] = case['outputBytes']
        case.update(status='passthrough', disposition='baseline-bug', outputBytes=case['inputBytes'],
                    findingReason='marker replacement cannot authenticate configured reporter; historical golden is not approved current output')
(ROOT / 'cases.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'temp': str(TEMP), 'cases': [{'name': c['name'], 'argv': c['argv'], 'bytes': c['inputBytes'], 'sha256': c['sha256']} for c in records]}, indent=2))
