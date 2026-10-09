"""Offline artifact inspection only; no public-filter or suite verification."""
import base64
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def check(manifest, receipt):
    assert manifest['schema'] == 'hugr-lean/native-cases/1'
    assert {case['name'] for case in manifest['cases']} == set(receipt['evidence']) == set(receipt['artifacts'])
    summaries = {}
    for case in manifest['cases']:
        name = case['name']
        raw = case['output'].encode('utf-8')
        assert 'file' not in case and len(raw) == case['inputBytes'] == case['outputBytes']
        assert hashlib.sha256(raw).hexdigest() == case['sha256'] == case['provenance']['sha256']
        assert case['eof'] == {'readThroughEOF': True, 'finalLF': raw.endswith(b'\n'), 'lastBytesHex': raw[-16:].hex()}
        assert case['termination']['kind'] == 'exited' and case['completeness'] == 'complete'
        facts = receipt['evidence'][name]
        files = receipt['artifacts'][name]['test-results']
        for file in files.values():
            data = base64.b64decode(file['base64'], validate=True)
            assert len(data) == file['bytes'] and hashlib.sha256(data).hexdigest() == file['sha256']
        sidecar = receipt['artifacts'][name].get('report.json')
        document = sidecar['output'] if sidecar else case['output']
        if sidecar:
            assert hashlib.sha256(document.encode()).hexdigest() == sidecar['sha256']
        report = json.loads(document)
        assert report['stats'] == facts['stats']
        results = [result for test in facts['tests'] for result in test['results']]
        attachments = [attachment for result in results for attachment in result['attachments']]
        stdout = [chunk['text'] for result in results for chunk in result['stdout']]
        stderr = [chunk['text'] for result in results for chunk in result['stderr']]
        paths = []
        for attachment in attachments:
            if 'path' in attachment:
                relative = attachment['path'].split('/test-results/', 1)[1]
                assert relative in files, (name, relative)
                paths.append(attachment['path'])
            if 'body' in attachment:
                assert base64.b64decode(attachment['body'], validate=True)
        browser = 'browser-' in name
        failure = 'failure-' in name
        assert len(results) == (4 if browser else 12 if failure else 8)
        assert len(attachments) == (0 if browser else 12 if failure else 8)
        assert len(stdout) == (0 if browser else 10 if failure else 6)
        assert len(stderr) == (0 if browser else 2)
        assert len(paths) == (0 if browser else 6 if failure else 2)
        for test in facts['tests']:
            if 'flaky' in test['title']:
                assert [result['retry'] for result in test['results']] == [0, 1]
                assert [result['status'] for result in test['results']] == ['failed', 'passed']
            if 'skip' in test['title']:
                assert any(annotation['type'] == 'skip' and annotation['description'] == 'R04 deliberate skip reason 雪'
                           for annotation in test['annotations'])
            if browser or 'permanent failure' in test['title']:
                assert [result['status'] for result in test['results']] == ['failed', 'failed']
        if 'custom-collision' in name:
            assert 'Running 2 tests using 1 worker\n' in case['output'] and '  2 passed (1ms)\n' in case['output']
            assert facts['stats']['flaky'] == 2 and facts['stats']['skipped'] == 2
        summaries[name] = {'bytes': len(raw), 'exit': case['termination']['code'], 'stats': facts['stats'],
                           'attemptsIncludingSkips': len(results), 'attachments': len(attachments),
                           'pathAttachments': paths, 'stdoutChunks': len(stdout), 'stderrChunks': len(stderr),
                           'resultFiles': sorted(files)}
    return summaries


manifest = json.loads((ROOT / 'cases.json').read_text())
receipt = json.loads((ROOT / 'capture-receipt.json').read_text())
summaries = check(manifest, receipt)
probes = []
for label in ('raw-byte-loss', 'missing-path-artifact', 'retry-evidence-loss'):
    mutant_manifest, mutant_receipt = copy.deepcopy(manifest), copy.deepcopy(receipt)
    if label == 'raw-byte-loss':
        mutant_manifest['cases'][0]['output'] = mutant_manifest['cases'][0]['output'][:-1]
    elif label == 'missing-path-artifact':
        files = mutant_receipt['artifacts']['R04-api-list']['test-results']
        tests = mutant_receipt['evidence']['R04-api-list']['tests']
        attachment = next(attachment for test in tests for result in test['results']
                          for attachment in result['attachments'] if 'path' in attachment)
        del files[attachment['path'].split('/test-results/', 1)[1]]
    else:
        tests = mutant_receipt['evidence']['R04-api-list']['tests']
        next(test for test in tests if 'flaky' in test['title'])['results'].pop()
    try:
        check(mutant_manifest, mutant_receipt)
    except AssertionError:
        probes.append({'mutation': label, 'rejected': True, 'restoration': 'deep-copy only; committed artifacts never mutated'})
    else:
        raise AssertionError('Artifact inspection failed to detect ' + label)
assert hashlib.sha256((ROOT / 'capture.py').read_bytes()).hexdigest() == receipt['recipeSha256']
check(manifest, receipt)
(ROOT / 'audit-receipt.json').write_text(json.dumps({'scope': 'offline capture artifacts only; no runtime verification',
                                                  'cases': summaries, 'probes': probes}, ensure_ascii=False, indent=2) + '\n')
for name, summary in summaries.items():
    print(name, {key: summary[key] for key in ('bytes', 'exit', 'attemptsIncludingSkips', 'attachments', 'stdoutChunks', 'stderrChunks')})
print('Artifact-loss probes rejected:', [probe['mutation'] for probe in probes])
