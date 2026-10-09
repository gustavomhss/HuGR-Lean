"""Archive producer/version/license metadata without replaying native tests."""
import hashlib
import base64
import io
import json
from pathlib import Path
import subprocess
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parent
receipt = json.loads((ROOT / 'capture-receipt.json').read_text())
TOOLS = Path(receipt['temp']) / 'tools'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
package = json.loads((TOOLS / 'node_modules/jest/package.json').read_text())
receipt['tool']['gitHead'] = package['gitHead']
receipt['tool']['upstreamLicensePath'] = 'LICENSE'
argv = [str(TOOLS / 'node_modules/.bin/jest'), '--version']
run = subprocess.run(argv, cwd=TOOLS, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
(ROOT / 'version.log').write_bytes(run.stdout)
assert run.returncode == 0
receipt['tool']['cliVersion'] = {'argv': argv, 'cwd': str(TOOLS), 'exitCode': run.returncode,
                               'file': 'version.log', 'sha256': sha(run.stdout), 'value': run.stdout.decode().strip(),
                               'boundary': receipt['boundary'], 'readThroughEOF': True}
pins = []
def remote(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read()

registry_raw = remote('https://registry.npmjs.org/jest/30.2.0')
(ROOT / 'jest-registry.json').write_bytes(registry_raw)
registry = json.loads(registry_raw)
tar_raw = remote(registry['dist']['tarball'])
assert 'sha512-' + base64.b64encode(hashlib.sha512(tar_raw).digest()).decode() == registry['dist']['integrity']
verified_files = []
with tarfile.open(fileobj=io.BytesIO(tar_raw), mode='r:gz') as archive:
    for member in archive.getmembers():
        if member.isfile():
            stream = archive.extractfile(member)
            assert stream is not None
            data = stream.read()
            path = Path(member.name).relative_to('package')
            assert data == (TOOLS / 'node_modules/jest' / path).read_bytes(), f'Installed Jest differs: {path}'
            verified_files.append({'path': str(path), 'sha256': sha(data)})
receipt['tool']['registry'] = {'file': 'jest-registry.json', 'sha256': sha(registry_raw), 'dist': registry['dist'],
                             'installedPackageFilesVerified': verified_files,
                             'lockCaveat': 'Repair lock may omit registry integrity for already unpacked packages; Jest package independently verified against integrity-checked registry tarball'}

commit = '28ffdbc314596bdcb3007e85d30a62372602b262'
repo = 'https://github.com/istanbuljs/istanbuljs'
license_raw = (TOOLS / 'node_modules/istanbul-reports/LICENSE').read_bytes()
assert license_raw == remote(f'https://raw.githubusercontent.com/istanbuljs/istanbuljs/{commit}/packages/istanbul-reports/LICENSE')
(ROOT / 'LICENSE.istanbul-reports.txt').write_bytes(license_raw)
pins.append({'repository': repo, 'commit': commit, 'path': 'packages/istanbul-reports/LICENSE',
             'local': 'LICENSE.istanbul-reports.txt', 'license': 'BSD-3-Clause', 'modifications': 'none', 'sha256': sha(license_raw)})
for attachment in (ROOT / 'captures/coverage-snapshot/coverage/lcov-report').iterdir():
    if attachment.suffix == '.html':
        continue
    asset_path = 'lib/html/assets/' + ('vendor/' if attachment.name.startswith('prettify.') else '') + attachment.name
    package_path = TOOLS / 'node_modules/istanbul-reports' / asset_path
    source_raw = package_path.read_bytes()
    header = b'/* eslint-disable */\n' if attachment.suffix == '.js' else b''
    assert attachment.read_bytes() == header + source_raw, f'Native asset transform mismatch: {attachment.name}'
    upstream_path = 'packages/istanbul-reports/' + asset_path
    upstream_raw = remote(f'https://raw.githubusercontent.com/istanbuljs/istanbuljs/{commit}/{upstream_path}')
    assert upstream_raw == source_raw, f'Immutable source mismatch: {upstream_path}'
    locals_ = [str(p.relative_to(ROOT)) for p in ROOT.glob(f'captures/*/coverage/lcov-report/{attachment.name}')]
    pins.append({'repository': repo, 'commit': commit, 'path': upstream_path, 'locals': locals_,
                 'license': 'Apache-2.0 (Google Code Prettify)' if attachment.name.startswith('prettify.') else 'BSD-3-Clause',
                 'modifications': 'native reporter prepended /* eslint-disable */ plus LF' if header else 'none; native reporter copied identical asset',
                 'sourceSHA256': sha(upstream_raw), 'attachmentSHA256': sha(attachment.read_bytes())})
prettify_commit = 'e006587b4a893f0281e9dc9a53001c7ed584d4e7'
prettify_license = remote(f'https://raw.githubusercontent.com/googlearchive/code-prettify/{prettify_commit}/COPYING')
(ROOT / 'LICENSE.code-prettify.txt').write_bytes(prettify_license)
pins.append({'repository': 'https://github.com/googlearchive/code-prettify', 'commit': prettify_commit,
             'path': 'COPYING', 'local': 'LICENSE.code-prettify.txt', 'license': 'Apache-2.0',
             'modifications': 'none; license only, vendored asset source is pinned above', 'sha256': sha(prettify_license)})
pins.append({'repository': 'https://github.com/jestjs/jest', 'commit': package['gitHead'], 'path': 'LICENSE',
             'local': 'LICENSE.jest.txt', 'license': 'MIT', 'modifications': 'none',
             'sha256': sha((ROOT / 'LICENSE.jest.txt').read_bytes()),
             'packagePath': 'jest@30.2.0/LICENSE', 'packageIntegrity': registry['dist']['integrity']})
(ROOT / 'donor-pins.json').write_text(json.dumps(pins, indent=2) + '\n')
receipt['snapshotAttachments'] = [{'file': str(p.relative_to(ROOT)), 'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes())}
                                  for p in sorted((ROOT / 'attachments').rglob('*')) if p.is_file()]
receipt['sourceSizeMetrics'] = {'unit': 'UTF-8 bytes', 'authoredSourceBytes': sum(p['bytes'] for p in receipt['sources']),
                                'files': receipt['sources']}
(ROOT / 'capture-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'cliVersion': receipt['tool']['cliVersion'], 'donorPins': len(pins)}, indent=2))
