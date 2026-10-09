"""Original MIT capture: loopback registry serves only the owned tiny tarball."""
import base64
import hashlib
import http.server
import io
import json
import os
import pathlib
import platform
import shlex
import shutil
import subprocess
import tarfile
import tempfile
import threading

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / 'visible'
OUT.mkdir(exist_ok=False)
ROOT = pathlib.Path(tempfile.mkdtemp(prefix='p04-supplement-', dir=HERE.parents[4]))
BUN = shutil.which('bun')
NODE = shutil.which('node')
NAME = 'p04-trusted-witness'
requests = []

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def save(name, raw):
    (OUT / name).write_bytes(raw)
    return dict(file='supplement/visible/' + name, bytes=len(raw), sha256=digest(raw))

def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()

archive = io.BytesIO()
with tarfile.open(fileobj=archive, mode='w:gz') as tar:
    for source in sorted((HERE / 'dep').iterdir()):
        tar.add(source, arcname='package/' + source.name)
packed = archive.getvalue()
package = json.loads((HERE / 'dep/package.json').read_text())

class Registry(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/' + NAME:
            info = dict(package, hasInstallScript=True, dist=dict(tarball=url + '/witness.tgz',
                integrity='sha512-' + base64.b64encode(hashlib.sha512(packed).digest()).decode(),
                shasum=hashlib.sha1(packed).hexdigest()))
            raw = json_bytes(dict(name=NAME, versions={'1.0.0': info},
                                  **{'dist-tags': {'latest': '1.0.0'}}))
        elif self.path == '/witness.tgz':
            raw = packed
        else:
            self.send_error(404)
            requests.append(dict(path=self.path, status=404))
            return
        requests.append(dict(path=self.path, status=200, bytes=len(raw), sha256=digest(raw)))
        self.send_response(200)
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, *_):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Registry)
url = 'http://127.0.0.1:' + str(server.server_port)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
env = dict(PATH=str(pathlib.Path(NODE).parent) + ':' + str(pathlib.Path(BUN).parent) + ':/usr/bin:/bin',
           HOME=str(ROOT / 'home'), XDG_CONFIG_HOME=str(ROOT / 'home/config'),
           TMPDIR=str(ROOT))
(ROOT / 'home/config').mkdir(parents=True)
tools = []
for binary, flags in [(BUN, ['--version']), (BUN, ['--revision']), (NODE, ['--version'])]:
    result = subprocess.run([binary, *flags], env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=10, check=True)
    tools.append(dict(argv=[binary, *flags], output=result.stdout.decode(), exit=0,
                      executableSHA256=digest(pathlib.Path(binary).read_bytes())))
assert tools[0]['output'] == '1.3.14\n'
assert tools[1]['output'] == '1.3.14+0d9b296af\n'
cases = []
receipt = dict(root=str(ROOT), registry=url, tools=tools, tarball=save('witness.tgz', packed),
    sources=[dict(file='supplement/dep/' + p.name, bytes=p.stat().st_size, sha256=digest(p.read_bytes()))
             for p in sorted((HERE / 'dep').iterdir())], cases=cases)
try:
    for suffix, trust, flags in [('registry-blocked-default', False, []),
            ('registry-trusted-manifest', True, ['--verbose']),
            ('registry-trusted-flag', False, [NAME, '--trust', '--verbose']),
            ('registry-offline-request', False, ['--offline', '--ignore-scripts'])]:
        project = ROOT / suffix
        project.mkdir()
        manifest = dict(name='p04-private-project', version='1.0.0', private=True,
                        dependencies={NAME: '1.0.0'})
        if trust:
            manifest['trustedDependencies'] = [NAME]
        (project / 'package.json').write_bytes(json_bytes(manifest))
        before = save(suffix + '.before.json', (project / 'package.json').read_bytes())
        marker = project / 'postinstall.marker'
        assert not marker.exists() and not (project / 'bun.lock').exists()
        argv = ['bun', 'install', *flags, '--cache-dir', str(project / 'cache'), '--registry', url]
        start = len(requests)
        result = subprocess.run(argv, cwd=project, env=dict(env, PRIVATEPROJECT=str(project)),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=60)
        raw = result.stdout
        output = save(suffix + '.txt', raw)
        lock = save(suffix + '.lock', (project / 'bun.lock').read_bytes()) if (project / 'bun.lock').exists() else None
        installed = project / 'node_modules' / NAME
        installed_sources = []
        if installed.is_dir():
            for source in sorted((HERE / 'dep').iterdir()):
                actual = installed / source.name
                installed_sources.append(dict(file=source.name, sha256=digest(actual.read_bytes()),
                                              regular=actual.is_file(), symlink=actual.is_symlink()))
        case = dict(name='P04/' + suffix, family='bun-install', command=shlex.join(argv),
            file=output['file'], status='passthrough', termination=dict(kind='exited', code=result.returncode),
            completeness='complete', presentation='unknown', version='bun 1.3.14', platform=platform.platform(),
            provenance=dict(receipt='supplement/visible/receipt.json', case='P04/' + suffix, sha256=output['sha256']))
        fact = dict(case, cwd=str(project), argv=argv, environment=dict(env, PRIVATEPROJECT=str(project)),
            boundary=dict(bytes=len(raw), sha256=digest(raw), readThroughEOF=True,
                          finalLF=raw.endswith(b'\n'), lastBytesHex=raw[-32:].hex(),
                          capture='merged stdout/stderr OS pipe; subprocess exit observed; no PTY'),
            manifestBefore=before, manifestAfter=save(suffix + '.after.json', (project / 'package.json').read_bytes()),
            lock=lock, requests=requests[start:].copy(), installedSources=installed_sources,
            dependencyRealpath=str(installed.resolve()), dependencySymlink=installed.is_symlink(),
            markerBefore=False, markerAfter=marker.exists(),
            marker=save(suffix + '.marker', marker.read_bytes()) if marker.exists() else None)
        cases.append(fact)
        save('receipt.json', json_bytes(receipt))
        print(json.dumps(case, separators=(',', ':')))
finally:
    server.shutdown()
    server.server_close()
    thread.join()
    save('receipt.json', json_bytes(receipt))
