"""Adapt native facts to current corpus receipt contract; never rewrite raw/historical proof."""
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'cases.json').read_text())
old = json.loads((root / 'capture-receipt.json').read_text())
new = json.loads((root / 'config-capture-receipt.json').read_text())
sha = lambda raw: hashlib.sha256(raw).hexdigest()
facts = []
for entry in manifest['cases']:
    origin_file = 'config-capture-receipt.json' if entry['name'].startswith('R02-config-') else 'capture-receipt.json'
    origin = new if origin_file.startswith('config-') else old
    matches = [record for record in origin['records'] if record['name'] == entry['name']]
    assert len(matches) == 1
    record = matches[0]
    raw = (root / entry['file']).read_bytes()
    assert len(raw) == record['inputBytes'] and sha(raw) == record['sha256']
    for key in ['command', 'termination', 'completeness', 'presentation', 'version']:
        assert record[key] == entry[key], (entry['name'], key)
    fact = {key: record[key] for key in ['name', 'command', 'termination', 'completeness', 'presentation', 'version']}
    fact['boundary'] = {**record['eof'], 'description': record['boundary'], 'stderrMergedBeforeExec': True,
                        'waitedForExit': True, 'normalizationApplied': False}
    fact['originalReceipt'] = {'file': origin_file, 'case': record['name'], 'sha256': sha((root / origin_file).read_bytes())}
    fact['rawFile'] = entry['file']
    facts.append(fact)
    entry['provenance'] = {'receipt': 'normalized-receipt.json', 'case': entry['name'], 'sha256': sha(raw)}
receipt = {'schema': 'hugr-lean/native-receipt/1', 'purpose': 'fact-only adapter; historical statuses/goldens unchanged in original archives', 'cases': facts}
(root / 'normalized-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
for source in old['sources']:
    path = root / source['file']
    assert sha(path.read_bytes()) == source['sha256'], source['file']
    original = subprocess.check_output(['git', 'show', '56cc2f3:fixtures/profiles/jest/' + source['file']], cwd=root)
    assert path.read_bytes() == original, source['file']
for source in new['sources']:
    assert sha((root / source['file']).read_bytes()) == source['sha256'], source['file']
manifest['archives'] = sorted(str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()
                              and p.name not in ['input.txt', 'cases.json'])
(root / 'cases.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'normalizedCases': len(facts), 'originalSourceFilesPreserved': len(old['sources'])}))
