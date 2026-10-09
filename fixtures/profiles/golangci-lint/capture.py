"""Native-only L04 collector: python3 fixtures/profiles/golangci-lint/capture.py.

Requires existing golangci-lint 2.11.4 and Go. No tool build/install or filter tests.
Generated artifacts stay here; temporary dependency-free modules stay under TMP.
Replay overwrites generated packet artifacts. Raw merged output is never rewritten.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import shlex
import shutil
import subprocess
import tempfile
import urllib.request

DEST = Path(__file__).resolve().parent
TMP = "/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode"
PIN = "8f3b0c7ed018e57905fbd873c697e0b1ede605a5"
BASE = "71bcaea"
SOURCES = {
    "go.mod": "module example.invalid/l04\n\ngo 1.24.0\n",
    "clean/clean.go": "package clean\n\nfunc Sum(x, y int) int { return x + y }\n",
    "issues/issues.go": "package issues\n\nfunc dead() int { return 42 }\n\nfunc Work() int {\n\tx := 1\n\tx = 2\n\treturn x\n}\n\nfunc action() error { return nil }\nfunc Ignore() { action() }\n",
    "other/other.go": "package other\n\nfunc hidden() string { return \"雪 😀\" }\n",
    "other/雪.go": "package other\n\n// 雪😀 before diagnostic column.\nfunc unused雪() string { return \"雪 😀\" }\n",
    "path space/雪😀.go": "package unicode\n\n// 雪😀 context before diagnostic.\nfunc unused雪() string { return \"雪 😀\" }\n",
    "broken/broken.go": "package broken\n\nfunc Broken() int { return undefinedName }\n",
    "syntax/syntax.go": "package syntax\n\nfunc Broken( {\n",
    "good.yml": 'version: "2"\nlinters:\n  default: none\n  enable: [unused, ineffassign, errcheck]\nissues:\n  max-issues-per-linter: 0\n  max-same-issues: 0\n  uniq-by-line: false\n',
    "bad.yml": 'version: "2"\nlinters: [\n',
    "old.yml": 'linters:\n  disable-all: true\n',
}
COMMON = ["run", "--no-config", "--enable-only=unused,ineffassign,errcheck",
          "--max-issues-per-linter=0", "--max-same-issues=0", "--uniq-by-line=false"]
SPECS = [("version", ["version"]), ("run-help", ["run", "--help"]),
         ("linters-json", ["linters", "--no-config", "--json"])]
for kind, flags in (("native", []), ("json", ["--output.text.path=", "--output.json.path=stdout", "--show-stats=false"])):
    for suffix, paths in (("clean", ["./clean"]), ("diagnostics", ["./issues"]),
                          ("multifile", ["./issues", "./other"]),
                          ("space-unicode", ["--path-mode=abs", "./other"]), ("type-error", ["./broken"]),
                          ("syntax-error", ["./syntax"])):
        SPECS.append((kind + "-" + suffix, COMMON + flags + paths))
SPECS += [
    ("json-exit-zero", COMMON + ["--output.text.path=", "--output.json.path=stdout", "--show-stats=false", "--issues-exit-code=0", "./issues", "./other"]),
    ("json-with-stats", COMMON + ["--output.text.path=", "--output.json.path=stdout", "--show-stats=true", "./issues"]),
    ("native-exit-zero", COMMON + ["--issues-exit-code=0", "./issues", "./other"]),
    ("json-linter-warning", ["run", "--no-config", "--enable-only=wsl", "--output.text.path=", "--output.json.path=stdout", "--show-stats=false", "./clean"]),
    ("native-verbose-metrics", COMMON + ["--verbose", "--show-stats=true", "./issues", "./other"]),
    ("native-clean-metrics", COMMON + ["--verbose", "--show-stats=true", "./clean"]),
    ("native-no-context", COMMON + ["--output.text.print-issued-lines=false", "./issues"]),
    ("native-color", COMMON + ["--color=always", "./issues"]),
    ("config-valid", ["run", "--config=good.yml", "./issues", "./other"]),
    ("config-invalid", ["run", "--config=bad.yml", "./clean"]),
    ("config-version", ["run", "--config=old.yml", "./clean"]),
    ("config-missing", ["run", "--config=missing.yml", "./clean"]),
    ("unknown-linter", ["run", "--no-config", "--enable-only=not-a-linter", "./clean"]),
    ("deprecated-linter-warning", ["run", "--no-config", "--enable-only=wsl", "./clean"]),
    ("invalid-format-flag", ["run", "--no-config", "--out-format=json", "./clean"]),
    ("missing-package", COMMON + ["./missing"]),
    ("malformed-space-import", COMMON + ["./path space"]),
    ("default-clean", ["run", "--no-config", "./clean"]),
]
for fmt in ("tab", "checkstyle", "sarif", "junit-xml", "code-climate", "teamcity"):
    SPECS.append((fmt + "-multifile", COMMON + ["--output.text.path=", "--output." + fmt + ".path=stdout", "--show-stats=false", "./issues", "./other"]))


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def evidence(raw):
    return {"bytes": len(raw), "sha256": digest(raw), "readThroughEOF": True,
            "finalLF": raw.endswith(b"\n"), "lastBytesHex": raw[-16:].hex()}


def compact_layout(raw):
    json.loads(raw)
    quoted = escaped = False
    candidate = bytearray()
    body = raw.rstrip(b"\n")
    for byte in body:
        if quoted or byte not in b" \t\r\n":
            candidate.append(byte)
        if escaped:
            escaped = False
        elif quoted and byte == 92:
            escaped = True
        elif byte == 34:
            quoted = not quoted
    candidate.extend(raw[len(body):])
    return bytes(candidate)


binary = shutil.which("golangci-lint")
go = shutil.which("go")
if not binary or not go:
    raise SystemExit("Existing golangci-lint 2.11.4 and Go required")
with tempfile.TemporaryDirectory(prefix="L04 golangci 雪😀-", dir=TMP) as directory:
    root = Path(directory)
    for name, text in SOURCES.items():
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(text.encode())
    overrides = {"LC_ALL": "C.UTF-8", "LANG": "C.UTF-8", "TERM": "dumb", "NO_COLOR": "1",
                 "HOME": directory, "XDG_CONFIG_HOME": directory, "GOTOOLCHAIN": "local",
                 "GOPROXY": "off", "GOSUMDB": "off", "GOWORK": "off", "GOFLAGS": "",
                 "GOCACHE": directory + "/go-cache", "GOMODCACHE": directory + "/mod-cache",
                 "GOLANGCI_LINT_CACHE": directory + "/lint-cache", "GOMAXPROCS": "2"}
    env = dict(os.environ, **overrides)
    removed = ["GOENV", "GOROOT", "GOPATH", "FORCE_COLOR", "CLICOLOR_FORCE"]
    for key in removed:
        env.pop(key, None)
    env["GOENV"] = "off"
    overrides["GOENV"] = "off"

    def run(argv):
        return subprocess.run(argv, cwd=root, env=env, stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT, timeout=120)

    version = run([binary, "version"])
    if version.returncode or b"version 2.11.4 " not in version.stdout or b"8f3b0c7" not in version.stdout:
        raise SystemExit("Producer pin mismatch: " + repr(version.stdout))
    build = run([go, "version", "-m", binary])
    (DEST / "L04-build-metadata.txt").write_bytes(build.stdout)
    goversion = run([go, "version"])
    (DEST / "L04-go-version.txt").write_bytes(goversion.stdout)
    license_url = "https://raw.githubusercontent.com/golangci/golangci-lint/" + PIN + "/LICENSE"
    license_raw = urllib.request.urlopen(license_url, timeout=30).read()
    (DEST / "LICENSE.golangci-lint.txt").write_bytes(license_raw)
    records = []
    inventory = []
    for suffix, flags in SPECS:
        name = "L04-" + suffix
        argv = [binary] + flags
        proc = run(argv)
        raw = proc.stdout
        filename = name + ".txt"
        (DEST / filename).write_bytes(raw)
        records.append({"name": name, "family": "golangci-lint", "version": "golangci-lint 2.11.4",
                        "platform": platform.platform(), "file": filename, "status": "passthrough",
                        "disposition": "pending-policy", "source": "shell", "argv": argv,
                        "command": shlex.join(argv), "cwd": directory,
                        "termination": {"kind": "exited", "code": proc.returncode},
                        "completeness": "complete", "presentation": "unknown", "inputBytes": len(raw),
                        "outputBytes": len(raw), "sha256": digest(raw), "eof": evidence(raw),
                        "completionAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        "boundary": "stdout pipe; stderr redirected to stdout before exec; read through EOF and wait; no PTY or normalization",
                        "provenance": {"record": "capture-receipt.json", "originalCase": name, "sha256": digest(raw)}})
        if suffix.startswith("json-") and suffix != "json-with-stats":
            try:
                parsed = json.loads(raw)
                issues = parsed.get("Issues") or []
                inventory.append({"case": name, "diagnostics": len(issues), "issues": issues,
                                  "reportFields": list((parsed.get("Report") or {}).keys()),
                                  "enabledLinters": [l["Name"] for l in (parsed.get("Report") or {}).get("Linters", []) if l.get("Enabled")],
                                  "parse": "complete JSON envelope"})
            except (ValueError, UnicodeDecodeError):
                inventory.append({"case": name, "parse": "merged output not standalone JSON; retained exact"})
        print(name, "exit", proc.returncode, "bytes", len(raw))
    # Corpus measurement controls use real native output, not simulated lint logs.
    by_name = {r["name"]: r for r in records}
    clean_raw = (DEST / "L04-json-clean.txt").read_bytes()
    dirty_raw = (DEST / "L04-json-exit-zero.txt").read_bytes()
    clean_issues = json.loads(clean_raw).get("Issues") or []
    dirty_issues = json.loads(dirty_raw)["Issues"]
    if clean_issues or len(dirty_issues) != 5 or by_name["L04-json-exit-zero"]["termination"]["code"] != 0:
        raise SystemExit("Native clean/dirty diagnostic control mismatch; keep captures and investigate")
    whitespace_candidates = []
    for r in records:
        if not r["name"].startswith("L04-json-"):
            continue
        raw = (DEST / r["file"]).read_bytes()
        try:
            json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            continue
        # Only measure lexical whitespace; retain tokens and every trailing LF.
        candidate = compact_layout(raw)
        whitespace_candidates.append({"case": r["name"], "outsideStringWhitespaceBytes": len(raw) - len(candidate),
                                      "exit": r["termination"]["code"], "terminalLFKept": True})
    archives = ["LICENSE.golangci-lint.txt", "L04-build-metadata.txt", "L04-go-version.txt"]
    layout_control = '{ "control" : "雪 😀", "number" : 1.00 }\n'.encode()
    control_result = compact_layout(layout_control)
    if control_result != '{"control":"雪 😀","number":1.00}\n'.encode():
        raise SystemExit("Layout measurement control failed")
    receipt = {"baseline": BASE, "platform": platform.platform(), "python": platform.python_version(),
               "binary": {"path": binary, "resolvedPath": str(Path(binary).resolve()),
                          "sha256": digest(Path(binary).read_bytes()), "versionOutput": version.stdout.decode(),
                          "sourceCommit": PIN, "buildMetadata": "L04-build-metadata.txt",
                          "binding": "Existing binary reports unmodified vcs.revision; binary hash pinned. Independent reproducible-build correspondence not attested."},
               "go": {"path": go, "sha256": digest(Path(go).read_bytes()), "version": goversion.stdout.decode(),
                      "termination": goversion.returncode},
               "recipe": {"file": "capture.py", "sha256": digest(Path(__file__).read_bytes())},
               "environment": {"set": overrides, "removed": removed, "otherwise": "inherited"},
               "sources": {name: {"output": text, **evidence(text.encode())} for name, text in SOURCES.items()},
               "sourceOrigin": "Original tiny modules/configs; repository MIT; no external module dependencies",
               "donor": {"repository": "https://github.com/golangci/golangci-lint", "commit": PIN, "path": "LICENSE",
                         "license": "GPL-3.0", "file": "LICENSE.golangci-lint.txt", "sha256": digest(license_raw),
                         "modifications": "None; byte-for-byte license archive only; no donor code or fixtures copied"},
               "archives": [{"file": f, **evidence((DEST / f).read_bytes())} for f in archives],
               "archiveCommands": [{"file": "L04-build-metadata.txt", "argv": [go, "version", "-m", binary], "exit": build.returncode},
                                   {"file": "L04-go-version.txt", "argv": [go, "version"], "exit": goversion.returncode}],
               "cases": [{"name": r["name"], "file": r["file"], "exit": r["termination"]["code"], **r["eof"]} for r in records],
               "jsonInventory": inventory, "approvedSavingsBytes": 0,
               "layoutMeasurements": whitespace_candidates,
               "measurementControls": {"nativeClean": {"case": "L04-json-clean", "diagnostics": len(clean_issues)},
                                       "layout": {"input": layout_control.decode(), "output": control_result.decode(),
                                                  "savedBytes": len(layout_control) - len(control_result)},
                                       "nativeDirty": {"case": "L04-json-exit-zero", "diagnostics": len(dirty_issues),
                                                       "linters": sorted({i["FromLinter"] for i in dirty_issues})},
                                       "hashControl": {"original": digest(dirty_raw), "altered": digest(dirty_raw + b"x"),
                                                       "detected": digest(dirty_raw) != digest(dirty_raw + b"x")}},
               "coverage": {"cases": len(records), "nativeBytes": sum(r["inputBytes"] for r in records)}}
    manifest = {"schema": "hugr-lean/native-cases/1", "family": "golangci-lint", "baseline": BASE,
                "cases": records, "archives": archives}
    (DEST / "cases.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    (DEST / "capture-receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
