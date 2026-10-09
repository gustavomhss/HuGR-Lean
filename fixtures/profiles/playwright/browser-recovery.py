"""Append real Chromium evidence; preserve historical capture/setup receipts.

python3 fixtures/profiles/playwright/browser-recovery.py
Fresh private scratch project, exact preserved npm lock, official headless shell.
"""
import datetime
import json
import os
from pathlib import Path
import platform
import shlex
import shutil
import signal
import subprocess
import sys
import tempfile

from capture import BASE, DEST, SCRATCH, SOURCES, VERSION, sha, snapshot


def main():
    original = json.loads((DEST / 'capture-receipt.json').read_text())
    manifest_bytes = (DEST / 'cases.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    assert not any(case['name'].startswith('R04-browser-success-') for case in manifest['cases'])
    resume = len(sys.argv) == 3 and sys.argv[1] == '--resume'
    root = Path(sys.argv[2]) if resume else Path(tempfile.mkdtemp(prefix='R04-playwright-recovery-', dir=SCRATCH))
    assert root.parent == SCRATCH and root.name.startswith('R04-playwright-recovery-')
    if resume:
        (DEST / 'browser-recovery-initial-failure.json').write_text(json.dumps({
            'report': (root / 'report.json').read_text(), 'artifacts': snapshot(root / 'test-results'),
            'scope': 'First browser attempt exited 1 after native 45-second suite/teardown timeout; not browser coverage'}, indent=2) + '\n')
    sources = dict(SOURCES)
    sources['playwright.config.cjs'] = sources['playwright.config.cjs'].replace(
        "  outputDir: './test-results', reporter: 'list',",
        "  outputDir: './test-results', reporter: 'list',\n  use: { launchOptions: { executablePath: process.env.R04_BROWSER_EXECUTABLE } },")
    sources['playwright.config.cjs'] = sources['playwright.config.cjs'].replace('timeout: 10000', 'timeout: 45000')
    sources['tests/browser.spec.cjs'] = sources['tests/browser.spec.cjs'].replace(
        "  const artifact = info.outputPath('page.png');",
        "  await info.attach('browser-proof', { body: Buffer.from(JSON.stringify({ project: info.project.name, browser: browser.version(), executable: process.env.R04_BROWSER_EXECUTABLE, binarySha256: process.env.R04_BINARY_SHA256, viewport: page.viewportSize(), title: await page.title() })), contentType: 'application/json' });\n  const artifact = info.outputPath('page.png');")
    for name, text in sources.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding='utf-8')
    lock = json.dumps(original['packageLock'], indent=2) + '\n'
    (root / 'package-lock.json').write_text(lock)
    for name in ('home', 'tmp', 'npm-cache', 'browsers'):
        (root / name).mkdir(exist_ok=True)
    node, npm = shutil.which('node'), shutil.which('npm')
    assert node and npm
    env = {'PATH': os.environ['PATH'], 'HOME': str(root / 'home'), 'TMPDIR': str(root / 'tmp'),
           'LANG': 'en_US.UTF-8', 'LC_ALL': 'en_US.UTF-8', 'TERM': 'dumb', 'NO_COLOR': '1', 'CI': '1',
           'npm_config_cache': str(root / 'npm-cache'), 'npm_config_userconfig': '/dev/null',
           'npm_config_registry': 'https://registry.npmjs.org',
           'PLAYWRIGHT_BROWSERS_PATH': str(root / 'browsers'), 'PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT': '30000'}
    setup = json.loads((DEST / 'browser-recovery-operations.json').read_text()) if resume else []

    def run(argv, extra=None, timeout=90):
        process = subprocess.Popen(argv, cwd=root, env=dict(env, **(extra or {})), stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, start_new_session=True)
        timed_out = False
        try:
            raw, _ = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(process.pid, signal.SIGKILL)
            raw, _ = process.communicate()
        fact = {'argv': argv, 'command': shlex.join(argv), 'cwd': str(root),
                'output': raw.decode('utf-8'), 'bytes': len(raw), 'sha256': sha(raw),
                'termination': {'kind': 'timed_out'} if timed_out else {'kind': 'exited', 'code': process.returncode},
                'environmentDelta': extra or {}, 'timeoutSeconds': timeout,
                'eof': {'readThroughEOF': True, 'finalLF': raw.endswith(b'\n'), 'lastBytesHex': raw[-16:].hex()},
                'completionAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        # Preserve failures before any assertion, independently of the native manifest.
        setup.append(fact)
        (DEST / 'browser-recovery-operations.json').write_text(json.dumps(setup, ensure_ascii=False, indent=2) + '\n')
        assert not timed_out, fact
        return fact

    install = setup[0] if resume else run([npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], timeout=120)
    assert install['termination']['code'] == 0, install
    assert json.loads((root / 'package-lock.json').read_text()) == original['packageLock']
    for package in ('@playwright/test', 'playwright', 'playwright-core'):
        assert json.loads((root / 'node_modules' / package / 'package.json').read_text())['version'] == VERSION
    cli = str(root / 'node_modules/@playwright/test/cli.js')
    version = run([node, cli, '--version'])
    assert version['output'] == 'Version 1.56.1\n'
    registry = json.loads((root / 'node_modules/playwright-core/browsers.json').read_text())
    assert registry == original['browserRegistry']
    pin = next(browser for browser in registry['browsers'] if browser['name'] == 'chromium-headless-shell')
    assert pin['revision'] == '1194' and pin['browserVersion'] == '141.0.7390.37'
    download = setup[2] if resume else run([node, cli, 'install', '--only-shell', 'chromium'], timeout=240)
    assert download['termination']['code'] == 0, download
    binaries = list((root / 'browsers' / 'chromium_headless_shell-1194').rglob('headless_shell'))
    assert len(binaries) == 1
    binary = binaries[0].resolve()
    assert binary.is_file() and binary.is_relative_to((root / 'browsers').resolve())
    binary_hash = sha(binary.read_bytes())
    binary_version = run([str(binary), '--version'], timeout=120)
    assert binary_version['termination']['code'] == 0 and pin['browserVersion'] in binary_version['output']
    env.update(R04_BROWSER_EXECUTABLE=str(binary), R04_BINARY_SHA256=binary_hash)
    records, evidence, artifacts = [], {}, {}
    for suffix, reporter, debug in [('list', 'list,json', False), ('line', 'line,json', False),
                                     ('json', 'json', False), ('launch-debug', 'list,json', True)]:
        report = root / 'report.json'
        if report.exists():
            report.unlink()
        extra = {'PLAYWRIGHT_JSON_OUTPUT_NAME': str(report)} if reporter != 'json' else {}
        if debug:
            extra['DEBUG'] = 'pw:browser'
        fact = run([node, cli, 'test', '--global-timeout=120000', '--reporter=' + reporter,
                    '--project=chromium-desktop', '--project=chromium-small'], extra, timeout=180)
        assert fact['termination']['code'] == 0, fact
        data = json.loads(report.read_text() if report.exists() else fact['output'])
        assert {key: data['stats'][key] for key in ('expected', 'unexpected', 'flaky', 'skipped')} == {
            'expected': 2, 'unexpected': 0, 'flaky': 0, 'skipped': 0}
        tests = []

        def collect(suites):
            for suite in suites:
                collect(suite.get('suites', []))
                for spec in suite.get('specs', []):
                    for test in spec['tests']:
                        tests.append(dict(title=spec['title'], project=test['projectName'], status=test['status'],
                                          annotations=test['annotations'], results=test['results']))

        collect(data['suites'])
        assert len(tests) == 2 and all(test['results'][0]['status'] == 'passed' for test in tests)
        name = 'R04-browser-success-' + suffix
        evidence[name] = {'stats': data['stats'], 'tests': tests}
        artifacts[name] = {'test-results': snapshot(root / 'test-results')}
        if report.exists():
            artifacts[name]['report.json'] = {'output': report.read_text(), 'sha256': sha(report.read_bytes())}
        raw = fact['output']
        records.append(dict(fact, name=name, family='playwright', version='Playwright ' + VERSION,
                            platform=platform.platform(), status='passthrough', source='shell',
                            completeness='complete', presentation='unknown', inputBytes=fact['bytes'], outputBytes=fact['bytes'],
                            disposition='pending lead policy; zero approved removable bytes',
                            provenance={'sha256': fact['sha256'], 'record': 'browser-recovery-receipt.json', 'originalCase': name},
                            boundary='stdout pipe; stderr redirected into same pipe before exec; EOF then wait; no PTY/truncation/normalization'))
        print(name, 'exit 0', 'bytes', fact['bytes'], '2 passed; 2 screenshots; 2 proof bodies', flush=True)
    receipt = {'baseline': BASE, 'root': str(root), 'platform': platform.platform(), 'environment': env,
               'recipeSha256': sha(Path(__file__).read_bytes()), 'historicalManifestSha256': sha(manifest_bytes),
               'historicalReceiptSha256': sha((DEST / 'capture-receipt.json').read_bytes()),
               'historicalSetupSha256': sha((DEST / 'setup-receipt.json').read_bytes()),
               'packageLock': original['packageLock'], 'browserRegistry': registry, 'browserDownload': download,
               'binary': {'path': str(binary), 'bytes': binary.stat().st_size, 'sha256': binary_hash, **pin},
               'binaryVersion': binary_version,
               'browserFiles': {str(path.relative_to(root / 'browsers')): {'bytes': path.stat().st_size, 'sha256': sha(path.read_bytes())}
                                for path in (root / 'browsers').rglob('*') if path.is_file() and path.name in ('headless_shell', 'ffmpeg', 'INSTALLATION_COMPLETE', 'DEPENDENCIES_VALIDATED')},
               'sources': {name: {'output': text, 'bytes': len(text.encode()), 'sha256': sha(text.encode())} for name, text in sources.items()},
               'sourceOrigin': 'Original R04 fixtures plus explicit private executable launch and proof attachment; no donor copied',
               'browserExecuted': True, 'crossEngineCoverage': False, 'approvedRemovableBytes': 0,
               'evidence': evidence, 'artifacts': artifacts}
    (DEST / 'browser-recovery-receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    manifest['cases'].extend(records)
    (DEST / 'cases.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
