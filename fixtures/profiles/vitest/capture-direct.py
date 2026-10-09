"""Direct argv routing witnesses; use already-installed private pinned binary."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent
packet = json.loads((root / 'capture-receipt.json').read_text())
manifest = json.loads((root / 'cases.json').read_text())
cwd = packet['cases'][0]['cwd']
env = {**os.environ, **packet['cases'][0]['environment'], 'PATH': str(Path(cwd) / 'node_modules/.bin') + os.pathsep + os.environ['PATH']}
env.pop('FORCE_COLOR', None)
env.pop('R03_FAIL', None)
for name, args in [
    ('R03-direct-default-projects', ['run', '--config=vitest.config.mjs', '--no-color']),
    ('R03-direct-reporter-explicit', ['run', '--config=vitest.config.mjs', '--no-color', '--reporter=./collision-reporter.mjs']),
    ('R03-direct-reporter-config', ['run', '--config=collision.config.mjs', '--no-color']),
]:
    argv = ['vitest', *args]
    process = subprocess.Popen(argv, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    data, _ = process.communicate(timeout=120)
    file = name + '.txt'
    (root / file).write_bytes(data)
    digest = hashlib.sha256(data).hexdigest()
    packet['cases'].append({'id': name, 'argv': argv, 'cwd': cwd, 'environment': {k: env[k] for k in ['CI', 'NO_COLOR', 'TZ', 'PATH']},
        'exitCode': process.returncode, 'processEOF': True, 'platform': packet['platform'], 'version': '3.2.4',
        'bytes': len(data), 'sha256': digest, 'endsWithLF': data.endswith(b'\n'), 'tailHex': data[-32:].hex(),
        'mergedStream': 'stdout PIPE; stderr STDOUT; single OS pipe; communicate until EOF'})
    (root / 'capture-receipt.json').write_text(json.dumps(packet, indent=2, ensure_ascii=False) + '\n')
    manifest['cases'].append({'name': name, 'family': 'vitest', 'version': '3.2.4', 'platform': packet['platform'],
        'command': argv, 'file': file, 'status': 'passthrough', 'termination': {'kind': 'exited', 'code': process.returncode},
        'completeness': 'complete', 'presentation': 'unknown', 'provenance': {'receipt': 'capture-receipt.json', 'case': name, 'sha256': digest}})
# Original Node launches must retain their actual executed argv in the corpus.
for entry in manifest['cases']:
    item = next(value for value in packet['cases'] if value['id'] == entry['name'])
    entry['command'] = item['argv']
    entry['status'] = 'passthrough'
    entry.pop('expectedFile', None)
manifest['archives'] = sorted(str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()
    and p.name not in {c['file'] for c in manifest['cases']} and p.name != 'cases.json')
(root / 'cases.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
print('Direct routing witnesses saved; original Node argv retained.')
