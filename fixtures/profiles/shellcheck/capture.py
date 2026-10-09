"""Capture ShellCheck only; never execute shell payloads. Run: python3 capture.py.

Requires existing ShellCheck 0.11.0. All generated files stay in this directory.
No test/build/filter invocation. Replay overwrites this packet's generated artifacts.
"""
import datetime
import hashlib
import json
import os
import platform
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import urllib.request

DEST = Path(__file__).resolve().parent
PIN = "aac0823e6b58f8a499e856e93738082691cbf212"
TMP = "/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode"
SOURCES = {
    "clean.sh": '#!/bin/sh\nname="world"\nprintf "%s\\n" "$name"\n',
    "warn.bash": '#!/bin/bash\nunused="unused"\nfor f in $(ls *.txt); do\n  echo $f\ndone\n',
    "levels.bash": '#!/bin/bash\nunused="unused"\n[ "$value" == "yes" ]\necho $value\necho "${value}"\ncat file.txt | grep needle\n',
    "error.sh": '#!/bin/sh\nfoo = bar\n',
    "syntax.sh": '#!/bin/sh\nif true; then\n  echo "unterminated\n',
    "path space/雪😀.sh": '#!/bin/sh\nlabel="雪😀"; echo $label; echo $missing\n',
    "directives.sh": '#!/bin/sh\n# shellcheck disable=SC2086\necho $value\n',
    "dialect.sh": '#!/bin/sh\nitems=(one two)\necho "${items[0]}"\n',
    "source.sh": '#!/bin/sh\n# shellcheck source=lib.sh\n. ./lib.sh\necho "$shared"\n',
    "lib.sh": '#!/bin/sh\nshared="library"\necho $shared\n',
    "good.rc": 'disable=SC2086\nshell=bash\n',
    "bad.rc": 'shell=not-a-shell\n',
    "syntax.rc": 'disable="SC2086\n',
}
SPECS = [
    ("version", ["--version"]), ("help", ["--help"]),
    ("optional-checks", ["--list-optional"]),
    ("native-clean", ["--norc", "clean.sh"]),
    ("native-warnings", ["--norc", "warn.bash"]),
    ("native-error", ["--norc", "error.sh"]),
    ("native-multifile", ["--norc", "warn.bash", "error.sh"]),
    ("native-unicode-space", ["--norc", "path space/雪😀.sh"]),
    ("explicit-tty-links", ["--norc", "--format=tty", "--color=never", "--wiki-link-count=10", "warn.bash"]),
    ("explicit-tty-color", ["--norc", "--format=tty", "--color=always", "warn.bash"]),
    ("directives", ["--norc", "directives.sh"]),
    ("exclude", ["--norc", "--exclude=SC2034,SC2045,SC2086", "warn.bash"]),
    ("exclude-all", ["--norc", "--exclude=SC2034,SC2035,SC2045,SC2086", "warn.bash"]),
    ("include", ["--norc", "--include=SC2086", "warn.bash"]),
    ("dialect-sh", ["--norc", "--shell=sh", "dialect.sh"]),
    ("dialect-bash", ["--norc", "--shell=bash", "dialect.sh"]),
    ("severity-error", ["--norc", "--severity=error", "warn.bash"]),
    ("severity-warning", ["--norc", "--severity=warning", "levels.bash"]),
    ("severity-info", ["--norc", "--severity=info", "levels.bash"]),
    ("severity-style", ["--norc", "--severity=style", "--enable=useless-use-of-cat", "levels.bash"]),
    ("config", ["--rcfile=good.rc", "dialect.sh", "warn.bash"]),
    ("config-invalid", ["--rcfile=bad.rc", "clean.sh"]),
    ("config-syntax", ["--rcfile=syntax.rc", "clean.sh"]),
    ("config-missing", ["--rcfile=missing.rc", "clean.sh"]),
    ("syntax", ["--norc", "syntax.sh"]),
    ("missing-file", ["--norc", "missing.sh"]),
    ("invalid-format", ["--norc", "--format=not-a-format", "clean.sh"]),
    ("invalid-dialect", ["--norc", "--shell=not-a-shell", "clean.sh"]),
    ("source-default", ["--norc", "source.sh"]),
    ("source-external", ["--norc", "--external-sources", "--check-sourced", "--enable=quote-safe-variables", "source.sh"]),
]
for fmt in ("json", "json1"):
    for suffix, files in (("clean", ["clean.sh"]), ("warnings", ["warn.bash"]),
                          ("error", ["error.sh"]), ("syntax", ["syntax.sh"]),
                          ("multifile", ["warn.bash", "error.sh"]),
                          ("unicode-space", ["path space/雪😀.sh"]),
                          ("excluded", ["--exclude=SC2034,SC2045,SC2086", "warn.bash"]),
                          ("style", ["--enable=useless-use-of-cat", "levels.bash"]),
                          ("missing-file", ["missing.sh"])):
        SPECS.append((fmt + "-" + suffix, ["--norc", "--format=" + fmt] + files))


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def evidence(raw):
    return {"bytes": len(raw), "sha256": digest(raw), "readThroughEOF": True,
            "finalLF": raw.endswith(b"\n"), "lastBytesHex": raw[-16:].hex()}


def compact_layout(raw):
    # Lexical JSON whitespace only; every token spelling/order and terminal LF kept.
    json.loads(raw)
    result = bytearray()
    quoted = escaped = False
    for byte in raw.rstrip(b"\n"):
        if quoted or byte not in b" \t\r\n":
            result.append(byte)
        if escaped:
            escaped = False
        elif quoted and byte == 92:
            escaped = True
        elif byte == 34:
            quoted = not quoted
    result.extend(raw[len(raw.rstrip(b"\n")):])
    return bytes(result)


binary = shutil.which("shellcheck")
if binary is None:
    raise SystemExit("ShellCheck 0.11.0 required; no global install attempted")
with tempfile.TemporaryDirectory(prefix="L10-shellcheck-", dir=TMP) as directory:
    root = Path(directory)
    for name, text in SOURCES.items():
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(text.encode("utf-8"))
    env = dict(os.environ, LC_ALL="C.UTF-8", LANG="C.UTF-8", TERM="dumb", NO_COLOR="1",
               HOME=directory, XDG_CONFIG_HOME=directory)
    removed = ["SHELLCHECK_OPTS", "FORCE_COLOR", "CLICOLOR_FORCE"]
    for key in removed:
        env.pop(key, None)
    version = subprocess.run([binary, "--version"], cwd=root, env=env,
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=True).stdout
    if b"version: 0.11.0\n" not in version:
        raise SystemExit("Expected ShellCheck 0.11.0: " + repr(version))
    records = []
    candidates = []
    json_inventory = []
    for suffix, flags in SPECS:
        name = "L10-" + suffix
        argv = [binary] + flags
        # Single merged host pipe preserves cross-stream order at exec boundary.
        proc = subprocess.run(argv, cwd=root, env=env, stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT, timeout=30)
        raw = proc.stdout
        filename = name + ".txt"
        (DEST / filename).write_bytes(raw)
        record = {"name": name, "family": "shellcheck", "version": "ShellCheck 0.11.0",
                  "platform": platform.platform(), "file": filename, "status": "passthrough",
                  "disposition": "pending-policy", "source": "shell", "argv": argv,
                  "command": shlex.join(argv), "cwd": directory,
                  "termination": {"kind": "exited", "code": proc.returncode},
                  "completeness": "complete", "presentation": "unknown",
                  "inputBytes": len(raw), "outputBytes": len(raw), "sha256": digest(raw),
                  "eof": evidence(raw), "completionAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  "boundary": "stdout pipe; stderr redirected to stdout before exec; read through EOF and wait; no PTY or normalization",
                  "provenance": {"record": "capture-receipt.json", "originalCase": name, "sha256": digest(raw)}}
        records.append(record)
        if suffix.startswith(("json-", "json1-")):
            try:
                candidate = compact_layout(raw)
            except (ValueError, UnicodeDecodeError):
                continue  # Native non-JSON failure remains captured unchanged.
            parsed = json.loads(raw)
            comments = parsed if isinstance(parsed, list) else parsed["comments"]
            json_inventory.append({"case": name, "envelope": "array" if isinstance(parsed, list) else "comments-object",
                                   "levels": sorted({c["level"] for c in comments}),
                                   "codes": sorted({c["code"] for c in comments}),
                                   "diagnostics": len(comments), "layoutRemovableBytes": len(raw) - len(candidate)})
            if len(candidate) < len(raw):
                proposed = name + ".proposed.txt"
                (DEST / proposed).write_bytes(candidate)
                candidates.append({"case": name, "file": proposed, **evidence(candidate),
                                   "savedBytes": len(raw) - len(candidate), "approved": False,
                                   "eligible": proc.returncode == 0,
                                   "reason": "pending policy" if proc.returncode == 0 else "nonzero exit ineligible",
                                   "method": "JSON whitespace outside strings only; exact token order/spelling and terminal LF retained"})
    license_url = "https://raw.githubusercontent.com/koalaman/shellcheck/" + PIN + "/LICENSE"
    license_raw = urllib.request.urlopen(license_url, timeout=30).read()
    (DEST / "LICENSE.shellcheck.txt").write_bytes(license_raw)
    receipt = {"baseline": "63d3ece", "python": platform.python_version(), "platform": platform.platform(),
               "binary": {"path": binary, "resolvedPath": str(Path(binary).resolve()),
                          "sha256": digest(Path(binary).read_bytes()), "versionOutput": version.decode("utf-8"),
                          "binding": "Existing host binary; reported version and binary hash pinned. Build-to-source correspondence not independently attested."},
               "recipe": {"file": "capture.py", "sha256": digest(Path(__file__).read_bytes())},
               "environment": {"set": {k: env[k] for k in ("LC_ALL", "LANG", "TERM", "NO_COLOR", "HOME", "XDG_CONFIG_HOME")},
                               "removed": removed, "otherwise": "inherited"},
               "sourceOrigin": "Original tiny campaign scripts/configs; MIT repository license; never executed",
               "sources": {name: {"output": text, **evidence(text.encode("utf-8"))} for name, text in SOURCES.items()},
               "donor": {"repository": "https://github.com/koalaman/shellcheck", "commit": PIN,
                         "path": "LICENSE", "license": "GPL-3.0", "file": "LICENSE.shellcheck.txt",
                         "sha256": digest(license_raw), "modifications": "None; byte-for-byte license archive only. No donor implementation or fixture copied."},
               "cases": [{"name": r["name"], "file": r["file"], "exit": r["termination"]["code"], **r["eof"]} for r in records],
               "candidates": candidates, "approvedSavingsBytes": 0,
               "jsonInventory": json_inventory,
               "layoutMeasurementControl": {"input": '{ "control" : "雪 😀", "number" : 1.00 }\n',
                                            "output": compact_layout('{ "control" : "雪 😀", "number" : 1.00 }\n'.encode()).decode(),
                                            "purpose": "Positive control: removable outside-string whitespace detected; string spaces, numeric token spelling and EOF retained"},
               "coverage": {"cases": len(records), "nativeBytes": sum(r["inputBytes"] for r in records),
                            "exitCodes": {str(code): sum(r["termination"]["code"] == code for r in records)
                                          for code in sorted({r["termination"]["code"] for r in records})}}}
    manifest = {"schema": "hugr-lean/native-cases/1", "family": "shellcheck", "baseline": "63d3ece", "cases": records,
                "archives": [{"file": "LICENSE.shellcheck.txt", "reason": "Pinned upstream GPL-3.0 license; not command output"}] +
                            [{"file": c["file"], "reason": "Unapproved layout candidate; not public-filter expected output"} for c in candidates]}
    (DEST / "cases.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (DEST / "capture-receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for r in records:
        print(r["name"], "exit", r["termination"]["code"], "bytes", r["inputBytes"], "LF", r["eof"]["finalLF"])
    print("Candidates:", json.dumps(candidates))
    print("Coverage:", json.dumps(receipt["coverage"]))
    print("Donor:", json.dumps(receipt["donor"]))
    print("Layout measurement control:", json.dumps(receipt["layoutMeasurementControl"]))
