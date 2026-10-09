"""Capture tiny native Pylint projects only; no public filter or test invocation."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parent
BASE = "71bcaea2d5f0bf72e9128ebf80517ad1099f6cdd"
COMMIT = "e16f942166511d6fb4427e503a734152fae0c4fe"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save_json(name, value):
    (ROOT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def compact_layout(raw):
    """Remove only JSON lexical whitespace, retaining token spelling and EOF suffix."""
    end = len(raw.rstrip(b" \t\r\n"))
    inside = escaped = False
    result = bytearray()
    for char in raw[:end]:
        if inside:
            result.append(char)
            if escaped:
                escaped = False
            elif char == 92:
                escaped = True
            elif char == 34:
                inside = False
        elif char == 34:
            inside = True
            result.append(char)
        elif char not in b" \t\r\n":
            result.append(char)
    return bytes(result) + raw[end:]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--python", required=True, help="Absolute isolated-venv Python launcher")
    parser.add_argument("--install-report", required=True, help="pip --report receipt for installed wheels")
    args = parser.parse_args()
    python = str(Path(args.python).absolute())
    install = json.loads(Path(args.install_report).read_bytes())
    installed = {item["metadata"]["name"].lower(): item["metadata"]["version"] for item in install["install"]}
    assert installed["pylint"] == "4.0.4", installed
    save_json("install-report.json", install)
    license_url = f"https://raw.githubusercontent.com/pylint-dev/pylint/{COMMIT}/LICENSE"
    with urllib.request.urlopen(license_url) as response:
        license_bytes = response.read()
    assert b"GNU GENERAL PUBLIC LICENSE" in license_bytes
    (ROOT / "LICENSE.pylint.txt").write_bytes(license_bytes)
    inputs = [{"path": str(p.relative_to(ROOT)), "bytes": len(p.read_bytes()), "sha256": sha(p.read_bytes())}
              for p in sorted((ROOT / "inputs").rglob("*")) if p.is_file()]
    probe = b' { "x" : "keep  spaces \\"", "n": 1e+02 }\n\n'
    control = compact_layout(probe)
    assert len(control) < len(probe) and json.loads(control) == json.loads(probe)
    assert control.endswith(b"\n\n") and b"1e+02" in control
    cases, facts, candidates = [], [], []
    with tempfile.TemporaryDirectory(prefix="L06-pylint-", dir=str(Path(python).parents[2])) as temp:
        project = Path(temp) / "project"
        shutil.copytree(ROOT / "inputs", project)
        home = Path(temp) / "home"
        home.mkdir()
        env = {"PATH": str(Path(python).parent) + os.pathsep + "/usr/bin:/bin", "HOME": str(home),
               "PYTHONPATH": str(project), "PYLINTHOME": str(home / "pylint"),
               "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1", "LC_ALL": "C", "TZ": "UTC"}

        def run(suffix, options, common=True, layout=False):
            name = "L06-" + suffix
            argv = [python, "-m", "pylint"]
            if common:
                argv += ["--rcfile=empty.rc", "--persistent=no", "--jobs=1"]
            argv += options
            started = datetime.datetime.now(datetime.timezone.utc).isoformat()
            proc = subprocess.Popen(argv, cwd=project, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            raw, _ = proc.communicate()
            assert proc.returncode >= 0, (name, proc.returncode)
            raw.decode("utf-8", errors="strict")
            file = name + ".txt"
            (ROOT / file).write_bytes(raw)
            boundary = {"bytes": len(raw), "sha256": sha(raw), "readThroughEOF": True,
                        "finalLF": raw.endswith(b"\n"), "lastBytesHex": raw[-32:].hex(),
                        "merge": "stderr=STDOUT before exec; one binary pipe; communicate through EOF then wait; no PTY/normalization/truncation"}
            termination = {"kind": "exited", "code": proc.returncode}
            fact = {"name": name, "command": argv, "cwd": str(project), "environment": env,
                    "version": "pylint 4.0.4", "platform": platform.platform(),
                    "termination": termination, "completeness": "complete", "presentation": "unknown",
                    "boundary": boundary, "startedAt": started,
                    "completedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()}
            facts.append(fact)
            cases.append({"name": name, "family": "pylint", "version": fact["version"],
                          "platform": fact["platform"], "command": argv, "file": file,
                          "status": "passthrough", "termination": termination,
                          "completeness": "complete", "presentation": "unknown",
                          "provenance": {"receipt": "capture-receipt.json", "case": name, "sha256": sha(raw)}})
            if layout and proc.returncode == 0:
                decoded = json.loads(raw)
                candidate = compact_layout(raw)
                assert json.loads(candidate) == decoded
                if len(candidate) < len(raw):
                    proposal = name + ".candidate.txt"
                    (ROOT / proposal).write_bytes(candidate)
                    candidates.append({"case": name, "file": proposal, "status": "unapproved",
                                       "bytes": len(candidate), "savedBytes": len(raw) - len(candidate),
                                       "sha256": sha(candidate), "method": "lexical JSON whitespace only; every token spelling/order and exact trailing whitespace retained"})
            print(name, "exit", proc.returncode, "bytes", len(raw))
            return raw

        version = run("version", ["--version"], common=False)
        assert version.startswith(b"pylint 4.0.4\n"), version
        run("help", ["--help"], common=False)
        run("native-clean", ["clean.py"])
        run("native-errors", ["errors.py"])
        run("native-warnings", ["warning_case.py"])
        run("native-multifile", ["errors.py", "warning_case.py"])
        run("native-unicode-space", ["space café/naïve.py"])
        run("native-syntax", ["syntax.py"])
        run("native-missing-file", ["missing.py"])
        run("score-disabled", ["--score=no", "warning_case.py"])
        run("reports-clean", ["--reports=yes", "clean.py"])
        run("reports-multifile", ["--reports=yes", "errors.py", "warning_case.py"])
        run("reports-exit-zero", ["--reports=yes", "--exit-zero", "errors.py", "warning_case.py"])
        run("config", ["--rcfile=good.rc", "warning_case.py"])
        run("config-fail", ["--rcfile=bad.toml", "clean.py"])
        run("config-missing", ["--rcfile=missing.rc", "clean.py"])
        run("invalid-format", ["--output-format=missing", "clean.py"])
        run("native-exit-zero", ["--exit-zero", "errors.py", "warning_case.py"])
        run("plugin-native", ["--load-plugins=collision_plugin", "clean.py"])
        run("plugin-native-exit-zero", ["--load-plugins=collision_plugin", "--exit-zero", "clean.py"])
        run("plugin-missing", ["--load-plugins=missing_plugin", "clean.py"])
        for fmt in ("json", "json2"):
            for label, files in (("clean", ["clean.py"]), ("errors", ["errors.py"]),
                                 ("warnings", ["warning_case.py"]), ("multifile", ["errors.py", "warning_case.py"]),
                                 ("unicode-space", ["space café/naïve.py"]), ("syntax", ["syntax.py"])):
                run(fmt + "-" + label, ["--output-format=" + fmt] + files, layout=True)
            run(fmt + "-exit-zero", ["--output-format=" + fmt, "--exit-zero", "errors.py", "warning_case.py"], layout=True)
            run(fmt + "-reports", ["--output-format=" + fmt, "--reports=yes", "--exit-zero", "warning_case.py"], layout=True)
            run(fmt + "-config-fail", ["--output-format=" + fmt, "--rcfile=bad.toml", "clean.py"])
            run(fmt + "-plugin", ["--output-format=" + fmt, "--load-plugins=collision_plugin", "clean.py"])

    archives = ["LICENSE.pylint.txt", "L06-bootstrap-shadow.txt"] + [item["file"] for item in candidates]
    save_json("cases.json", {"schema": "hugr-lean/native-cases/1", "family": "pylint", "baseline": BASE,
                             "cases": cases, "archives": archives})
    save_json("capture-receipt.json", {"schema": "hugr-lean/pylint-capture/1", "baseline": BASE,
        "recipe": {"path": "capture.py", "sha256": sha(Path(__file__).read_bytes())},
        "python": {"launcher": python, "resolved": str(Path(python).resolve()),
                   "sha256": sha(Path(python).read_bytes()), "version": subprocess.check_output([python, "--version"]).decode().rstrip()},
        "installation": {"report": "install-report.json", "sha256": sha((ROOT / "install-report.json").read_bytes()),
                         "versions": installed, "wheelIdentity": "pip report download_info URLs and SHA-256; isolated venv only"},
        "producerSource": {"repository": "https://github.com/pylint-dev/pylint", "commit": COMMIT,
                           "tag": "v4.0.4", "license": "GPL-2.0-or-later",
                           "licensePath": "LICENSE", "licenseURL": license_url,
                           "licenseFile": "LICENSE.pylint.txt", "sha256": sha(license_bytes),
                           "modifications": "License copied verbatim. No runtime donor code copied. Original fixture inputs and recipe under repository MIT.",
                           "reach": "Tag resolves to commit; installed PyPI wheel pinned by report hash. Wheel-to-source build correspondence not independently attested."},
        "inputs": inputs, "cases": facts, "candidates": candidates,
        "layoutPositiveControl": {"inputHex": probe.hex(), "outputHex": control.hex(), "savedBytes": len(probe) - len(control)}})


if __name__ == "__main__":
    main()
