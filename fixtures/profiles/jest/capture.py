"""R02 isolated native captures. Run once from any cwd; writes only this packet and temp."""
import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path
import platform
import shlex
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
TEMP = Path(os.environ['R02_TEMP']) if 'R02_TEMP' in os.environ else Path(tempfile.mkdtemp(prefix='R02-jest-', dir='/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode'))
TOOLS = TEMP / 'tools'
PROJECT = TEMP / 'project'
TOOLS.mkdir(exist_ok=True)
if not PROJECT.exists():
    shutil.copytree(ROOT / 'source', PROJECT)
TOOLS.joinpath('package.json').write_text(json.dumps({'private': True, 'dependencies': {'jest': '30.2.0'}}) + '\n')
ENV = {**os.environ, 'NO_COLOR': '1', 'CI': 'true', 'TZ': 'UTC', 'LC_ALL': 'C'}
ENV.pop('FORCE_COLOR', None)
ENV.pop('R02_FAIL', None)
ENV['PATH'] = str(TOOLS / 'node_modules/.bin') + os.pathsep + ENV['PATH']
BOUNDARY = 'stdout pipe; stderr redirected to stdout before exec; communicate through EOF then wait; no PTY, decoding rewrite, trim or normalization'
RECORDS = []

def digest(data):
    return hashlib.sha256(data).hexdigest()

def execute(argv, cwd, env):
    proc = subprocess.Popen(argv, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    raw, _ = proc.communicate(timeout=120)
    assert proc.returncode >= 0, 'Signal termination requires explicit metadata'
    return raw, proc.returncode

install_argv = ['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org']
raw, code = execute(install_argv, TOOLS, ENV)
(ROOT / 'install.log').write_bytes(raw)
assert code == 0, f'npm install exited {code}; install.log retained'
lock = TOOLS.joinpath('package-lock.json').read_bytes()
(ROOT / 'tool-lock.json.gz').write_bytes(gzip.compress(lock, mtime=0))
jest_package = json.loads(TOOLS.joinpath('node_modules/jest/package.json').read_text())
assert jest_package['version'] == '30.2.0'
license_source = TOOLS / 'node_modules/jest/LICENSE'
(ROOT / 'LICENSE.jest.txt').write_bytes(license_source.read_bytes())
tool = {'version': jest_package['version'], 'executable': str(TOOLS / 'node_modules/.bin/jest'),
        'gitHead': jest_package['gitHead'], 'upstreamLicensePath': 'LICENSE',
        'node': subprocess.check_output(['node', '--version']).decode().strip(),
        'npm': subprocess.check_output(['npm', '--version']).decode().strip(),
        'lockSHA256': digest(lock), 'jestLock': json.loads(lock)['packages']['node_modules/jest'],
        'licenseSource': str(license_source), 'licenseSHA256': digest(license_source.read_bytes()),
        'install': {'argv': install_argv, 'cwd': str(TOOLS), 'exitCode': code, 'file': 'install.log', 'sha256': digest(raw)}}
BASE = ['jest', '--runInBand', '--no-color', '--config=jest.config.cjs']

def capture(name, extra, expected_code=0, extra_env=None, projects=False):
    directory = ROOT / 'captures' / name
    directory.mkdir(parents=True)
    argv = (['jest', '--runInBand', '--no-color'] if projects else BASE) + extra
    env = {**ENV, **(extra_env or {})}
    raw, code = execute(argv, PROJECT, env)
    directory.joinpath('input.txt').write_bytes(raw)
    record = {'name': 'R02-' + name, 'family': 'jest', 'version': 'Jest 30.2.0', 'platform': platform.platform(),
              'file': f'captures/{name}/input.txt', 'status': 'passthrough', 'disposition': 'pending-policy',
              'source': 'shell', 'command': shlex.join(argv), 'argv': argv, 'cwd': str(PROJECT),
              'environment': {k: env[k] for k in ['PATH', 'NO_COLOR', 'CI', 'TZ', 'LC_ALL']},
              'environmentDelta': extra_env or {}, 'termination': {'kind': 'exited', 'code': code},
              'completeness': 'complete', 'presentation': 'unknown', 'boundary': BOUNDARY,
              'inputBytes': len(raw), 'outputBytes': len(raw), 'sha256': digest(raw),
              'eof': {'readThroughEOF': True, 'bytes': len(raw), 'sha256': digest(raw),
                      'finalLF': raw.endswith(b'\n'), 'lastBytesHex': raw[-32:].hex()},
              'completionAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'provenance': {'record': 'capture-receipt.json', 'originalCase': 'R02-' + name, 'sha256': digest(raw)},
              'attachments': []}
    for attachment in [PROJECT / 'coverage', PROJECT / 'result.json']:
        if attachment.exists():
            target = directory / attachment.name
            if attachment.is_dir():
                shutil.copytree(attachment, target)
                shutil.rmtree(attachment)
            else:
                shutil.copy2(attachment, target)
                attachment.unlink()
            for item in sorted(target.rglob('*')) if target.is_dir() else [target]:
                if item.is_file():
                    record['attachments'].append({'file': str(item.relative_to(ROOT)), 'bytes': item.stat().st_size,
                                                  'sha256': digest(item.read_bytes())})
    RECORDS.append(record)
    assert code == expected_code, f'{name}: exit {code}, expected {expected_code}; raw retained'
    print(name, code, len(raw))

capture('snapshot-written', ['--testPathPatterns=snapshot.test.cjs', '--updateSnapshot'])
capture('snapshot-passed', ['--testPathPatterns=snapshot.test.cjs', '--verbose'])
capture('snapshot-failed', ['--testPathPatterns=snapshot.test.cjs', '--verbose'], 1, {'R02_FAIL': '1'})
capture('skip-todo', ['--testPathPatterns=skip-todo.test.cjs', '--verbose'])
capture('log-snapshot-written', ['--testPathPatterns=mixed.test.cjs', '--verbose', '--updateSnapshot'])
capture('log-snapshot-passed', ['--testPathPatterns=mixed.test.cjs', '--verbose'])
capture('coverage-snapshot', ['--testPathPatterns=snapshot.test.cjs', '--coverage', '--coverageReporters=text', '--coverageReporters=json', '--coverageReporters=lcov'])
capture('multiproject-coverage-log-skip-snapshot', ['--projects', 'project-a.cjs', 'project-b.cjs', '--coverage', '--coverageReporters=text', '--coverageReporters=json', '--coverageReporters=lcov'], projects=True)
capture('json-default-log-snapshot', ['--testPathPatterns=mixed.test.cjs', '--json', '--outputFile=result.json'])
capture('reporter-collision-default', ['--testPathPatterns=snapshot.test.cjs', '--reporters=default', '--reporters=./collision-reporter.cjs'])
capture('reporter-collision-only', ['--testPathPatterns=snapshot.test.cjs', '--reporters=./collision-reporter.cjs'])
capture('skipped-suite', ['--testPathPatterns=skip.test.cjs', '--verbose'])
shutil.copytree(PROJECT / '__snapshots__', ROOT / 'attachments' / '__snapshots__')
source_files = [{'file': str(p.relative_to(ROOT)), 'bytes': p.stat().st_size, 'sha256': digest(p.read_bytes())}
                for p in sorted((ROOT / 'source').rglob('*')) if p.is_file()]
receipt = {'baseline': '248c303', 'tool': tool, 'temp': str(TEMP), 'boundary': BOUNDARY,
           'sources': source_files, 'records': RECORDS,
           'snapshotRecipe': 'snapshot-written seeds snapshot.test; log-snapshot-written seeds mixed.test; later runs reuse both; R02_FAIL=1 changes received count without editing source'}
(ROOT / 'capture-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
manifest = {'schema': 'hugr-lean/native-cases/1', 'family': 'jest', 'baseline': '248c303', 'cases': RECORDS,
            'archives': sorted(str(p.relative_to(ROOT)) for p in ROOT.rglob('*') if p.is_file() and p.name not in ['input.txt', 'cases.json'])}
(ROOT / 'cases.json').write_text(json.dumps(manifest, indent=2) + '\n')
