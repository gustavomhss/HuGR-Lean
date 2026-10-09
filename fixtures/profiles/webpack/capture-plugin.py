"""Supplement B05 capture: retain initial recipe failure; repair plugin string escaping."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parent
receipt = json.loads((OUT / 'capture-receipt.json').read_text())
manifest = json.loads((OUT / 'cases.json').read_text())
root = Path(receipt['root'])
project = root / 'tiny café space'
config = project / 'plugin.config.cjs'
initial = config.read_bytes()
(OUT / 'source/tiny café space/plugin-initial-invalid.config.cjs').write_bytes(initial)
fixed = initial.replace(b"(name: main)\nwebpack", b"(name: main)\\nwebpack").replace(
    b"in 1 ms\nB05", b"in 1 ms\\nB05").replace(b"KEEP\n');", b"KEEP\\n');")
config.write_bytes(fixed)
(OUT / 'source/tiny café space/plugin.config.cjs').write_bytes(fixed)
env = dict(os.environ, **receipt['environment'])
for fmt in ['default', 'normal', 'errors-warnings', 'json']:
    name = 'B05-plugin-success-' + fmt
    argv = [str(root / 'node_modules/.bin/webpack'), '--config', 'plugin.config.cjs', '--no-color']
    argv += ['--json'] if fmt == 'json' else ([] if fmt == 'default' else ['--stats', fmt])
    proc = subprocess.Popen(argv, cwd=project, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    raw, _ = proc.communicate(timeout=90)
    (OUT / (name + '.txt')).write_bytes(raw)
    fact = dict(name=name, command=argv, argv=argv, cwd=str(project), version=receipt['version'],
                platform=receipt['platform'], file=name + '.txt',
                completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                termination=dict(kind='exited', code=proc.returncode), completeness='complete', presentation='unknown',
                boundary=dict(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(), readThroughEOF=True,
                              finalLF=raw.endswith(b'\n'), lastBytesHex=raw[-32:].hex(),
                              method='stdout pipe; stderr redirected to stdout before exec; no PTY or normalization'))
    fact['artifacts'] = []
    for p in sorted((project / 'dist').rglob('*')):
        if p.is_file():
            artifact = p.read_bytes()
            target = 'artifacts/' + name + '/' + str(p.relative_to(project))
            dest = OUT / target
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(artifact)
            fact['artifacts'].append(dict(file=target, bytes=len(artifact), sha256=hashlib.sha256(artifact).hexdigest()))
            if target.endswith('.txt'):
                manifest['archives'].append(target)
    receipt['cases'].append(fact)
    manifest['cases'].append({**fact, 'family': 'webpack', 'status': 'passthrough',
                             'provenance': dict(receipt='capture-receipt.json', case=name, sha256=fact['boundary']['sha256'])})
    print(name, proc.returncode, len(raw))
receipt['supplementRecipe'] = dict(file='capture-plugin.py', sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
receipt['source'] = [dict(file=str(p.relative_to(OUT)), bytes=p.stat().st_size,
                        sha256=hashlib.sha256(p.read_bytes()).hexdigest())
                     for p in sorted((OUT / 'source').rglob('*')) if p.is_file()]
for filename, value in [('capture-receipt.json', receipt), ('cases.json', manifest)]:
    (OUT / filename).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
