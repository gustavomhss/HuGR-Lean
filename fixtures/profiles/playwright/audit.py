"""Offline artifact inspection only; no public-filter or suite verification."""
import base64
import argparse
import copy
import datetime
import hashlib
import json
from pathlib import Path
import re
import struct

ROOT = Path(__file__).resolve().parent


def extracted_tests(report):
    """Reproduce the capture's complete projection; preserve every result field."""
    assert isinstance(report['suites'], list) and report['suites'], 'empty reporter suites'
    tests = []

    def visit(suites):
        for suite in suites:
            if 'suites' in suite:
                assert isinstance(suite['suites'], list), 'invalid nested suites'
                visit(suite['suites'])
            for spec in suite.get('specs', []):
                assert spec['tests'], 'empty reporter test list'
                for test in spec['tests']:
                    assert isinstance(test['results'], list) and test['results'], 'empty reporter results'
                    tests.append({'title': spec['title'], 'project': test['projectName'], 'status': test['status'],
                                  'annotations': test['annotations'], 'results': test['results']})

    visit(report['suites'])
    assert tests, 'empty extracted reporter tests'
    return tests


def source_literal(source, prefix, suffix):
    """Decode only the closed string syntax in these immutable tiny fixtures."""
    assert source.count(prefix) == 1, 'source literal delimiter missing/duplicate'
    text = source.split(prefix, 1)[1].split(suffix, 1)[0]
    return text


def source_attachment_bytes(sources, project, retry):
    source = sources['tests/api.spec.cjs']['output']
    writes = source.split('fs.writeFileSync(artifact, `')[1:]
    assert len(writes) == 2, 'source path attachment recipes missing/extra'
    values = {
        'body-evidence': source_literal(source, "Buffer.from('", "')"),
        'retry-evidence': source_literal(source, 'Buffer.from(`', '`)'),
        'path-evidence': writes[0].split('`);', 1)[0],
        'failure-path': writes[1].split('`);', 1)[0],
    }
    result = {}
    for name, text in values.items():
        text = text.replace('${info.project.name}', project).replace('${info.retry}', str(retry))
        assert '${' not in text, 'unsupported source template expression'
        result[name] = json.loads('"' + text + '"').encode('utf-8')
    return result


def check(manifest, receipt):
    assert manifest['cases'], 'empty native cases'
    names = [case['name'] for case in manifest['cases']]
    assert len(names) == len(set(names)), 'duplicate native cases'
    assert set(names) == set(receipt['evidence']) == set(receipt['artifacts']), 'case/receipt correspondence'
    summaries = {}
    for case in manifest['cases']:
        name = case['name']
        single = dict(receipt, evidence={name: receipt['evidence'][name]}, artifacts={name: receipt['artifacts'][name]})
        try:
            summaries.update(check_case(dict(manifest, cases=[case]), single))
        except (AssertionError, KeyError, ValueError, TypeError, IndexError, StopIteration, struct.error) as error:
            raise AssertionError(f'{name}: {str(error) or "artifact invariant failed"}') from error
    return summaries


def check_case(manifest, receipt):
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
        assert extracted_tests(report) == facts['tests'], 'complete reporter test/results structure mismatch'
        sources = receipt['sourcesByCase'][name]
        for source in sources.values():
            data = source['output'].encode('utf-8')
            assert len(data) == source['bytes'] and hashlib.sha256(data).hexdigest() == source['sha256'], 'source snapshot mismatch'
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
        success = 'browser-success-' in name
        debug = name.endswith('launch-debug')
        failure = 'failure-' in name
        assert len(results) == (2 if success else 4 if browser else 12 if failure else 8)
        assert len(attachments) == (4 if success else 0 if browser else 12 if failure else 8)
        assert len(stdout) == (2 if success else 0 if browser else 10 if failure else 6)
        assert len(stderr) == (10 if debug else 0 if browser else 2)
        assert len(paths) == (2 if success else 0 if browser else 6 if failure else 2)
        screenshots = []
        for test in facts['tests']:
            assert test['project'] in (('chromium-desktop', 'chromium-small') if browser else ('api-a', 'api-b')), 'unknown project'
            for result in test['results']:
                required = {'workerIndex', 'parallelIndex', 'status', 'duration', 'errors', 'stdout', 'stderr',
                            'retry', 'startTime', 'annotations', 'attachments'}
                assert required <= result.keys(), 'partial reporter result'
                if result['status'] == 'failed':
                    assert 'error' in result and result['errors'], 'partial failed reporter result'
                if not browser:
                    expected = source_attachment_bytes(sources, test['project'], result['retry'])
                    titles = {'pass with stdout stderr and attachments 雪': ['path-evidence', 'body-evidence'],
                              'flaky first attempt': ['retry-evidence'], 'skip with reason': [],
                              'permanent failure with retry': ['failure-path']}
                    assert [item['name'] for item in result['attachments']] == titles[test['title']], 'attachment names/order mismatch'
                    for item in result['attachments']:
                        assert item['contentType'] == 'text/plain', 'attachment contentType mismatch'
                        if 'body' in item:
                            assert 'path' not in item, 'ambiguous body/path attachment'
                            actual = base64.b64decode(item['body'], validate=True)
                        else:
                            relative = item['path'].split('/test-results/', 1)[1]
                            actual = base64.b64decode(files[relative]['base64'], validate=True)
                        assert actual == expected[item['name']], f"{item['name']} bytes differ from source/project/retry"
            if 'flaky' in test['title']:
                assert [result['retry'] for result in test['results']] == [0, 1]
                assert [result['status'] for result in test['results']] == ['failed', 'passed']
            if 'skip' in test['title']:
                assert any(annotation['type'] == 'skip' and annotation['description'] == 'R04 deliberate skip reason 雪'
                           for annotation in test['annotations'])
            if (browser and not success) or 'permanent failure' in test['title']:
                assert [result['status'] for result in test['results']] == ['failed', 'failed']
            if success:
                assert case['termination']['code'] == 0
                assert [(result['status'], result['retry']) for result in test['results']] == [('passed', 0)]
                items = test['results'][0]['attachments']
                assert [(item['name'], item['contentType']) for item in items] == [
                    ('browser-proof', 'application/json'), ('browser-screenshot', 'image/png')], 'browser attachment names/types/order mismatch'
                proof = json.loads(base64.b64decode(next(item['body'] for item in items if item['name'] == 'browser-proof')))
                viewport = (800, 600) if test['project'] == 'chromium-desktop' else (320, 480)
                assert proof == {'project': test['project'], 'browser': '141.0.7390.37',
                                 'executable': receipt['binary']['path'], 'binarySha256': receipt['binary']['sha256'],
                                 'viewport': {'width': viewport[0], 'height': viewport[1]}, 'title': 'R04 isolated'}, 'complete browser proof mismatch'
                item = next(item for item in items if item['name'] == 'browser-screenshot')
                file = files[item['path'].split('/test-results/', 1)[1]]
                png = base64.b64decode(file['base64'])
                assert png[:8] == b'\x89PNG\r\n\x1a\n' and png[12:16] == b'IHDR'
                assert struct.unpack('>II', png[16:24]) == viewport, 'screenshot dimensions differ from project viewport'
                screenshots.append({'project': test['project'], 'dimensions': viewport, 'bytes': file['bytes'], 'sha256': file['sha256']})
        if debug:
            profiles = re.findall(r'--user-data-dir=([^\s]+)', case['output'])
            assert len(profiles) == 2 and len(set(profiles)) == 2
            assert all(path.startswith(receipt['root'] + '/tmp/playwright_chromiumdev_profile-') for path in profiles)
            assert case['output'].count('<launching> ' + receipt['binary']['path']) == 2
            assert case['output'].count('finished temporary directories cleanup') == 2
        if 'custom-collision' in name:
            assert 'Running 2 tests using 1 worker\n' in case['output'] and '  2 passed (1ms)\n' in case['output']
            assert facts['stats']['flaky'] == 2 and facts['stats']['skipped'] == 2
        summaries[name] = {'bytes': len(raw), 'exit': case['termination']['code'], 'stats': facts['stats'],
                           'attemptsIncludingSkips': len(results), 'attachments': len(attachments),
                           'pathAttachments': paths, 'stdoutChunks': len(stdout), 'stderrChunks': len(stderr),
                           'resultFiles': sorted(files), 'screenshots': screenshots}
    return summaries


def load_inputs(historical_path, recovery_path):
    manifest = json.loads((ROOT / 'cases.json').read_text())
    receipt = json.loads(historical_path.read_text())
    recovery = json.loads(recovery_path.read_text())
    receipt['sourcesByCase'] = {name: receipt['sources'] for name in receipt['evidence']}
    receipt['sourcesByCase'].update({name: recovery['sources'] for name in recovery['evidence']})
    receipt['evidence'].update(recovery['evidence'])
    receipt['artifacts'].update(recovery['artifacts'])
    receipt['binary'], receipt['root'] = recovery['binary'], recovery['root']
    return manifest, receipt, recovery


def probe(manifest, receipt, label):
    mutant_manifest, mutant = copy.deepcopy(manifest), copy.deepcopy(receipt)
    name = 'R04-browser-success-list' if label in ('missing-screenshot-artifact', 'screenshot-size') else 'R04-api-list'
    tests = mutant['evidence'][name]['tests']
    items = [item for test in tests for result in test['results'] for item in result['attachments']]
    if label == 'raw-byte-loss':
        mutant_manifest['cases'][0]['output'] = mutant_manifest['cases'][0]['output'][:-1]
    elif label in ('missing-path-artifact', 'missing-screenshot-artifact', 'path-content', 'screenshot-size'):
        attachment = next(item for item in items if 'path' in item)
        files = mutant['artifacts'][name]['test-results']
        relative = attachment['path'].split('/test-results/', 1)[1]
        if label.startswith('missing-'):
            del files[relative]
        else:
            data = base64.b64decode(files[relative]['base64'])
            data = data[:16] + struct.pack('>I', 799) + data[20:] if label == 'screenshot-size' else b'CORRUPTED'
            files[relative] = {'base64': base64.b64encode(data).decode(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    elif label == 'retry-evidence-loss':
        next(test for test in tests if 'flaky' in test['title'])['results'].pop()
    elif label in ('partial-result', 'partial-report-result'):
        del tests[0]['results'][0]['workerIndex']
    elif label == 'retry-body-changed':
        item = next(item for item in items if item['name'] == 'retry-evidence')
        item['body'] = base64.b64encode(b'attempt=99\n').decode()
    else:
        item = next(item for item in items if item['name'] == 'body-evidence')
        if label == 'body-loss':
            del item['body']
        else:
            item['body'] = base64.b64encode(b'CORRUPTED').decode()
    if label in ('report-body-changed', 'partial-report-result', 'retry-body-changed'):
        sidecar = mutant['artifacts'][name]['report.json']
        report = json.loads(sidecar['output'])
        for raw_test, test in zip(extracted_tests(report), tests, strict=True):
            for raw_result, result in zip(raw_test['results'], test['results'], strict=True):
                raw_result.clear()
                raw_result.update(copy.deepcopy(result))
        sidecar['output'] = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
        sidecar['sha256'] = hashlib.sha256(sidecar['output'].encode()).hexdigest()
    try:
        check(mutant_manifest, mutant)
    except AssertionError as error:
        assert str(error).startswith(name + ':'), 'probe rejected without expected case name'
        return {'mutation': label, 'case': name, 'rejected': True, 'failure': str(error),
                'restoration': 'deep-copy only; committed artifacts never mutated'}
    raise AssertionError('Artifact inspection failed to detect ' + label)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--historical-receipt', type=Path, default=ROOT / 'capture-receipt.json')
    parser.add_argument('--recovery-receipt', type=Path, default=ROOT / 'browser-recovery-receipt.json')
    parser.add_argument('--verify-only', action='store_true', help='inspect inputs without writing an audit receipt')
    args = parser.parse_args()
    manifest, receipt, recovery = load_inputs(args.historical_receipt, args.recovery_receipt)
    summaries = check(manifest, receipt)
    # Validate historical envelopes after named-case inspection, before reporting success.
    for path, field in [(args.historical_receipt, 'historicalReceiptSha256'), (ROOT / 'setup-receipt.json', 'historicalSetupSha256')]:
        assert hashlib.sha256(path.read_bytes()).hexdigest() == recovery[field], 'historical receipt envelope mismatch'
    historical = dict(manifest, cases=[case for case in manifest['cases'] if not case['name'].startswith('R04-browser-success-')])
    assert hashlib.sha256((json.dumps(historical, ensure_ascii=False, indent=2) + '\n').encode()).hexdigest() == recovery['historicalManifestSha256']
    assert hashlib.sha256((ROOT / 'browser-recovery.py').read_bytes()).hexdigest() == recovery['recipeSha256']
    assert hashlib.sha256((ROOT / 'capture.py').read_bytes()).hexdigest() == receipt['recipeSha256']
    labels = ('raw-byte-loss', 'missing-path-artifact', 'retry-evidence-loss', 'missing-screenshot-artifact',
              'body-loss', 'body-changed', 'report-body-changed', 'path-content', 'screenshot-size',
              'partial-result', 'partial-report-result', 'retry-body-changed')
    probes = [] if args.verify_only else [probe(manifest, receipt, label) for label in labels]
    check(manifest, receipt)
    if not args.verify_only:
        inputs = ['cases.json', 'capture-receipt.json', 'browser-recovery-receipt.json', 'setup-receipt.json']
        audit = {'scope': 'read-time offline capture artifacts only; no native replay/runtime verification',
                 'auditAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                 'auditRecipeSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                 'inputSha256': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in inputs},
                 'predecessor': {'commit': '740cffb77449c5b4be1543b1af3d7e8e84aeac77', 'path': 'fixtures/profiles/playwright/audit.py',
                                 'auditRecipeSha256': 'baf4eed88bc50c9498022fd167a20e7e38272ddb9eb52c6278ae99a6510f7896',
                                 'auditReceiptSha256': '02b5126814041821a5e38c1e803e3a300d288a46690ca43b7cde593cb98836bf',
                                 'limitation': 'nonempty CORRUPTED API body was accepted; current inspection repairs that blind spot'},
                 'cases': summaries, 'probes': probes}
        (ROOT / 'audit-receipt.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n')
    for name, summary in summaries.items():
        print(name, {key: summary[key] for key in ('bytes', 'exit', 'attemptsIncludingSkips', 'attachments', 'stdoutChunks', 'stderrChunks')})
    print('Read-time inspection complete:', len(summaries), 'cases; rejected probes:', [item['mutation'] for item in probes])


if __name__ == '__main__':
    main()
