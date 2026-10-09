"""Tiny native capture only. All artifact output is explicit and byte preserving."""
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
SCRATCH = Path(os.environ['R03_SCRATCH']) if 'R03_SCRATCH' in os.environ else Path(tempfile.mkdtemp(prefix='R03-vitest-', dir='/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode'))
shutil.copytree(ROOT / 'inputs', SCRATCH, dirs_exist_ok=True)
ENV = {**os.environ, 'CI': '1', 'NO_COLOR': '1', 'TZ': 'UTC'}
ENV.pop('FORCE_COLOR', None)
ENV.pop('R03_FAIL', None)
ENV.pop('R03_SCRATCH', None)
NODE = shutil.which('node')
assert NODE

def capture(argv, env=ENV):
    process = subprocess.Popen(argv, cwd=SCRATCH, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    data, _ = process.communicate(timeout=120)
    return data, process.returncode

def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')

install_argv = ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org']
data, code = capture(install_argv)
(ROOT / 'resumed-install.txt').write_bytes(data)
write_json(ROOT / 'resumed-install-receipt.json', {'argv': install_argv, 'cwd': str(SCRATCH), 'exitCode': code,
           'processEOF': True, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
if code != 0:
    raise RuntimeError(f'isolated npm ci failed: {code}')
assert (SCRATCH / 'package-lock.json').read_bytes() == (ROOT / 'inputs/package-lock.json').read_bytes()
pins = []
lock = json.loads((SCRATCH / 'package-lock.json').read_text())
for name in ['vitest', '@vitest/coverage-v8']:
    item = lock['packages']['node_modules/' + name]
    package = json.loads((SCRATCH / 'node_modules' / name / 'package.json').read_text())
    license_path = SCRATCH / 'node_modules' / name / 'LICENSE.md'
    if not license_path.exists():
        license_path = SCRATCH / 'node_modules' / name / 'LICENSE'
    target = 'LICENSE.' + name.replace('@', '').replace('/', '-') + '.txt'
    assert license_path.read_bytes() == (ROOT / target).read_bytes()
    assert package['version'] == item['version'] == '3.2.4'
    pins.append({'package': name, 'version': item['version'], 'resolved': item['resolved'], 'integrity': item['integrity'],
                 'license': package['license'], 'licenseFile': target, 'licenseSha256': hashlib.sha256(license_path.read_bytes()).hexdigest()})

matrix = [
    ('R03-default-projects-resumed', [], {}),
    ('R03-verbose-coverage', ['--reporter=verbose', '--coverage'], {}),
    ('R03-dot-projects', ['--reporter=dot'], {}),
    ('R03-json-projects', ['--reporter=json'], {}),
    ('R03-junit-projects', ['--reporter=junit'], {}),
    ('R03-multiple-reporters', ['--reporter=default', '--reporter=json'], {}),
    ('R03-retry-exhausted-coverage', ['--reporter=verbose', '--coverage', '--coverage.reportOnFailure'], {'R03_FAIL': '1'}),
    ('R03-user-reporter-explicit', ['--reporter=./collision-reporter.mjs'], {}),
    ('R03-user-reporter-config', ['--config=collision.config.mjs'], {}),
    ('R03-user-reporter-config-valid', ['--config=collision.config.mjs'], {}),
]
cases, receipts = [], []
version_argv = [NODE, str(SCRATCH / 'node_modules/vitest/vitest.mjs'), '--version']
version_data, version_code = capture(version_argv)
(ROOT / 'resumed-version.txt').write_bytes(version_data)
assert version_code == 0 and b'3.2.4' in version_data
packet = {'schema': 'R03-native-capture/1', 'baseline': '248c303cb208f237896c0c6aaba777752aa481f5',
          'capturedAt': datetime.now(timezone.utc).isoformat(), 'node': subprocess.check_output([NODE, '--version'], text=True).strip(),
          'platform': platform.platform(), 'pins': pins, 'cases': receipts,
          'version': {'argv': version_argv, 'exitCode': version_code, 'processEOF': True, 'file': 'resumed-version.txt',
                      'sha256': hashlib.sha256(version_data).hexdigest()},
          'sources': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT / 'inputs').rglob('*')) if p.is_file()}}
for name, flags, extra in matrix:
    args = ['run', '--config=vitest.config.mjs', '--no-color', *flags]
    if name == 'R03-user-reporter-config-valid':
        args = ['run', '--config=collision.config.mjs', '--no-color']
    argv = [NODE, str(SCRATCH / 'node_modules/vitest/vitest.mjs'), *args]
    data, code = capture(argv, {**ENV, **extra})
    file = name + '.txt'
    (ROOT / file).write_bytes(data)
    digest = hashlib.sha256(data).hexdigest()
    receipt = {'id': name, 'argv': argv, 'cwd': str(SCRATCH), 'environment': {k: ENV[k] for k in ['CI', 'NO_COLOR', 'TZ']} | extra,
               'exitCode': code, 'processEOF': True, 'platform': packet['platform'], 'version': '3.2.4',
               'mergedStream': 'stdout PIPE; stderr STDOUT; single OS pipe; communicate until EOF',
               'bytes': len(data), 'sha256': digest, 'endsWithLF': data.endswith(b'\n'), 'tailHex': data[-32:].hex()}
    if '--coverage' in flags:
        coverage = SCRATCH / 'coverage/coverage-summary.json'
        if coverage.exists():
            coverage_name = name + '.coverage.json'
            shutil.copyfile(coverage, ROOT / coverage_name)
            receipt['coverageArtifact'] = coverage_name
            receipt['coverageSha256'] = hashlib.sha256(coverage.read_bytes()).hexdigest()
            coverage.unlink()
    receipts.append(receipt)
    write_json(ROOT / 'capture-receipt.json', packet)
    cases.append({'name': name, 'family': 'vitest', 'version': '3.2.4', 'platform': platform.platform(),
                  'command': argv, 'file': file, 'status': 'passthrough',
                  'termination': {'kind': 'exited', 'code': code}, 'completeness': 'complete', 'presentation': 'unknown',
                  'provenance': {'receipt': 'capture-receipt.json', 'case': name, 'sha256': digest}})
write_json(ROOT / 'capture-receipt.json', packet)
archives = sorted(str(p.relative_to(ROOT)) for p in ROOT.rglob('*') if p.is_file() and p.name not in {c['file'] for c in cases} and p.name != 'cases.json')
write_json(ROOT / 'cases.json', {'schema': 'hugr-lean/native-cases/1', 'family': 'vitest',
           'baseline': '248c303cb208f237896c0c6aaba777752aa481f5', 'cases': cases, 'archives': archives})
print(json.dumps({'scratch': str(SCRATCH), 'captures': [(r['id'], r['exitCode']) for r in receipts]}))
