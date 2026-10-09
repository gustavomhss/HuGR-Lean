"""Original MIT native-only recipe. Run with isolated venv Python; argument: temp root.

python3 -m venv "$TEMP/R01-pytest-venv"
"$TEMP/R01-pytest-venv/bin/python" -m pip --isolated install --index-url https://pypi.org/simple --only-binary=:all: -r requirements.txt
"$TEMP/R01-pytest-venv/bin/python" capture.py "$TEMP"
No production filter, repository test suite, build or CI runs here.
"""
import datetime
import hashlib
import importlib.metadata as metadata
import json
import os
from pathlib import Path
import platform
import shlex
import subprocess
import sys
import tempfile

destination = Path(__file__).resolve().parent
temporary = Path(sys.argv[1]).resolve()
assert sys.prefix != sys.base_prefix, "isolated venv required"
pins = dict(line.split("==") for line in (destination / "requirements.txt").read_text().splitlines())
assert {name: metadata.version(name) for name in pins} == pins
sha = lambda data: hashlib.sha256(data).hexdigest()
sources = {str(path.relative_to(destination)): {"bytes": len(path.read_bytes()), "sha256": sha(path.read_bytes())} for path in sorted((destination / "project").glob("*.py"))}
specs = [
    ("serial-outcomes", [], ["test_outcomes.py"]),
    ("serial-strict-xpass", [], ["test_strict.py"]),
    ("worker-outcomes", ["-p", "xdist.plugin", "-n", "2", "-v"], ["test_outcomes.py"]),
    ("worker-strict-xpass", ["-p", "xdist.plugin", "-n", "2", "-v"], ["test_outcomes.py", "test_strict.py"]),
    ("worker-failure-stdout", ["-p", "xdist.plugin", "-n", "2", "-v"], ["test_outcomes.py", "test_stdout.py"]),
    ("test-stdout-success", ["-s"], ["test_stdout.py::test_stdout"]),
    ("plugin-success", ["-p", "collision_plugin"], ["test_outcomes.py"]),
    ("plugin-failure", ["-p", "collision_plugin"], ["test_strict.py"]),
    ("plugin-test-stdout", ["-p", "collision_plugin", "-s"], ["test_stdout.py::test_stdout"]),
    ("worker-plugin-collision", ["-p", "xdist.plugin", "-p", "collision_plugin", "-n", "2", "-v"], ["test_outcomes.py"]),
]
env = dict(os.environ)
removed = ["PYTHONPATH", "PYTHONHOME", "PYTEST_ADDOPTS", "PYTEST_PLUGINS", "FORCE_COLOR", "CLICOLOR_FORCE"]
for key in removed:
    env.pop(key, None)
overrides = {"PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1", "PYTHONNOUSERSITE": "1", "PYTHONDONTWRITEBYTECODE": "1", "PYTHONHASHSEED": "0", "LC_ALL": "C.UTF-8", "LANG": "C.UTF-8", "TERM": "dumb", "NO_COLOR": "1"}
env.update(overrides)
records = []
# Resume only failed preparation cases; retain successful captures unchanged.
prior_path = destination / "capture-receipt.json"
if prior_path.exists():
    prior = json.loads(prior_path.read_text())
    failed_names = {"serial-outcomes", "plugin-success", "plugin-failure", "plugin-test-stdout", "worker-plugin-collision"}
    archive = destination / "failed-captures"
    archive.mkdir(exist_ok=True)
    (archive / "capture-receipt.json").write_bytes(prior_path.read_bytes())
    for record in prior["cases"]:
        suffix = record["name"].split("/", 1)[1]
        if suffix in failed_names:
            (archive / record["file"]).write_bytes((destination / record["file"]).read_bytes())
        else:
            records.append(record)
    specs = [spec for spec in specs if spec[0] in failed_names]
with tempfile.TemporaryDirectory(prefix="R01-pytest-", dir=temporary) as directory:
    root = Path(directory)
    # Explicit original plugin search path; entry-point launcher omits cwd from sys.path.
    env["PYTHONPATH"] = directory
    for source in sources:
        (root / Path(source).name).write_bytes((destination / source).read_bytes())
    for suffix, flags, paths in specs:
        argv = ["pytest", "--color=no", "-r", "a", *flags, *paths]
        actual = [str(Path(sys.prefix) / "bin/pytest"), *argv[1:]]
        proc = subprocess.run(actual, cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=60)
        raw = proc.stdout
        file = suffix + ".txt"
        (destination / file).write_bytes(raw)
        record = {"name": "R01/" + suffix, "family": "pytest", "file": file,
                  "command": shlex.join(argv), "argv": argv, "source": "shell", "status": "passthrough",
                  "termination": {"kind": "exited", "code": proc.returncode}, "completeness": "complete", "presentation": "unknown",
                  "version": "; ".join(name + "==" + version for name, version in pins.items()), "platform": platform.platform(),
                  "inputBytes": len(raw), "outputBytes": len(raw), "sha256": sha(raw),
                  "provenance": {"capture": "capture-receipt.json", "source": "project", "sha256": sha(raw)},
                  "capture": {"executedArgv": actual, "cwd": directory, "environmentSet": dict(overrides, PYTHONPATH=directory), "environmentRemoved": removed,
                              "boundary": "stdout pipe; stderr redirected to same pipe before exec; read through EOF and wait; no PTY, truncation or normalization",
                              "readThroughEOF": True, "finalLF": raw.endswith(b"\n"), "lastBytesHex": raw[-16:].hex()},
                  "baselineDisposition": "PENDING_DEFAULT_FILTER", "approvedRemovableBytes": 0}
        records.append(record)
        print(record["name"], "exit", proc.returncode, "bytes", len(raw))

# Preserve installed distribution license bytes and module hashes; no donor code copied.
licenses = destination / "licenses"
licenses.mkdir(exist_ok=True)
packages = {}
for name in pins:
    dist = metadata.distribution(name)
    modules = []
    license_paths = []
    for file in dist.files or []:
        path = Path(dist.locate_file(file))
        if path.is_file() and str(file).endswith(".py"):
            modules.append({"path": str(file), "sha256": sha(path.read_bytes())})
        if path.is_file() and ("license" in path.name.lower() or "copying" in path.name.lower()):
            target = licenses / (name + "-" + path.name)
            target.write_bytes(path.read_bytes())
            license_paths.append({"path": str(target.relative_to(destination)), "sourcePath": str(file), "sha256": sha(path.read_bytes())})
    assert license_paths, "missing license for " + name
    packages[name] = {"version": dist.version, "licenseExpression": dist.metadata.get("License-Expression"), "license": dist.metadata.get("License"), "licenses": license_paths, "modules": modules}
receipt = {"schema": "R01/native-capture/1", "baseline": "248c303", "capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
           "python": sys.version, "executable": sys.executable, "executableSha256": sha(Path(sys.executable).read_bytes()), "venv": sys.prefix,
           "platform": platform.platform(), "sourceOrigin": "Original tiny MIT campaign programs; no donor material copied",
           "recipeSha256": sha(Path(__file__).read_bytes()), "sources": sources, "packages": packages, "cases": records}
(destination / "capture-receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
(destination / "cases.json").write_text(json.dumps({"schema": "hugr-lean/native-cases/1", "cases": records}, ensure_ascii=False, indent=2) + "\n")
# Explicit archive path strings; raw case inputs excluded.
archives = [str(path.relative_to(destination)) for path in sorted(destination.rglob("*")) if path.is_file() and path.name not in {"cases.json", "allnoninput.txt"} and str(path.relative_to(destination)) not in {record["file"] for record in records}]
(destination / "allnoninput.txt").write_text("\n".join(archives) + "\n")
