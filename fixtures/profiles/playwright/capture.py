"""R04 fixture-only recipe: python3 capture.py. No host browser/profile or repo deps.

Installs exact npm pins into a fresh scratch project; downloads only official
Chromium headless shell into its private cache (180-second bounded subprocess).
Artifacts generated beside this script; subprocess output remains byte-exact.
"""
import base64
import datetime
import hashlib
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

DEST = Path(__file__).resolve().parent
SCRATCH = Path('/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode')
VERSION = '1.56.1'
BASE = '248c303'
SOURCES = {
    'package.json': json.dumps({'private': True, 'dependencies': {'@playwright/test': VERSION}}, indent=2) + '\n',
    'playwright.config.cjs': """const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', workers: 1, retries: 1, timeout: 10000,
  outputDir: './test-results', reporter: 'list',
  projects: [
    { name: 'api-a', testMatch: 'api.spec.cjs' },
    { name: 'api-b', testMatch: 'api.spec.cjs' },
    { name: 'chromium-desktop', testMatch: 'browser.spec.cjs', use: { browserName: 'chromium', viewport: { width: 800, height: 600 } } },
    { name: 'chromium-small', testMatch: 'browser.spec.cjs', use: { browserName: 'chromium', viewport: { width: 320, height: 480 } } }
  ]
});
""",
    'tests/api.spec.cjs': """const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
test('pass with stdout stderr and attachments 雪', async ({}, info) => {
  console.log(`R04 stdout ${info.project.name} retry=${info.retry} café 雪😀`);
  console.error(`R04 stderr ${info.project.name} retry=${info.retry}`);
  const artifact = info.outputPath('evidence.log');
  fs.writeFileSync(artifact, `R04 path attachment ${info.project.name} 雪\\n`);
  await info.attach('path-evidence', { path: artifact, contentType: 'text/plain' });
  await info.attach('body-evidence', { body: Buffer.from('R04 body café 雪😀\\n'), contentType: 'text/plain' });
  expect(2 + 2).toBe(4);
});
test('flaky first attempt', async ({}, info) => {
  console.log(`R04 flaky ${info.project.name} retry=${info.retry}`);
  await info.attach('retry-evidence', { body: Buffer.from(`attempt=${info.retry}\\n`), contentType: 'text/plain' });
  expect(info.retry, 'R04 first attempt must fail').toBe(1);
});
test('skip with reason', async () => {
  test.skip(true, 'R04 deliberate skip reason 雪');
});
if (process.env.R04_FAILURE === '1') {
  test('permanent failure with retry', async ({}, info) => {
    console.log(`R04 failure ${info.project.name} retry=${info.retry}`);
    const artifact = info.outputPath('failure.log');
    fs.writeFileSync(artifact, `failure attempt=${info.retry}\\n`);
    await info.attach('failure-path', { path: artifact, contentType: 'text/plain' });
    expect('R04 actual 雪').toBe('R04 expected 雪');
  });
}
""",
    'tests/browser.spec.cjs': """const { test, expect } = require('@playwright/test');
test('real isolated Chromium page and screenshot', async ({ page, browser }, info) => {
  await page.setContent('<title>R04 isolated</title><button>雪 browser</button>');
  await expect(page).toHaveTitle('R04 isolated');
  await expect(page.getByRole('button')).toHaveText('雪 browser');
  console.log(`R04 browser=${browser.version()} project=${info.project.name}`);
  const artifact = info.outputPath('page.png');
  await page.screenshot({ path: artifact });
  await info.attach('browser-screenshot', { path: artifact, contentType: 'image/png' });
});
""",
    'collision-reporter.cjs': """module.exports = class {
  onBegin() { console.log('Running 2 tests using 1 worker'); }
  onStdOut(chunk) { process.stdout.write(chunk); }
  onStdErr(chunk) { process.stderr.write(chunk); }
  onEnd() { console.log('  2 passed (1ms)'); }
};
""",
}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def snapshot(root):
    result = {}
    if root.exists():
        for path in sorted(root.rglob('*')):
            if path.is_file():
                raw = path.read_bytes()
                result[path.relative_to(root).as_posix()] = {
                    'bytes': len(raw), 'sha256': sha(raw), 'base64': base64.b64encode(raw).decode('ascii')}
    return result


def main():
    # Resume consumes the preserved setup receipt; never retries a failed download.
    resume = len(sys.argv) == 3 and sys.argv[1] == '--resume'
    root = Path(sys.argv[2]) if resume else Path(tempfile.mkdtemp(prefix='R04-playwright-', dir=SCRATCH))
    assert root.parent == SCRATCH and root.name.startswith('R04-playwright-')
    for name, text in SOURCES.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding='utf-8')
    for name in ('home', 'tmp', 'npm-cache', 'browsers'):
        (root / name).mkdir(exist_ok=True)
    node, npm = shutil.which('node'), shutil.which('npm')
    assert node and npm
    env = {'PATH': os.environ['PATH'], 'HOME': str(root / 'home'), 'TMPDIR': str(root / 'tmp'),
           'LANG': 'en_US.UTF-8', 'LC_ALL': 'en_US.UTF-8', 'TERM': 'dumb', 'NO_COLOR': '1',
           'CI': '1', 'npm_config_cache': str(root / 'npm-cache'), 'npm_config_userconfig': '/dev/null',
           'npm_config_registry': 'https://registry.npmjs.org', 'PLAYWRIGHT_BROWSERS_PATH': str(root / 'browsers'),
           'PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT': '30000'}
    operations = []

    def run(argv, extra=None, timeout=90):
        current = dict(env, **(extra or {}))
        proc = subprocess.Popen(argv, cwd=root, env=current, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, start_new_session=True)
        try:
            raw, _ = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            raw, _ = proc.communicate()
            (DEST / 'timeout-receipt.json').write_text(json.dumps({
                'argv': argv, 'cwd': str(root), 'termination': {'kind': 'timed_out'},
                'output': raw.decode('utf-8'), 'sha256': sha(raw), 'bytes': len(raw),
                'timeoutSeconds': timeout}, indent=2) + '\n')
            raise
        fact = {'argv': argv, 'command': shlex.join(argv), 'cwd': str(root),
                'termination': {'kind': 'exited', 'code': proc.returncode},
                'output': raw.decode('utf-8'), 'bytes': len(raw), 'sha256': sha(raw),
                'environmentDelta': extra or {}, 'timeoutSeconds': timeout,
                'eof': {'readThroughEOF': True, 'finalLF': raw.endswith(b'\n'), 'lastBytesHex': raw[-16:].hex()},
                'completionAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        return fact

    cli = str(root / 'node_modules/@playwright/test/cli.js')
    if resume:
        operations = json.loads((DEST / 'setup-receipt.json').read_text())
        assert all(operation['cwd'] == str(root) for operation in operations)
        download = operations[-1]
    else:
        install = run([npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact'], timeout=120)
        operations.append(install)
        assert install['termination']['code'] == 0, install
        version = run([node, cli, '--version'])
        assert version['output'] == f'Version {VERSION}\n', version
        operations.append(version)
        download = run([node, cli, 'install', '--only-shell', 'chromium'], timeout=180)
        operations.append(download)
        (DEST / 'setup-receipt.json').write_text(json.dumps(operations, indent=2) + '\n')
    browser_available = download['termination']['code'] == 0
    lock = (root / 'package-lock.json').read_text()
    packages = json.loads(lock)['packages']
    for name in ('@playwright/test', 'playwright', 'playwright-core'):
        assert packages['node_modules/' + name]['version'] == VERSION
    registry = json.loads((root / 'node_modules/playwright-core/browsers.json').read_text())
    specs = [
        ('api-list', 'list,json', False, False),
        ('api-line', 'line,json', False, False),
        ('api-json', 'json', False, False),
        ('failure-list', 'list,json', False, True),
        ('failure-line', 'line,json', False, True),
        ('failure-json', 'json', False, True),
        ('browser-list', 'list,json', True, False),
        ('browser-line', 'line,json', True, False),
        ('browser-json', 'json', True, False),
        ('custom-collision', './collision-reporter.cjs,json', False, False),
    ]
    records, artifacts, evidence = [], {}, {}
    for suffix, reporter, browser, failure in specs:
        report = root / 'report.json'
        if report.exists():
            report.unlink()
        extra = {'R04_FAILURE': '1' if failure else '0'}
        if reporter != 'json':
            extra['PLAYWRIGHT_JSON_OUTPUT_NAME'] = str(report)
        projects = ('chromium-desktop', 'chromium-small') if browser else ('api-a', 'api-b')
        argv = [node, cli, 'test', '--global-timeout=45000', '--reporter=' + reporter] + ['--project=' + name for name in projects]
        fact = run(argv, extra)
        assert fact['termination']['code'] == (1 if failure or (browser and not browser_available) else 0), fact
        data = json.loads(report.read_text() if report.exists() else fact['output'])
        attempts = []

        def collect(suites):
            for suite in suites:
                collect(suite.get('suites', []))
                for spec in suite.get('specs', []):
                    for test in spec['tests']:
                        attempts.append({'title': spec['title'], 'project': test['projectName'],
                                         'status': test['status'], 'annotations': test['annotations'],
                                         'results': test['results']})

        collect(data['suites'])
        expected = {'expected': 0 if browser and not browser_available else 2,
                    'unexpected': 2 if failure or (browser and not browser_available) else 0,
                    'flaky': 0 if browser else 2, 'skipped': 0 if browser else 2}
        for key, value in expected.items():
            assert data['stats'][key] == value, (suffix, key, data['stats'])
        name = 'R04-' + suffix
        evidence[name] = {'stats': data['stats'], 'tests': attempts}
        artifacts[name] = {'test-results': snapshot(root / 'test-results')}
        if report.exists():
            artifacts[name]['report.json'] = {'output': report.read_text(), 'sha256': sha(report.read_bytes())}
        raw = fact.pop('output')
        record = dict(fact, name=name, family='playwright', version='Playwright ' + VERSION,
                      platform=platform.platform(), output=raw, status='passthrough', source='shell',
                      completeness='complete', presentation='unknown', inputBytes=fact['bytes'], outputBytes=fact['bytes'],
                      disposition='pending lead review; not implemented',
                      provenance={'sha256': fact['sha256'], 'record': 'capture-receipt.json', 'originalCase': name},
                      boundary='stdout pipe; stderr redirected into same pipe before exec; EOF then wait; no PTY/truncation/normalization')
        records.append(record)
        print(name, 'exit', record['termination']['code'], 'bytes', record['inputBytes'], 'stats', expected, flush=True)
    browser_files = {str(path.relative_to(root / 'browsers')): {'bytes': path.stat().st_size, 'sha256': sha(path.read_bytes())}
                     for path in (root / 'browsers').rglob('*') if path.is_file() and path.name in ('headless_shell', 'ffmpeg', 'INSTALLATION_COMPLETE', 'DEPENDENCIES_VALIDATED')}
    licenses = {name: (root / 'node_modules' / name / 'LICENSE').read_text() for name in ('@playwright/test', 'playwright', 'playwright-core')}
    receipt = {'baseline': BASE, 'platform': platform.platform(), 'node': run([node, '--version'])['output'],
               'npm': run([npm, '--version'])['output'], 'root': str(root), 'environment': env,
               'sourceOrigin': 'Original R04 tiny fixtures; no donor source copied',
               'recipeSha256': sha(Path(__file__).read_bytes()), 'packageLock': json.loads(lock),
               'sources': {name: {'output': text, 'bytes': len(text.encode()), 'sha256': sha(text.encode())} for name, text in SOURCES.items()},
               'licenses': licenses, 'browserRegistry': registry, 'browserFiles': browser_files,
               'browserDownload': download, 'browserExecuted': browser_available,
               'browserBlocker': None if browser_available else 'Official isolated browser download failed; browser cases are launch-failure evidence, not browser execution coverage',
               'evidence': evidence, 'artifacts': artifacts}
    (DEST / 'capture-receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (DEST / 'cases.json').write_text(json.dumps({'schema': 'hugr-lean/native-cases/1', 'family': 'playwright',
                                               'baseline': BASE, 'cases': records}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
