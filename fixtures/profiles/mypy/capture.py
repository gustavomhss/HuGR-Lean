"""Native capture recipe; generates artifacts only beside this script.

Usage: python3 capture.py /absolute/path/to/isolated/venv
Install pins first: mypy==1.18.2 mypy-extensions==1.1.0
typing-extensions==4.15.0 pathspec==0.12.1 (Python 3.12).
"""
import datetime
import hashlib
import importlib.metadata
import json
import os
import platform
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile

venv = Path(sys.argv[1]).absolute()
destination = Path(__file__).resolve().parent
sources = {
    "clean.py": "def double(value: int) -> int:\n    return value * 2\n",
    "context.py": "def broken_return(value: int) -> str:\n    return value\n",
    "errors.py": "from typing import overload\n\n@overload\ndef convert(value: int) -> int: ...\n@overload\ndef convert(value: str) -> str: ...\ndef convert(value: int | str) -> int | str:\n    return value\n\nresult: int = 'bad'\nconvert(1.5)\nreveal_type(result)\n",
    "defs.py": "def take(value: int) -> int:\n    return value\n",
    "use.py": "from defs import take\nfrom absent_l07 import missing\nanswer: str = take('wrong')\n",
    "inconsistent.py": "def repeat(value: int) -> int:\n    return value\ndef repeat(value: str) -> str:\n    return value\n",
    "path space/雪.py": "label = '雪😀'; value: int = '错'\nreveal_type(label)\n",
    "bad.ini": "[mypy]\npython_version = invalid\n",
    "warning.ini": "[mypy]\nunknown_l07_option = True\n",
    "strict.ini": "[mypy]\nstrict = True\nshow_error_codes = True\nshow_column_numbers = True\n",
    "syntax.py": "def broken(:\n    pass\n",
    "plugin.ini": "[mypy]\nplugins = collision_plugin.py\n",
    "collision_plugin.py": "import sys\nfrom mypy.plugin import Plugin\n\ndef plugin(version: str):\n    print('Success: no issues found in 1 source file', flush=True)\n    print('clean.py:1:1: note: native-shaped plugin stdout', flush=True)\n    print('LOG:  Building graph', file=sys.stderr, flush=True)\n    return Plugin\n",
}
specs = [
    ("version", ["--version"], False),
    ("summary-success", ["clean.py"], False),
    ("silent-success", ["--no-error-summary", "clean.py"], False),
    ("errors-notes", ["errors.py"], False),
    ("columns-context", ["--show-column-numbers", "--show-error-context", "--pretty", "errors.py"], False),
    ("function-context", ["--show-column-numbers", "--show-error-context", "--pretty", "context.py"], False),
    ("multi-file-imports", ["defs.py", "use.py", "inconsistent.py"], False),
    ("unicode-space", ["--show-column-numbers", "--show-error-end", "path space/雪.py"], False),
    ("config-warning", ["--config-file", "warning.ini", "clean.py"], False),
    ("config-failure", ["--config-file", "bad.ini", "clean.py"], False),
    ("config-strict", ["--config-file", "strict.ini", "errors.py"], False),
    ("config-missing", ["--config-file", "missing.ini", "clean.py"], False),
    ("syntax-failure", ["syntax.py"], False),
    ("requested-json", ["--output", "json", "errors.py"], False),
    ("requested-json-success", ["--output", "json", "clean.py"], False),
    ("requested-json-unicode", ["--output", "json", "--show-column-numbers", "path space/雪.py"], True),
    ("module-launcher", ["--show-column-numbers", "errors.py"], True),
    ("plugin-collision", ["--config-file", "plugin.ini", "clean.py"], False),
    ("plugin-verbose-collision", ["--verbose", "--follow-imports=skip", "--config-file", "plugin.ini", "clean.py"], False),
    ("requested-verbose", ["--verbose", "--follow-imports=skip", "clean.py"], False),
]
with tempfile.TemporaryDirectory(prefix="L07-mypy-", dir="/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode") as directory:
    root = Path(directory)
    for name, text in sources.items():
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    env = dict(os.environ, LC_ALL="C.UTF-8", LANG="C.UTF-8", TERM="dumb", NO_COLOR="1")
    env.pop("MYPYPATH", None)
    for key in ("FORCE_COLOR", "CLICOLOR_FORCE", "MYPY_FORCE_COLOR"):
        env.pop(key, None)
    version = subprocess.run([str(venv / "bin/python"), "-m", "mypy", "--version"], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=True).stdout.decode("utf-8").rstrip("\n")
    assert version == "mypy 1.18.2 (compiled: yes)", version
    pins = {name: importlib.metadata.version(name) for name in ("mypy", "mypy-extensions", "typing-extensions", "pathspec")}
    assert pins == {"mypy": "1.18.2", "mypy-extensions": "1.1.0", "typing-extensions": "4.15.0", "pathspec": "0.12.1"}, pins
    records = []
    for suffix, flags, module in specs:
        launcher = [str(venv / "bin/python"), "-m", "mypy"] if module else [str(venv / "bin/mypy")]
        # Every check uses a fresh isolated cache; no output cleanup or command rewriting.
        argv = launcher + ([] if suffix == "version" else ["--no-incremental", "--cache-dir", "/dev/null"]) + flags
        proc = subprocess.run(argv, cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=60)
        raw = proc.stdout
        records.append({
            "name": "L07-" + suffix, "family": "mypy", "version": version,
            "platform": platform.platform(), "output": raw.decode("utf-8"),
            "status": "passthrough", "source": "shell", "argv": argv, "command": shlex.join(argv),
            "termination": {"kind": "exited", "code": proc.returncode}, "completeness": "complete",
            "presentation": "unknown", "inputBytes": len(raw), "outputBytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(), "cwd": directory,
            "eof": {"readThroughEOF": True, "finalLF": raw.endswith(b"\n"), "lastBytesHex": raw[-16:].hex()},
            "provenance": {"sha256": hashlib.sha256(raw).hexdigest(), "record": "capture-receipt.json", "originalCase": "L07-" + suffix},
            "completionAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "boundary": "stdout pipe; stderr redirected to same pipe before exec; read through EOF and wait; no PTY, truncation or normalization",
        })
    manifest = {"schema": "hugr-lean/native-cases/1", "family": "mypy", "baseline": "78195e9", "cases": records}
    (destination / "cases.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    receipt = {"python": sys.version, "platform": platform.platform(), "packages": pins,
               "venv": str(venv), "sourceOrigin": "Original campaign tiny projects; no donor material copied",
               "recipeSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
               "environment": {"set": {key: env[key] for key in ("LC_ALL", "LANG", "TERM", "NO_COLOR")},
                               "removed": ["MYPYPATH", "FORCE_COLOR", "CLICOLOR_FORCE", "MYPY_FORCE_COLOR"], "otherwise": "inherited"},
               "sources": {name: {"output": text, "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(), "bytes": len(text.encode("utf-8"))} for name, text in sources.items()},
               "caseIds": [record["name"] for record in records],
               "verboseEvidence": {record["name"]: [line for line in record["output"].splitlines() if "Built graph" in line or "Build finished" in line or "Building graph" in line] for record in records if "verbose" in record["name"]}}
    (destination / "capture-receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for record in records:
        print(record["name"], "exit", record["termination"]["code"], "bytes", record["inputBytes"], "finalLF", record["eof"]["finalLF"])
    print("verbose evidence:", json.dumps(receipt["verboseEvidence"]))
