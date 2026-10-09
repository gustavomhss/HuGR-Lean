"""Append bounded exit-zero native JSON witnesses without changing old receipts."""
import datetime
import hashlib
import json
import pathlib
import platform
import shlex
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parent
executable = sys.argv[1]
version = subprocess.check_output([executable, "--version"]).decode()
assert version == "pyright 1.1.408\n"
variants = [
    ("json-warning", ["warning.py"]),
    ("json-information", ["information.py"]),
    ("json-multi-unicode", ["warning.py", "information.py", "unicode paths"]),
]
records = []
manifest = json.loads((root / "cases.json").read_text())
owned = {"L08-" + suffix for suffix, _ in variants}
manifest["cases"] = [case for case in manifest["cases"] if case["name"] not in owned]
for suffix, paths in variants:
    argv = [executable, "--outputjson", *paths]
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
    filename = suffix + ".txt"
    (root / filename).write_bytes(raw)
    record = {"name": "L08-" + suffix, "argv": argv, "command": shlex.join(argv),
              "file": filename, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
              "termination": termination,
              "completeness": completeness, "trailingLFBytes": len(raw) - len(raw.rstrip(b"\n")),
              "last16BytesHex": raw[-16:].hex()}
    records.append(record)
    manifest["cases"].append({"name": record["name"], "family": "pyright",
                              "version": version.rstrip("\n"), "platform": platform.platform(),
                              "command": record["command"], "file": filename,
                              "completeness": completeness, "presentation": "unknown",
                              "termination": record["termination"], "status": "passthrough",
                              "provenance": {"sha256": record["sha256"],
                                             "record": "capture-json-receipt.json",
                                             "originalCase": record["name"]}})
sources = [{"file": str(path.relative_to(root)), "bytes": len(path.read_bytes()),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
           for path in sorted((root / "source").rglob("*")) if path.is_file()]
receipt = {"capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
           "versionOutput": version, "platform": platform.platform(), "cwd": str(root / "source"),
           "boundary": "stdin DEVNULL; stdout PIPE; stderr STDOUT at child spawn; no PTY; no normalization",
           "producerReceipt": "capture-receipt.json", "sources": sources, "records": records}
for filename, value in (("capture-json-receipt.json", receipt), ("cases.json", manifest)):
    (root / filename).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(records, ensure_ascii=False, indent=2))
