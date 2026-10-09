"""L11 native artifact collector; no package checks or public-filter invocation."""
import base64
import datetime
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
INSTALL = Path(sys.argv[1]).resolve()
PROVENANCE_ONLY = "--provenance-only" in sys.argv[2:]
PROJECT = INSTALL / "project"
BIN = INSTALL / "node_modules/.bin/markdownlint-cli2"
PACKAGES = {
    "markdownlint-cli2": ("0.23.3", "916ad0aaa108c64d294101002066f530ea170b10", ""),
    "markdownlint": ("0.41.1", "e41e5a40ba934f079da0ffbdea0309869c034d47", ""),
    "markdownlint-cli2-formatter-default": (
        "0.0.6", "613b0e9e64eac8e51f0cdc645af0a6026f6cdf50", "formatter-default/"
    ),
    "markdownlint-cli2-formatter-json": (
        "0.0.10", "24710a7febf3eb8b05a34da9078b40fa2133125b", "formatter-json/"
    ),
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def artifact(path):
    data = path.read_bytes()
    return {"file": str(path.relative_to(HERE)), "sha256": sha(data),
            "bytesUtf8": len(data), "endsWithLF": data.endswith(b"\n"),
            "tailHex": data[-32:].hex()}


if PROJECT.exists() and not PROVENANCE_ONLY:
    raise SystemExit("Use a fresh install directory: project already exists")
if not PROVENANCE_ONLY:
    shutil.copytree(HERE / "project", PROJECT)
shutil.copyfile(INSTALL / "package.json", HERE / "package.json")
shutil.copyfile(INSTALL / "package-lock.json", HERE / "package-lock.json")
lock = json.loads((HERE / "package-lock.json").read_text())
env = os.environ.copy()
env.update({"NO_COLOR": "1", "FORCE_COLOR": "0", "TERM": "dumb"})
receipt = {
    "schema": "hugr-lean/native-capture/1", "family": "markdownlint", "packet": "L11",
    "capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "baseline": "63d3ece6f0a3f2963322149294f6dcc8bf197d47",
    "platform": platform.platform(), "cwd": str(PROJECT),
    "node": subprocess.check_output(["node", "--version"]).decode().strip(),
    "npm": subprocess.check_output(["npm", "--version"]).decode().strip(),
    "environmentOverrides": {k: env[k] for k in ("NO_COLOR", "FORCE_COLOR", "TERM")},
    "boundary": "subprocess.Popen argv (shell=False), stdout=PIPE, stderr=STDOUT; one OS pipe, bytes untouched",
    "stdin": "DEVNULL", "tty": False, "timeoutSeconds": 30,
    "packages": [], "cases": [], "candidates": [],
}
if PROVENANCE_ONLY:
    receipt = json.loads((HERE / "capture-receipt.json").read_text())
    receipt["packages"] = []
for name, (version, commit, prefix) in PACKAGES.items():
    package_dir = INSTALL / "node_modules" / name
    installed = json.loads((package_dir / "package.json").read_text())
    if installed["version"] != version:
        raise SystemExit(f"Installed version mismatch: {name}")
    metadata = json.loads(subprocess.check_output([
        "npm", "view", f"{name}@{version}", "version", "gitHead", "license",
        "repository", "dist", "--json"
    ]))
    if metadata["gitHead"] != commit or metadata["license"] != "MIT":
        raise SystemExit(f"Registry pin mismatch: {name}")
    tarball = urllib.request.urlopen(metadata["dist"]["tarball"], timeout=30).read()
    sri = "sha512-" + base64.b64encode(hashlib.sha512(tarball).digest()).decode()
    if sri != metadata["dist"]["integrity"] or sri != lock["packages"][f"node_modules/{name}"]["integrity"]:
        raise SystemExit(f"SRI mismatch: {name}")
    write_json(HERE / f"npm-{name}.json", metadata)
    license_path = HERE / f"LICENSE-{name}.txt"
    shutil.copyfile(package_dir / "LICENSE", license_path)
    inventory = []
    for path in sorted(package_dir.rglob("*")):
        if path.is_file():
            inventory.append({"path": str(path.relative_to(package_dir)),
                              "sha256": sha(path.read_bytes())})
    receipt["packages"].append({
        "name": name, "version": version, "gitCommit": commit,
        "repository": metadata["repository"]["url"], "license": "MIT",
        "tarball": metadata["dist"]["tarball"], "sri": sri,
        "tarballSha256": sha(tarball), "installedFiles": inventory,
        "licenseCopy": {**artifact(license_path), "sourcePath": prefix + "LICENSE", "modifications": "none"},
    })

# Small, verbatim source/doc windows. Full installed source hashes above bind paths.
windows = [
    ("markdownlint-cli2-formatter-default", "markdownlint-cli2-formatter-default.js", "formatter-default/markdownlint-cli2-formatter-default.js", [(7, 23)]),
    ("markdownlint-cli2", "README.md", "README.md", [(232, 259), (261, 265), (394, 414), (495, 502)]),
    ("markdownlint", "doc/CustomRules.md", "doc/CustomRules.md", [(87, 101), (124, 148)]),
    ("markdownlint-cli2", "markdownlint-cli2.mjs", "markdownlint-cli2.mjs", [(48, 48), (1061, 1065), (1091, 1104), (1112, 1128)]),
    ("markdownlint-cli2-formatter-json", "README.md", "formatter-json/README.md", [(15, 37)]),
    ("markdownlint-cli2-formatter-json", "markdownlint-cli2-formatter-json.js", "formatter-json/markdownlint-cli2-formatter-json.js", [(15, 27)]),
]
evidence = ["# Pinned producer evidence", "", "Verbatim line windows; headings added. License MIT for all windows.", ""]
for name, installed_path, repo_path, ranges in windows:
    text = (INSTALL / "node_modules" / name / installed_path).read_text().splitlines()
    commit = PACKAGES[name][1]
    for start, end in ranges:
        evidence.extend([f"## {name}@{commit} `{repo_path}` L{start}-L{end}", "", "```text",
                         *text[start - 1:end], "```", ""])
(HERE / "SOURCE-EVIDENCE.md").write_text("\n".join(evidence))
receipt["sourceEvidence"] = {**artifact(HERE / "SOURCE-EVIDENCE.md"),
                            "modifications": "selected verbatim line windows; Markdown headings/fences added"}
receipt["projectSources"] = [
    artifact(path) for path in sorted((HERE / "project").rglob("*")) if path.is_file()
]
if PROVENANCE_ONLY:
    manifest = json.loads((HERE / "cases.json").read_text())
    for case in manifest["cases"]:
        case["presentation"] = "unknown"
    for case in receipt["cases"]:
        case["presentation"] = "unknown"
    manifest["archives"] = [f"LICENSE-{name}.txt" for name in PACKAGES] + ["success.progress-candidate.txt"]
    write_json(HERE / "cases.json", manifest)
    write_json(HERE / "capture-receipt.json", receipt)
    raise SystemExit(0)

specs = [
    ("success", ["clean.md"]),
    ("errors", ["errors.md"]),
    ("multifile-unicode", ["clean.md", "errors.md", "path spaces/café 🧪.md"]),
    ("custom-rule", ["--config", "custom.markdownlint-cli2.jsonc", "path spaces/café 🧪.md"]),
    ("config-ignore", ["--config", "ignore.markdownlint-cli2.jsonc", "**/*.md"]),
    ("glob-ignore", ["**/*.md", "#ignored/**"]),
    ("config-invalid", ["--config", "invalid.markdownlint-cli2.jsonc", "clean.md"]),
    ("config-missing", ["--config", "missing.markdownlint-cli2.jsonc", "clean.md"]),
    ("literal-missing", [":missing.md"]),
    ("json-file", ["--config", "json-file.markdownlint-cli2.jsonc", "errors.md", "path spaces/café 🧪.md"]),
    ("json-stdout-errors", ["--config", "json-stdout.markdownlint-cli2.jsonc", "errors.md", "path spaces/café 🧪.md"]),
    ("json-stdout-success", ["--config", "json-stdout.markdownlint-cli2.jsonc", "clean.md"]),
    ("reporter-collision", ["--config", "collision.markdownlint-cli2.jsonc", "clean.md"]),
]
version = "markdownlint-cli2 0.23.3 (markdownlint 0.41.1)"
cases = []
for slug, args in specs:
    argv = [str(BIN), *args]
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    proc = subprocess.Popen(argv, cwd=PROJECT, env=env, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        data, _ = proc.communicate(timeout=30)
        termination = {"kind": "exited", "code": proc.returncode}
    except subprocess.TimeoutExpired:
        proc.kill()
        data, _ = proc.communicate()
        termination = {"kind": "timeout"}
    path = HERE / f"{slug}.txt"
    path.write_bytes(data)
    case_id = "L11-" + slug
    record = {"id": case_id, "argv": argv, "command": shlex.join(argv),
              "startedAt": started, "termination": termination, "completeness": "complete" if termination["kind"] == "exited" else "incomplete",
              "presentation": "unknown", **artifact(path)}
    if slug == "json-file":
        report = HERE / "requested-results.json"
        shutil.copyfile(PROJECT / "requested-results.json", report)
        record["sideArtifacts"] = [artifact(report)]
    receipt["cases"].append(record)
    cases.append({"name": case_id, "family": "markdownlint", "version": version,
                  "platform": receipt["platform"], "completeness": record["completeness"],
                  "presentation": "unknown", "termination": termination, "status": "passthrough",
                  "command": record["command"], "file": path.name,
                  "provenance": {"sha256": sha(data), "record": "capture-receipt.json", "originalCase": case_id}})
    print(f"{case_id}: exit={proc.returncode}, bytes={len(data)}, eofLF={data.endswith(bytes([10]))}")

# Hypothetical candidate, never a golden/public-filter result. Retain totals and banner.
original = (HERE / "success.txt").read_bytes()
candidate = b"".join(line for line in original.splitlines(keepends=True)
                     if not line.startswith((b"Finding: ", b"Linting: ")))
candidate_path = HERE / "success.progress-candidate.txt"
candidate_path.write_bytes(candidate)
receipt["candidates"].append({**artifact(candidate_path), "input": "success.txt",
                              "savedBytesUtf8": len(original) - len(candidate),
                              "approved": False, "reason": "Producer-owned progress is not authenticated; reporter collision retained"})
archives = [f"LICENSE-{name}.txt" for name in PACKAGES] + [candidate_path.name]
write_json(HERE / "cases.json", {"schema": "hugr-lean/native-cases/1", "family": "markdownlint",
                                 "archives": archives, "cases": cases})
write_json(HERE / "capture-receipt.json", receipt)
