"""Inventory existing recovery artifacts only; never execute native tools."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
target = root / 'recovery-receipt.json'
files = sorted(p for p in root.rglob('*') if p.is_file() and p != target)
metadata = {}
for path in files:
    data = path.read_bytes()
    metadata[str(path.relative_to(root))] = {
        'sha256': hashlib.sha256(data).hexdigest(),
        'bytes': len(data), 'endsWithLF': data.endswith(b'\n'),
        'tailHex': data[-32:].hex(),
    }
lock = json.loads((root / 'inputs/package-lock.json').read_text())
pins = {name: {key: lock['packages']['node_modules/' + name].get(key)
               for key in ['version', 'resolved', 'integrity', 'license']}
        for name in ['vitest', '@vitest/coverage-v8']}
receipt = {
    'schema': 'R03-interrupted-recovery/1',
    'baseline': '248c303cb208f237896c0c6aaba777752aa481f5',
    'state': 'blocked', 'nativeCasesPromoted': False,
    'archives': list(metadata), 'artifacts': metadata, 'pins': pins,
    'raw': {'file': 'R03-default-projects.txt', 'completeness': 'unknown',
            'termination': None, 'processEOF': None, 'observedArgv': None,
            'observedEnvironment': None, 'observedPlatform': None,
            'versionBanner': '3.2.4',
            'boundary': 'recipe merges stdout/stderr; executed boundary not authenticated'},
    'verification': 'Existing files inventoried only; no native captures, filter runs, tests, typechecks or CI.',
}
target.write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + '\n')
