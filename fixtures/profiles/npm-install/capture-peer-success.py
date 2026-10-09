"""P01 supplement: original MIT graph, loopback-only registry, real npm pipe capture.

Run from the worktree with npm 10.9.2 and Node 22.17.1 on PATH. Native artifacts
are written to peer-success/; cases.json enrollment is a separate reviewed edit.
"""
import base64
import hashlib
import http.server
import io
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tarfile
import tempfile
import threading
from datetime import datetime, timezone

HERE = Path(__file__).resolve().parent
OUT = HERE / "peer-success"
assert not OUT.exists(), "Refuse to overwrite a previous capture"
ROOT = Path(tempfile.mkdtemp(prefix="p01-peer-success-", dir="/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode"))
OUT.mkdir()
for part in ("home", "cache", "project"):
    (ROOT / part).mkdir()
(ROOT / "global.npmrc").write_text("")
env = {"PATH": os.environ["PATH"], "HOME": str(ROOT / "home"),
       "NPM_CONFIG_CACHE": str(ROOT / "cache"), "NPM_CONFIG_USERCONFIG": "/dev/null",
       "NPM_CONFIG_GLOBALCONFIG": str(ROOT / "global.npmrc"),
       "NPM_CONFIG_UPDATE_NOTIFIER": "false", "NPM_CONFIG_FETCH_RETRIES": "0",
       "NPM_CONFIG_FETCH_TIMEOUT": "10000", "NO_COLOR": "1"}
sha = lambda data: hashlib.sha256(data).hexdigest()
def write_json(name, data):
    (OUT / name).write_text(json.dumps(data, indent=2) + "\n")
def tool(args):
    p = subprocess.run(args, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=10)
    return {"argv": args, "exit": p.returncode, "output": p.stdout.decode(), "sha256": sha(p.stdout)}
versions = [tool(["node", "--version"]), tool(["npm", "--version"])]
assert [v["output"].strip() for v in versions] == ["v22.17.1", "10.9.2"]
license_text = """MIT License

Copyright (c) 2026 HuGR-Lean capture contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""
(OUT / "LICENSE.md").write_text(license_text)
graphs = [("p01-peer-host", "1.0.0", {}), ("p01-peer-host", "2.0.0", {}),
          ("p01-peer-consumer", "1.0.0", {"peerDependencies": {"p01-peer-host": ">=2"}})]
packages, tarballs, requests = {}, {}, []
for name, version, extra in graphs:
    manifest = {"name": name, "version": version, "license": "MIT", **extra}
    filename = f"{name}-{version}.tgz"
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for path, data in [("package/package.json", (json.dumps(manifest) + "\n").encode()),
                           ("package/LICENSE", license_text.encode())]:
            info = tarfile.TarInfo(path)
            info.size, info.mtime, info.mode = len(data), 0, 0o644
            archive.addfile(info, io.BytesIO(data))
    data = buffer.getvalue()
    (OUT / filename).write_bytes(data)
    tarballs["/" + filename] = data
    packages.setdefault(name, {})[version] = {**manifest, "dist": {
        "integrity": "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode(),
        "shasum": hashlib.sha1(data).hexdigest(), "tarball": filename}}

class Registry(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def do_GET(self):
        name = self.path.lstrip("/")
        if name in packages:
            body = json.dumps({"name": name, "dist-tags": {"latest": max(packages[name])},
                               "versions": packages[name]}).encode()
            kind = "application/json"
        elif self.path in tarballs:
            body, kind = tarballs[self.path], "application/octet-stream"
        else:
            requests.append({"method": "GET", "path": self.path, "status": 404})
            self.send_error(404)
            return
        requests.append({"method": "GET", "path": self.path, "status": 200, "sha256": sha(body)})
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Registry)
registry = f"http://127.0.0.1:{server.server_port}/"
for versions_by_name in packages.values():
    for metadata in versions_by_name.values():
        metadata["dist"]["tarball"] = registry + metadata["dist"]["tarball"]
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
root_manifest = {"name": "p01-peer-success-root", "version": "1.0.0", "private": True,
                 "license": "MIT", "dependencies": {"p01-peer-host": "1.0.0", "p01-peer-consumer": "1.0.0"}}
manifest_bytes = (json.dumps(root_manifest, indent=2) + "\n").encode()
(ROOT / "project/package.json").write_bytes(manifest_bytes)
(OUT / "package.json").write_bytes(manifest_bytes)
argv = ["npm", "install", "--force", "--ignore-scripts", "--registry", registry, "--no-audit", "--no-fund"]
try:
    p = subprocess.run(argv, cwd=ROOT / "project", env=env, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, timeout=40)
finally:
    server.shutdown()
    server.server_close()
    thread.join()
(OUT / "input.txt").write_bytes(p.stdout)
boundary = {"bytes": len(p.stdout), "sha256": sha(p.stdout), "readThroughEOF": True,
            "finalLF": p.stdout.endswith(b"\n"), "lastBytesHex": p.stdout[-64:].hex(),
            "collector": "subprocess.run; stderr=STDOUT at spawn; shared OS pipe drained before return"}
record = {"date": datetime.now(timezone.utc).isoformat(), "argv": argv,
          "executable": shutil.which("npm"), "cwd": str(ROOT / "project"),
          "captureRoot": str(ROOT), "environment": env, "versions": versions,
          "platform": platform.platform(), "termination": {"kind": "exited", "code": p.returncode},
          "boundary": boundary, "registry": registry, "requests": requests,
          "producer": {"file": "capture-peer-success.py", "sha256": sha(Path(__file__).read_bytes())}}
write_json("collector.json", record)
write_json("registry.json", packages)
# Preserve failed attempts too; never enroll them as successful captures.
assert p.returncode == 0 and b"npm warn ERESOLVE overriding peer dependency" in p.stdout
lock_bytes = (ROOT / "project/package-lock.json").read_bytes()
(OUT / "package-lock.json").write_bytes(lock_bytes)
installed = {}
for name in packages:
    data = (ROOT / "project/node_modules" / name / "package.json").read_bytes()
    installed[name] = {"manifest": json.loads(data), "sha256": sha(data)}
assert installed["p01-peer-host"]["manifest"]["version"] == "1.0.0"
write_json("installed.json", installed)
write_json("receipt.json", {"cases": [{"name": "P01/peer-override-success", "command": argv,
    "termination": record["termination"], "completeness": "complete", "presentation": "unknown",
    "version": "npm 10.9.2; Node v22.17.1", "boundary": boundary,
    "originalCollector": {"file": "peer-success/collector.json", "sha256": sha((OUT / "collector.json").read_bytes())},
    "lock": {"file": "peer-success/package-lock.json", "sha256": sha(lock_bytes)},
    "installed": {"file": "peer-success/installed.json", "sha256": sha((OUT / "installed.json").read_bytes())}}]})
print(json.dumps({"root": str(ROOT), "argv": argv, "exit": p.returncode, "boundary": boundary,
                  "platform": record["platform"], "output": p.stdout.decode()}, indent=2))
