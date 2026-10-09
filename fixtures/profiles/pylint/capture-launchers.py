"""Additional native launcher witnesses; original L06 receipts stay immutable."""
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
SCRATCH = Path("/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode")
BIN = SCRATCH / "L06-pylint-venv/bin"
records = []
with tempfile.TemporaryDirectory(prefix="L06-launchers-", dir=SCRATCH) as temp:
    project = Path(temp) / "project"
    shutil.copytree(ROOT / "inputs", project)
    env = {"PATH": str(BIN) + ":/usr/bin:/bin", "HOME": temp, "PYTHONPATH": str(project),
           "PYLINTHOME": temp + "/cache", "PYTHONUTF8": "1", "LC_ALL": "C", "TZ": "UTC"}
    for name, launcher in [("direct-absolute", [str(BIN / "pylint")]), ("direct", ["pylint"]),
                           ("python-module", ["python", "-m", "pylint"]),
                           ("python3-module", ["python3", "-m", "pylint"])]:
        command = launcher + ["--rcfile=empty.rc", "--persistent=no", "--jobs=1",
                              "--output-format=json", "--exit-zero", "warning_case.py"]
        proc = subprocess.Popen(command, cwd=project, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        raw, _ = proc.communicate()
        assert proc.returncode == 0 and len(json.loads(raw)) == 2
        file = "L06-launcher-" + name + ".txt"
        (ROOT / file).write_bytes(raw)
        records.append({"name": name, "file": file, "command": command, "cwd": str(project),
                        "environment": env, "resolvedExecutable": shutil.which(launcher[0], path=env["PATH"]),
                        "version": "pylint 4.0.4", "platform": platform.platform(),
                        "termination": {"kind": "exited", "code": proc.returncode},
                        "completeness": "complete", "presentation": "unknown",
                        "boundary": {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
                                     "readThroughEOF": True, "finalLF": raw.endswith(b"\n"),
                                     "lastBytesHex": raw[-32:].hex(), "merge": "stderr=STDOUT before exec; binary pipe through EOF then wait"}})
        print(name, proc.returncode, len(raw))
receipt = {"schema": "hugr-lean/pylint-launchers/1", "installation": "install-report.json",
           "originalProducer": "capture-receipt.json", "sources": "inputs/",
           "recipe": {"path": "capture-launchers.py", "sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
           "records": records}
(ROOT / "launcher-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
