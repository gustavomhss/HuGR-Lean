"""Bounded native capture recipe; no filtering, argv rewriting, or runtime flags."""
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import shlex
import subprocess
import sys
import time
import urllib.request
import zipfile

OUT = Path(__file__).resolve().parent
ROOT = Path(sys.argv[1]).resolve()
ROOT.mkdir(exist_ok=False)
VENV = ROOT / "venv"
subprocess.run(["uv", "venv", "--python", sys.executable, str(VENV)], check=True)
PY = str(VENV / "bin/python")
subprocess.run(["uv", "pip", "install", "--python", PY, "--index-url",
                "https://pypi.org/simple", "pip==25.3"], check=True)
ENV = {k: v for k, v in os.environ.items() if not k.startswith("PIP_")}
ENV.update(PATH=str(VENV / "bin") + os.pathsep + ENV["PATH"],
           PIP_CONFIG_FILE=os.devnull, PIP_CACHE_DIR=str(ROOT / "cache"))
version = subprocess.check_output([PY, "-m", "pip", "--version"], env=ENV).decode().strip()
assert version.startswith("pip 25.3 "), version
sources = []
for package, pin in [("pip", "25.3"), ("colorama", "0.4.6")]:
    url = f"https://pypi.org/pypi/{package}/{pin}/json"
    with urllib.request.urlopen(url, timeout=30) as response:
        data = response.read()
    info = json.loads(data)
    assert info["info"]["version"] == pin
    sources.append({"url": url, "sha256": hashlib.sha256(data).hexdigest(),
                    "license": info["info"].get("license_expression") or info["info"].get("license"),
                    "wheels": [{"url": x["url"], "sha256": x["digests"]["sha256"]}
                               for x in info["urls"] if x["packagetype"] == "bdist_wheel"]})


def wheel(name, version, requires=()):
    dist = f"{name}-{version}.dist-info"
    files = {f"{name}/__init__.py": b"", f"{dist}/METADATA":
             (f"Metadata-Version: 2.1\nName: {name}\nVersion: {version}\n" +
              "".join(f"Requires-Dist: {r}\n" for r in requires)).encode(),
             f"{dist}/WHEEL": b"Wheel-Version: 1.0\nGenerator: P05\nRoot-Is-Purelib: true\nTag: py3-none-any\n"}
    records = []
    for path, data in files.items():
        digest = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b"=").decode()
        records.append(f"{path},sha256={digest},{len(data)}\n")
    files[f"{dist}/RECORD"] = ("".join(records) + f"{dist}/RECORD,,\n").encode()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as archive:
        for path, data in files.items():
            entry = zipfile.ZipInfo(path, (2020, 1, 1, 0, 0, 0))
            archive.writestr(entry, data)
    return buf.getvalue()


links = ROOT / "wheels"
links.mkdir()
for name, pin, deps in [("p05_dep", "1.0", ()), ("p05_dep", "2.0", ()),
                        ("p05_root", "1.0", ("p05_dep==1.0",))]:
    (links / f"{name}-{pin}-py3-none-any.whl").write_bytes(wheel(name, pin, deps))
(ROOT / "requirements.txt").write_text("p05_root==1.0\n")
(ROOT / "constraints.txt").write_text("p05_dep==1.0\n")
(ROOT / "conflict.txt").write_text("p05_dep==2.0\n")
backend = ROOT / "backend"
backend.mkdir()
(backend / "pyproject.toml").write_text('[build-system]\nrequires = []\nbuild-backend = "backend"\nbackend-path = ["."]\n')
payload = base64.b64encode(wheel("p05_backend", "1.0")).decode()
(backend / "backend.py").write_text(f'''import base64
from pathlib import Path
def get_requires_for_build_wheel(config_settings=None):
    print("Collecting backend-user-log==9.9", flush=True)
    print("Downloading backend-user-log (123 kB)", flush=True)
    print("Successfully installed backend-user-log-9.9", flush=True)
    print("WARNING: backend user log must survive", flush=True)
    return []
def build_wheel(wheel_directory, config_settings=None, metadata_directory=None):
    print("Building wheels for collected packages: user-owned", flush=True)
    print("Finished user task in 0.123s; retain timing", flush=True)
    name = "p05_backend-1.0-py3-none-any.whl"
    Path(wheel_directory, name).write_bytes(base64.b64decode({payload!r}))
    return name
''')
cases = []


def capture(name, args, reason, proposal=None):
    argv = args
    started = time.time()
    result = subprocess.run(argv, cwd=ROOT, env=ENV, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=90)
    raw = result.stdout
    raw.decode("utf-8", errors="strict")
    file = f"{name}.txt"
    (OUT / file).write_bytes(raw)
    row = dict(name=f"P05/{name}", family="pip-install", version="pip 25.3",
               platform=f"{sys.platform}-{platform.machine()}", file=file,
               status="passthrough", source="shell", argv=argv, command=shlex.join(argv),
               cwd=str(ROOT), termination={"kind": "exited", "code": result.returncode},
               completeness="complete", presentation="pipe", inputBytes=len(raw), outputBytes=len(raw),
               sha256=hashlib.sha256(raw).hexdigest(), proposal=proposal,
               reason=reason, elapsedSeconds=time.time() - started,
               provenance={"record": "SOURCES.md", "originalCase": f"P05/{name}",
                           "sha256": hashlib.sha256(raw).hexdigest()})
    cases.append(row)
    print(name, result.returncode, len(raw), flush=True)


public = ["install", "--index-url", "https://pypi.org/simple", "--retries", "0", "--timeout", "15"]
capture("public-fresh", ["pip", *public, "colorama==0.4.6"], "not-implemented: native download evidence inspected")
capture("public-satisfied", [PY, "-m", "pip", *public, "colorama==0.4.6"], "no-removable-material: satisfied package/version retained")
capture("public-cache", ["pip", *public, "--force-reinstall", "colorama==0.4.6"], "unsafe-to-delete: cache, uninstall and version changes retained")
capture("public-binary-progress-off", [PY, "-m", "pip", *public, "--only-binary=:all:", "--progress-bar", "off", "--target", "public-target", "colorama==0.4.6"], "no-removable-material: original flags remove progress, not package evidence")
local = ["install", "--no-index", "--find-links", "wheels"]
capture("local-fresh", ["pip", *local, "p05_root==1.0"], "unsafe-to-delete: dependency and installation evidence")
capture("local-satisfied", [PY, "-m", "pip", *local, "p05_root==1.0"], "no-removable-material: dependency satisfaction evidence")
capture("requirements-constraints", [PY, "-m", "pip", *local, "--only-binary=:all:", "--progress-bar", "off", "--target", "requirements-target", "-r", "requirements.txt", "-c", "constraints.txt"], "no-removable-material: requirement/constraint package associations")
capture("resolver-failure", ["pip", *local, "--target", "conflict-target", "-r", "requirements.txt", "-c", "conflict.txt"], "failure-exact: resolver diagnostics and action advice")
capture("offline-miss", [PY, "-m", "pip", "install", "--no-index", "p05_missing==1.0"], "failure-exact: no matching distribution")
capture("offline-warning", ["pip", *local, "--find-links", "missing-wheel-directory", "--target", "warning-target", "p05_root==1.0"], "unsafe-to-delete: native warning with successful install")
capture("backend-logs", [PY, "-m", "pip", "install", "--no-index", "-v", "./backend"], "unsafe-ambiguous: native-shaped backend logs, timing, summary and warning")
capture("binary-satisfied-backend", ["pip", *local, "--only-binary=:all:", "--progress-bar", "off", "p05_backend==1.0"], "no-removable-material: previously installed backend package satisfaction")
capture("binary-reject-backend", ["pip", *local, "--only-binary=:all:", "--progress-bar", "off", "--target", "binary-target", "p05_backend==1.0"], "failure-exact: fresh target has no backend wheel in find-links")
capture("binary-explicit-source", [PY, "-m", "pip", "install", "--no-index", "--only-binary=:all:", "--progress-bar", "off", "--target", "binary-source-target", "-v", "./backend"], "unsafe-ambiguous: only-binary does not prevent explicitly requested local source backend execution")

inputs = [{"path": str(p.relative_to(ROOT)), "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
          for p in [*sorted(links.iterdir()), ROOT / "requirements.txt", ROOT / "constraints.txt",
                    ROOT / "conflict.txt", backend / "backend.py", backend / "pyproject.toml"]]
receipt = dict(version=version, python=sys.version, platform=platform.platform(),
               environment={"PATHPrefix": str(VENV / "bin"), "PIP_CONFIG_FILE": os.devnull,
                            "PIP_CACHE_DIR": str(ROOT / "cache"), "otherPipEnvironment": "removed"},
               boundary="subprocess stdout pipe with stderr=STDOUT; byte-exact, no PTY, no normalization",
               publicSources=sources, localInputs=inputs)
(OUT / "capture-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
document = dict(schema="hugr-lean/native-cases/1", family="pip-install",
                baseline="07ffe15e2263c2925778022194c5385807216603", cases=cases)
(OUT / "cases.json").write_text(json.dumps(document, indent=2) + "\n")
