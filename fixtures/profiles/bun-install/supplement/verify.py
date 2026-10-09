"""Verify stored source/outcome witnesses; corruption probes never modify originals."""
import base64
import copy
import hashlib
import io
import json
import pathlib
import subprocess
import tarfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
MARKER = b'P04_DEP_POSTINSTALL_EXECUTED_v1\n'

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def artifact(ref):
    raw = (ROOT / ref['file']).read_bytes()
    assert len(raw) == ref['bytes'] and digest(raw) == ref['sha256'], ref['file']
    return raw

def witness(receipt):
    assert receipt['tools'][0]['output'] == '1.3.14\n'
    assert receipt['tools'][1]['output'] == '1.3.14+0d9b296af\n'
    assert receipt['tools'][0]['executableSHA256'] == 'ea2f223e94bb2f4bf3050895113c3cf346438f6fa0501c8532284e063f72f7a0'
    sources = {pathlib.Path(ref['file']).name: artifact(ref) for ref in receipt['sources']}
    assert json.loads(sources['package.json'])['scripts']['postinstall'] == 'node install.cjs'
    assert MARKER.strip() in sources['install.cjs']
    assert b'MIT License' in sources['LICENSE']
    packed = artifact(receipt['tarball'])
    with tarfile.open(fileobj=io.BytesIO(packed), mode='r:gz') as tar:
        assert set(tar.getnames()) == {'package/' + name for name in sources}
        for name, raw in sources.items():
            assert tar.extractfile('package/' + name).read() == raw
    integrity = 'sha512-' + base64.b64encode(hashlib.sha512(packed).digest()).decode()
    for fact in receipt['cases']:
        suffix = fact['name'].split('/')[-1]
        raw = (ROOT / fact['file']).read_bytes()
        bound = fact['boundary']
        assert len(raw) == bound['bytes'] and digest(raw) == bound['sha256']
        assert bound['readThroughEOF'] is True
        assert bound['finalLF'] == raw.endswith(b'\n') and raw[-32:].hex() == bound['lastBytesHex']
        assert fact['termination'] == {'kind': 'exited', 'code': 0}
        before = json.loads(artifact(fact['manifestBefore']))
        after = json.loads(artifact(fact['manifestAfter']))
        lock = artifact(fact['lock']).decode()
        assert receipt['registry'] + '/witness.tgz' in lock and integrity in lock
        assert not fact['dependencySymlink'] and fact['dependencyRealpath'].startswith(fact['cwd'] + '/')
        for source in fact['installedSources']:
            assert source['regular'] and not source['symlink']
            assert source['sha256'] == digest(sources[source['file']])
        assert {r['path'] for r in fact['requests']} == {'/p04-trusted-witness', '/witness.tgz'}
        assert all(r['status'] == 200 for r in fact['requests'])
        assert next(r for r in fact['requests'] if r['path'] == '/witness.tgz')['sha256'] == digest(packed)
        trusted = suffix in ('registry-trusted-manifest', 'registry-trusted-flag')
        assert fact['markerBefore'] is False and fact['markerAfter'] is trusted
        if trusted:
            assert artifact(fact['marker']) == MARKER
            assert MARKER in raw
            for row in (b'Resolving dependencies\n', b'Resolved, downloaded and extracted [999]\n',
                        b'Saved lockfile\n', b'+ p04-native-shaped-user-log@9.9.9\n',
                        b'999 packages installed [0.01ms]\n'):
                assert row in raw
            assert after['trustedDependencies'] == ['p04-trusted-witness']
            assert '"trustedDependencies"' in lock
        else:
            assert fact['marker'] is None and MARKER not in raw
            assert b'Blocked 1 postinstall.' in raw
            assert 'trustedDependencies' not in before and 'trustedDependencies' not in after
        if suffix == 'registry-trusted-manifest':
            assert before['trustedDependencies'] == ['p04-trusted-witness']
        if suffix == 'registry-trusted-flag':
            assert 'trustedDependencies' not in before and '--trust' in fact['argv']
        if suffix == 'registry-offline-request':
            assert '--offline' in fact['argv']  # requests above falsify enforced offline

manifest = json.loads((ROOT / 'cases.json').read_text())
baseline = json.loads(subprocess.check_output(['git', 'show',
    '22ddaa6:fixtures/profiles/bun-install/cases.json'], cwd=ROOT))
assert manifest['cases'][:len(baseline['cases'])] == baseline['cases']
receipt = json.loads((ROOT / 'supplement/visible/receipt.json').read_text())
witness(receipt)
for label, mutate in [
        ('marker', lambda r: r['cases'][1]['marker'].update(sha256='0' * 64)),
        ('receipt', lambda r: r['cases'][1].update(markerAfter=False)),
        ('EOF', lambda r: r['cases'][1]['boundary'].update(readThroughEOF=False))]:
    broken = copy.deepcopy(receipt)
    mutate(broken)
    try:
        witness(broken)
    except AssertionError:
        print(label + ' corruption rejected')
    else:
        raise AssertionError(label + ' corruption missed')
witness(receipt)
print('Stored witnesses restored/intact; original 24 cases unchanged.')
print('Collector SHA-256 ' + digest((ROOT / 'supplement/capture.py').read_bytes()))
