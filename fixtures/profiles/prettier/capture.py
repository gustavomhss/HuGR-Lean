"""Capture pinned local Prettier, without formatting or rewriting source files.

Run from any cwd: python3 fixtures/profiles/prettier/capture.py.
Artifacts are generated only beside this script. Dependencies use a fresh isolated copy.
Combined pipe preserves raw EOF and observed stream ordering, not producer identity.
"""
import hashlib
import json
import os
import platform
import shlex
import shutil
import subprocess
import tempfile
from pathlib import Path
from datetime import datetime, timezone

CASES = [
    ("version", ["prettier", "--version"]),
    ("check-clean", ["prettier", "--check", "clean.js"]),
    ("check-dirty", ["prettier", "--check", "dirty.js"]),
    ("check-multiple", ["prettier", "--check", "clean.js", "dirty.js", "space dir/雪 file.js"]),
    ("list-clean", ["prettier", "--list-different", "clean.js"]),
    ("list-multiple", ["prettier", "--list-different", "clean.js", "dirty.js", "space dir/雪 file.js"]),
    ("debug-clean", ["prettier", "--debug-check", "clean.js"]),
    ("debug-multiple", ["prettier", "--debug-check", "dirty.js", "space dir/雪 file.js"]),
    ("default-source", ["prettier", "dirty.js"]),
    ("syntax-check", ["prettier", "--check", "broken.js"]),
    ("syntax-list", ["prettier", "--list-different", "broken.js"]),
    ("syntax-debug", ["prettier", "--debug-check", "broken.js"]),
    ("config-failure", ["prettier", "--check", "--config", "bad.config.json", "clean.js"]),
    ("ignored", ["prettier", "--check", "ignored.js"]),
    ("no-files", ["prettier", "--check", "missing-*.js"]),
    ("no-files-allowed", ["prettier", "--check", "--no-error-on-unmatched-pattern", "missing-*.js"]),
    ("unknown-option", ["prettier", "--check", "--unknown-capture-flag", "clean.js"]),
    ("plugin-collision", ["prettier", "--check", "--plugin", "./collision.mjs", "clean.js"]),
    ("npx-check", ["npx", "prettier", "--check", "clean.js"]),
    ("npx-no-install-check", ["npx", "--no-install", "prettier", "--check", "clean.js"]),
    ("config-good", ["prettier", "--check", "--config", "good.config.json", "clean.js"]),
    ("default-clean", ["prettier", "clean.js"]),
    ("default-unicode", ["prettier", "space dir/雪 file.js"]),
    ("syntax-default", ["prettier", "broken.js"]),
    ("config-list", ["prettier", "--list-different", "--config", "bad.config.json", "clean.js"]),
    ("config-debug", ["prettier", "--debug-check", "--config", "bad.config.json", "clean.js"]),
    ("config-default", ["prettier", "--config", "bad.config.json", "clean.js"]),
    ("ignored-list", ["prettier", "--list-different", "ignored.js"]),
    ("ignored-debug", ["prettier", "--debug-check", "ignored.js"]),
    ("ignored-default", ["prettier", "ignored.js"]),
    ("no-files-list", ["prettier", "--list-different", "missing-*.js"]),
    ("no-files-debug", ["prettier", "--debug-check", "missing-*.js"]),
    ("no-files-default", ["prettier", "missing-*.js"]),
    ("plugin-list", ["prettier", "--list-different", "--plugin", "./collision.mjs", "clean.js"]),
    ("plugin-debug", ["prettier", "--debug-check", "--plugin", "./collision.mjs", "clean.js"]),
    ("plugin-default", ["prettier", "--plugin", "./collision.mjs", "clean.js"]),
    ("plugin-multiple", ["prettier", "--check", "--plugin", "./collision.mjs", "dirty.js", "space dir/雪 file.js"]),
    ("default-multiple", ["prettier", "clean.js", "dirty.js", "space dir/雪 file.js"]),
]
root = Path(__file__).resolve().parent
source_project = root / "project"
runtime = tempfile.TemporaryDirectory(prefix=".runtime-", dir=root)
project = Path(runtime.name) / "project"
shutil.copytree(source_project, project, ignore=shutil.ignore_patterns("node_modules", "package-lock.json"))
captures = root / "captures"
captures.mkdir(exist_ok=True)
env = dict(os.environ)
env["PATH"] = str(project / "node_modules" / ".bin") + os.pathsep + env["PATH"]
env["npm_config_cache"] = str(root / ".npm-cache")
env["npm_config_registry"] = "https://registry.npmjs.org/"
metadata_argv = ["npm", "view", "prettier@3.6.2", "version", "gitHead", "license", "dist", "--json",
                 "--registry=https://registry.npmjs.org/"]
metadata_raw = subprocess.check_output(metadata_argv, cwd=project, env=env, timeout=60)
(captures / "package-metadata.json").write_bytes(metadata_raw)
metadata = json.loads(metadata_raw)
assert metadata["version"] == "3.6.2" and metadata["license"] == "MIT"
install_argv = ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org/"]
install = subprocess.run(install_argv, cwd=project, env=env, stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, timeout=120)
(captures / "install.txt").write_bytes(install.stdout)
if install.returncode:
    raise SystemExit(f"Local install failed ({install.returncode}); see captures/install.txt")
(source_project / "package-lock.json").write_bytes((project / "package-lock.json").read_bytes())
assert json.loads((project / "package-lock.json").read_text())["packages"]["node_modules/prettier"]["integrity"] == metadata["dist"]["integrity"]
env["npm_config_offline"] = "true"
tool_version = subprocess.check_output(["prettier", "--version"], cwd=project, env=env).decode().strip()
assert tool_version == "3.6.2", tool_version
host = platform.system() + "-" + platform.machine() + "; " + platform.platform()
rows = []
manifest = []
for name, argv in CASES:
    process = subprocess.Popen(argv, cwd=project, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        output, _ = process.communicate(timeout=30)
        termination = {"kind": "exited", "code": process.returncode}
        completeness = "complete"
    except subprocess.TimeoutExpired:
        process.kill()
        output, _ = process.communicate()
        termination = {"kind": "timeout"}
        completeness = "incomplete"
    (captures / (name + ".txt")).write_bytes(output)
    digest = hashlib.sha256(output).hexdigest()
    rows.append({"name": "L05/" + name, "argv": argv, "command": shlex.join(argv),
                 "termination": termination, "completeness": completeness, "cwd": str(project),
                 "completionAt": datetime.now(timezone.utc).isoformat(),
                 "bytes": len(output), "sha256": digest,
                 "eof": "LF" if output.endswith(b"\n") else "empty" if not output else "no-LF"})
    manifest.append({"name": "L05/" + name, "family": "prettier", "argv": argv,
                     "command": shlex.join(argv), "file": "captures/" + name + ".txt",
                     "status": "passthrough", "termination": termination,
                     "completeness": completeness, "presentation": "plain",
                     "version": tool_version, "platform": host,
                     "provenance": {"captureReceipt": "capture-receipt.json", "record": "SOURCES.md",
                                    "case": "L05/" + name, "sha256": digest}})
sources = {}
for path in sorted(source_project.rglob("*")):
    if path.is_file() and "node_modules" not in path.parts:
        sources[str(path.relative_to(root))] = hashlib.sha256(path.read_bytes()).hexdigest()
receipt = {"platform": host, "version": tool_version,
           "node": subprocess.check_output(["node", "--version"], text=True).strip(),
           "npm": subprocess.check_output(["npm", "--version"], text=True).strip(),
           "boundary": "stdout PIPE + stderr STDOUT; raw bytes; no PTY; no trimming; no producer authentication",
           "toolSource": {"repository": "https://github.com/prettier/prettier", "commit": metadata["gitHead"],
                          "license": metadata["license"], "dist": metadata["dist"],
                          "metadataArgv": metadata_argv, "metadataFile": "captures/package-metadata.json",
                          "metadataSha256": hashlib.sha256(metadata_raw).hexdigest()},
           "install": {"argv": install_argv, "exit": install.returncode,
                       "file": "captures/install.txt", "sha256": hashlib.sha256(install.stdout).hexdigest()},
           "sourceSha256": sources,
           "collectorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
           "toolFiles": {str(path.relative_to(project)): hashlib.sha256(path.read_bytes()).hexdigest()
                         for path in [project / "node_modules/prettier/package.json",
                                      project / "node_modules/prettier/LICENSE",
                                      project / "node_modules/prettier/bin/prettier.cjs"]},
           "cases": rows}
for filename, data in [("capture-receipt.json", receipt),
                       ("cases.json", {"schema": "hugr-lean/native-cases/1", "cases": manifest})]:
    (root / filename).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Captured {len(rows)} native cases; artifacts in {captures}")
runtime.cleanup()
