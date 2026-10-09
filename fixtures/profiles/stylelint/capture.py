#!/usr/bin/env python3
"""Capture only. Run with an unused absolute isolated-project directory argument."""
import base64
import hashlib
import json
import os
from pathlib import Path
import platform
import shlex
import shutil
import subprocess
import sys
import urllib.request

HERE = Path(__file__).resolve().parent
PROJECT = Path(sys.argv[1]).resolve()
VERSION = "16.25.0"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def execute(argv, cwd=PROJECT):
    return subprocess.run(argv, cwd=cwd, env=ENV, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, timeout=90, check=False)


if PROJECT.exists():
    raise SystemExit("Refusing to overwrite an existing isolated project")
PROJECT.mkdir(parents=False)
ENV = dict(os.environ, NO_COLOR="1", FORCE_COLOR="0", TERM="dumb")
ENV.pop("NODE_OPTIONS", None)
metadata = json.loads(urllib.request.urlopen(
    f"https://registry.npmjs.org/stylelint/{VERSION}").read())
tarball = urllib.request.urlopen(metadata["dist"]["tarball"]).read()
actual_sri = "sha512-" + base64.b64encode(hashlib.sha512(tarball).digest()).decode()
if actual_sri != metadata["dist"]["integrity"]:
    raise SystemExit("Pinned npm tarball SRI mismatch")
write_json(PROJECT / "package.json", {
    "name": "l09-isolated-capture", "version": "1.0.0", "private": True,
    "devDependencies": {"stylelint": VERSION}})
install_argv = ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"]
installed = execute(install_argv)
(HERE / "install.log").write_bytes(installed.stdout)
if installed.returncode:
    raise SystemExit(f"npm install failed: {installed.returncode}; see install.log")
shutil.copyfile(PROJECT / "package-lock.json", HERE / "package-lock.json")
producer = PROJECT / "node_modules/stylelint"
shutil.copyfile(producer / "LICENSE", HERE / "LICENSE-STYLELINT.txt")
write_json(HERE / "producer.json", {
    "name": "stylelint", "version": VERSION, "repository": metadata["repository"],
    "commit": metadata["gitHead"], "license": metadata["license"],
    "tarball": metadata["dist"]["tarball"], "integrity": actual_sri,
    "tarballSha256": digest(tarball), "licenseSource": "package/LICENSE",
    "licenseSha256": digest((HERE / "LICENSE-STYLELINT.txt").read_bytes()),
    "modifications": "License copied verbatim; no donor parser or fixture copied.",
    "installArgv": install_argv, "installExitCode": installed.returncode,
    "installOutputSha256": digest(installed.stdout)})

sources = {
    "clean.css": "a { color: #fff; }\n",
    "errors.css": "a { colour: #ggg; color: #zzzzzz; }\n",
    "warning.css": "a { color: #zzzzzz; }\n",
    "paths with spaces/café 🧪.css": '/* 🧪 café */\na { content: "🧪"; color: #ggg; colour: red; }\n',
    "syntax.css": "a { color: red;\n",
    "fix.css": "a { color: #ffffff; color: #zzzzzz; }\n",
    "fix-clean.css": "a { color: #ffffff; }\n",
    "stylelint.config.cjs": "module.exports = { rules: { 'color-no-invalid-hex': true, 'property-no-unknown': true, 'color-hex-length': 'short' } };\n",
    "warning.config.cjs": "module.exports = { rules: { 'color-no-invalid-hex': [true, { severity: 'warning' }] } };\n",
    "bad.config.cjs": "module.exports = { rules: { 'capture-rule-does-not-exist': true } };\n",
    "broken.config.cjs": "module.exports = { rules: ;\n",
    "collision.config.cjs": "console.log('1 source checked\n  0 problems found');\nmodule.exports = { rules: { 'color-no-invalid-hex': true } };\n".replace("checked\n", "checked\\n"),
    "plugin.cjs": "const stylelint = require('stylelint');\nmodule.exports = stylelint.createPlugin('capture/collision', () => () => { console.log('1 source checked\\n  0 problems found'); });\nmodule.exports.ruleName = 'capture/collision';\n",
    "plugin.config.cjs": "module.exports = { plugins: ['./plugin.cjs'], rules: { 'capture/collision': true } };\n",
}
for name, text in sources.items():
    local = HERE / "source" / name
    local.parent.mkdir(parents=True, exist_ok=True)
    local.write_bytes(text.encode())
    target = PROJECT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(text.encode())

cli = str(PROJECT / "node_modules/.bin/stylelint")
version_result = execute([cli, "--version"])
if version_result.returncode or version_result.stdout.strip() != VERSION.encode():
    raise SystemExit("Installed producer version mismatch")
specs = [
    ("native-success", ["clean.css"], "no-noise"),
    ("native-errors", ["errors.css"], "unsafe-nonzero"),
    ("native-warning", ["warning.css", "--config", "warning.config.cjs"], "unimplemented"),
    ("native-multifile-unicode", ["clean.css", "errors.css", "paths with spaces/café 🧪.css"], "unsafe-nonzero"),
    ("native-verbose-warning", ["warning.css", "--config", "warning.config.cjs", "--formatter", "verbose"], "unimplemented"),
    ("native-syntax", ["syntax.css"], "unsafe-nonzero"),
    ("config-missing", ["clean.css", "--config", "missing.config.cjs"], "unsafe-nonzero"),
    ("config-unknown-rule", ["clean.css", "--config", "bad.config.cjs"], "unsafe-nonzero"),
    ("config-syntax", ["clean.css", "--config", "broken.config.cjs"], "unsafe-nonzero"),
    ("json-success", ["clean.css", "--formatter", "json"], "unimplemented"),
    ("json-warning", ["warning.css", "--config", "warning.config.cjs", "--formatter", "json"], "unimplemented"),
    ("json-multifile-unicode", ["clean.css", "errors.css", "paths with spaces/café 🧪.css", "--formatter", "json"], "unsafe-nonzero"),
    ("json-syntax", ["syntax.css", "--formatter", "json"], "unsafe-nonzero"),
    ("native-fix-success", ["fix-clean.css", "--fix"], "no-noise"),
    ("native-fix-errors", ["fix.css", "--fix"], "unsafe-nonzero"),
    ("json-fix-success", ["fix-clean.css", "--fix", "--formatter", "json"], "unimplemented"),
    ("json-fix-errors", ["fix.css", "--fix", "--formatter", "json"], "unsafe-nonzero"),
    ("config-stdout-native", ["clean.css", "--config", "collision.config.cjs"], "unsafe-producer-collision"),
    ("config-stdout-json", ["clean.css", "--config", "collision.config.cjs", "--formatter", "json"], "unsafe-producer-collision"),
    ("plugin-stdout-native", ["clean.css", "--config", "plugin.config.cjs", "--formatter", "verbose"], "unsafe-producer-collision"),
    ("plugin-stdout-json", ["clean.css", "--config", "plugin.config.cjs", "--formatter", "json"], "unsafe-producer-collision"),
]
records, cases, candidates = [], [], []
for name, args, reason in specs:
    # Reset original sources before every capture; fix effects remain in per-case evidence.
    for source, text in sources.items():
        (PROJECT / source).write_bytes(text.encode())
    argv = [cli, *args]
    before = {p: (PROJECT / p).read_bytes() for p in sources if p.endswith(".css")}
    result = execute(argv)
    output = result.stdout
    (HERE / f"{name}.txt").write_bytes(output)
    effects = []
    if "--fix" in args:
        for source, original in before.items():
            after = (PROJECT / source).read_bytes()
            prefix = HERE / "effects" / name / source
            prefix.parent.mkdir(parents=True, exist_ok=True)
            prefix.with_name(prefix.name + ".before.css").write_bytes(original)
            prefix.with_name(prefix.name + ".after.css").write_bytes(after)
            effects.append({"source": source, "beforeSha256": digest(original),
                            "afterSha256": digest(after), "changed": original != after,
                            "before": str(prefix.with_name(prefix.name + ".before.css").relative_to(HERE)),
                            "after": str(prefix.with_name(prefix.name + ".after.css").relative_to(HERE))})
    record = {"id": f"L09-{name}", "argv": argv, "cwd": str(PROJECT),
              "file": f"{name}.txt", "exitCode": result.returncode,
              "sha256": digest(output), "bytes": len(output),
              "eof": {"endsWithLF": output.endswith(b"\n"), "tailHex": output[-16:].hex()},
              "reason": reason, "effects": effects}
    if name in ("json-success", "json-warning", "json-fix-success"):
        # Proposal only: preserve every JSON token byte; remove whitespace outside strings.
        compact = bytearray()
        quoted = escaped = False
        for byte in output:
            if quoted or byte not in b" \t\r\n":
                compact.append(byte)
            if quoted:
                if escaped:
                    escaped = False
                elif byte == 92:
                    escaped = True
                elif byte == 34:
                    quoted = False
            elif byte == 34:
                quoted = True
        if output.endswith(b"\n"):
            compact.append(10)
        if len(compact) < len(output):
            candidate_name = f"{name}.layout-candidate.txt"
            (HERE / candidate_name).write_bytes(compact)
            candidates.append({"input": f"{name}.txt", "file": candidate_name,
                               "approved": False, "inputBytes": len(output),
                               "candidateBytes": len(compact), "sha256": digest(compact)})
    records.append(record)
    cases.append({"name": record["id"], "family": "stylelint", "version": f"stylelint {VERSION}",
                  "platform": platform.platform(), "completeness": "complete", "presentation": "unknown",
                  "termination": {"kind": "exited", "code": result.returncode}, "status": "passthrough",
                  "command": shlex.join(argv), "file": record["file"],
                  "provenance": {"sha256": record["sha256"], "record": "capture-receipt.json",
                                 "originalCase": record["id"]}})
write_json(HERE / "capture-receipt.json", {
    "schema": "stylelint-native-capture/1", "platform": platform.platform(),
    "node": execute(["node", "--version"]).stdout.decode().strip(),
    "npm": execute(["npm", "--version"]).stdout.decode().strip(),
    "versionArgv": [cli, "--version"], "versionOutputHex": version_result.stdout.hex(),
    "boundary": "Single child pipe: stdout=PIPE, stderr=STDOUT; bytes untouched through process exit and pipe EOF; no PTY, decoding, normalization, shell, or formatter substitution.",
    "environment": {"NO_COLOR": "1", "FORCE_COLOR": "0", "TERM": "dumb", "NODE_OPTIONS": "unset"},
    "sources": [{"file": "source/" + p, "sha256": digest(t.encode())} for p, t in sources.items()],
    "cases": records, "candidates": candidates})
write_json(HERE / "cases.json", {"schema": "hugr-lean/native-cases/1", "family": "stylelint",
    "archives": ["LICENSE-STYLELINT.txt", *[c["file"] for c in candidates]], "cases": cases})
print(json.dumps({"project": str(PROJECT), "captures": [
    {"id": r["id"], "exit": r["exitCode"], "bytes": r["bytes"], "reason": r["reason"]} for r in records],
    "candidates": candidates}, indent=2))
