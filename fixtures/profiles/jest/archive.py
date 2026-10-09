"""Reconcile flat archives and native receipt hashes; no native/filter replay."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'cases.json').read_text())
receipt = json.loads((root / 'capture-receipt.json').read_text())
records = manifest['cases'] + receipt['sources'] + receipt['snapshotAttachments']
records += [attachment for case in manifest['cases'] for attachment in case['attachments']]
for record in records:
    raw = (root / record['file']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == record['sha256'], record['file']
    assert len(raw) == record.get('inputBytes', record.get('bytes')), record['file']
inputs = {case['file'] for case in manifest['cases']}
assert len(inputs) == len(manifest['cases'])
assert all('output' not in case for case in manifest['cases'])
manifest['archives'] = sorted(str(p.relative_to(root)) for p in root.rglob('*')
                              if p.is_file() and str(p.relative_to(root)) not in inputs | {'cases.json'})
assert all(isinstance(path, str) for path in manifest['archives'])
(root / 'cases.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'nativeCases': len(inputs), 'archives': len(manifest['archives']), 'hashBoundRecords': len(records)}))
