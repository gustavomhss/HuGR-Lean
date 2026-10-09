"""Replay tiny native captures; write raw files without rewriting captured bytes.

Install first: npm install --prefix <isolated-dir> --ignore-scripts --no-audit
--no-fund --save-exact pyright@1.1.408. Pass its node_modules/.bin/pyright.
Manifest inputs are file-only. Receipt metadata never duplicates raw input.
"""
import datetime
import hashlib
import json
import os
import pathlib
import platform
import shlex
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parent
executable = sys.argv[1]
version = subprocess.run([executable, "--version"], stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, check=True).stdout.decode()
assert version == "pyright 1.1.408\n", repr(version)
package = pathlib.Path(executable).resolve().parent
assert json.loads((package / "package.json").read_text())["version"] == "1.1.408"
variants = [
    ("plain-success", ["clean.py"]),
    ("plain-error", ["error.py"]),
    ("plain-warning", ["warning.py"]),
    ("plain-information", ["information.py"]),
    ("plain-multi", ["clean.py", "error.py", "warning.py", "information.py", "path spaces/café 🧪.py"]),
    ("json-success", ["--outputjson", "clean.py"]),
    ("json-error", ["--outputjson", "error.py", "path spaces/café 🧪.py"]),
    ("config-invalid", ["--project", "invalid.json", "clean.py"]),
    ("config-missing", ["--project", "missing.json", "clean.py"]),
    ("stats", ["--stats", "clean.py", "warning.py", "information.py"]),
    ("verbose", ["--verbose", "clean.py"]),
]
records = []
cases = []
for suffix, args in variants:
    argv = [executable, *args]
    try:
        result = subprocess.run(argv, cwd=root / "source", stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                timeout=90, check=False)
        raw = result.stdout
        termination = {"kind": "exited", "code": result.returncode}
        completeness = "complete"
    except subprocess.TimeoutExpired as failure:
        raw = failure.stdout or b""
        termination = {"kind": "timed_out"}
        completeness = "truncated"
    raw.decode("utf-8", errors="strict")
    filename = suffix + ".txt"
    (root / filename).write_bytes(raw)
    record = {"name": "L08-" + suffix, "argv": argv,
              "command": shlex.join(argv), "file": filename,
              "termination": termination, "completeness": completeness,
              "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
              "eof": "LF" if raw.endswith(b"\n") else "no-LF"}
    records.append(record)
    cases.append({"name": record["name"], "family": "pyright",
                  "version": version.rstrip("\n"), "platform": platform.platform(),
                  "completeness": completeness, "presentation": "unknown",
                  "termination": termination, "status": "passthrough",
                  "command": record["command"], "file": filename,
                  "provenance": {"sha256": record["sha256"],
                                 "record": "capture-receipt.json",
                                 "originalCase": record["name"]}})
sources = []
for path in sorted((root / "source").rglob("*")):
    if path.is_file():
        raw = path.read_bytes()
        sources.append({"file": str(path.relative_to(root)), "bytes": len(raw),
                        "sha256": hashlib.sha256(raw).hexdigest()})
receipt = {"capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
           "versionOutput": version, "platform": platform.platform(),
           "cwd": str(root / "source"), "sources": sources, "records": records,
           "boundary": "stdin DEVNULL; stdout PIPE; stderr STDOUT at child spawn; no PTY; no normalization",
           "timeoutSeconds": 90,
           "nodeVersion": subprocess.check_output(["node", "--version"]).decode(),
           "npmVersion": subprocess.check_output(["npm", "--version"]).decode(),
           "environment": {key: os.environ.get(key) for key in
                           ("LANG", "LC_ALL", "TERM", "NO_COLOR", "FORCE_COLOR", "PYTHONPATH")},
           "producer": {"package": "pyright", "version": "1.1.408", "license": "MIT",
                        "upstreamCommit": "ad444cc7a0923cb6127279fb95fe0b576d96d0d7",
                        "upstreamPath": "packages/pyright",
                        "tarball": "https://registry.npmjs.org/pyright/-/pyright-1.1.408.tgz",
                        "integrity": "sha512-N61pxaLLCsPcUuPPHMNIrGoZgGBgrbjBX5UqkaT5UV8NVZdL7ExsO6N3ectv1DzAUsLOzdlyqoYtX76u8eF4YA==",
                        "licenseSha256": hashlib.sha256((package / "LICENSE.txt").read_bytes()).hexdigest(),
                        "entrySha256": hashlib.sha256(pathlib.Path(executable).resolve().read_bytes()).hexdigest()}}
for filename, document in (("capture-receipt.json", receipt),
                           ("cases.json", {"schema": "hugr-lean/native-cases/1",
                                           "family": "pyright", "cases": cases})):
    (root / filename).write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(records, ensure_ascii=False, indent=2))
