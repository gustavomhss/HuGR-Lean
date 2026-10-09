"""Capture only missing config witness; keep duplicate-option failure intact."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent
receipt = json.loads((root / 'capture-receipt.json').read_text())
manifest = json.loads((root / 'cases.json').read_text())
previous = receipt['cases'][-1]
args = ['run', '--config=collision.config.mjs', '--no-color']
argv = [*previous['argv'][:2], *args]
env = {**os.environ, **previous['environment']}
env.pop('FORCE_COLOR', None)
env.pop('R03_FAIL', None)
process = subprocess.Popen(argv, cwd=previous['cwd'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
data, _ = process.communicate(timeout=120)
name = 'R03-user-reporter-config-valid'
file = name + '.txt'
(root / file).write_bytes(data)
item = {**previous, 'id': name, 'argv': argv, 'exitCode': process.returncode,
        'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
        'endsWithLF': data.endswith(b'\n'), 'tailHex': data[-32:].hex(), 'processEOF': True}
receipt['cases'].append(item)
(root / 'capture-receipt.json').write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + '\n')
case = {**manifest['cases'][-1], 'name': name, 'file': file, 'command': argv,
        'termination': {'kind': 'exited', 'code': process.returncode},
        'provenance': {'receipt': 'capture-receipt.json', 'case': name, 'sha256': item['sha256']}}
manifest['cases'].append(case)
manifest['archives'] = sorted(str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()
                             and p.name not in {c['file'] for c in manifest['cases']} and p.name != 'cases.json')
(root / 'cases.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'id': name, 'exit': process.returncode, 'file': file}))
