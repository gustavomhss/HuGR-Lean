#!/usr/bin/env python3
"""Capture only P03 supplement; preserve historical recipe and observations."""
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

OUT = Path(__file__).resolve().parent
ROOT = Path(tempfile.mkdtemp(prefix="p03-supplement-", dir="/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode"))
RECEIPTS = []
CASES = []


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n" if not isinstance(value, str) else value)


def run(argv, cwd, env, name):
    launcher = shutil.which(argv[0], path=env["PATH"])
    if not launcher:
        raise RuntimeError("launcher missing: " + argv[0])
    result = subprocess.run(argv, cwd=cwd, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=120)
    raw = result.stdout
    filename = "supplement-" + name + ".txt"
    (OUT / filename).write_bytes(raw)
    receipt = dict(name=name, argv=argv, command=shlex.join(argv), cwd=str(cwd),
                   launcher=launcher, executable=str(Path(launcher).resolve()),
                   executableSha256=sha(Path(launcher).resolve().read_bytes()),
                   environment={k: v for k, v in env.items() if k in
                                {"PATH", "HOME", "CI", "NO_COLOR", "COREPACK_ENABLE_PROJECT_SPEC"}
                                or k.startswith("YARN_")}, file=filename, sha256=sha(raw), bytes=len(raw),
                   eof="LF" if raw.endswith(b"\n") else "no-LF",
                   termination=dict(kind="exited", code=result.returncode),
                   completeness="complete", presentation="unknown",
                   boundary="shared stdout/stderr OS pipe through EOF; exit observed")
    RECEIPTS.append(receipt)
    print(name, result.returncode, len(raw), flush=True)
    return result, receipt


BASE = {k: v for k, v in os.environ.items()
        if not k.startswith(("YARN_", "npm_config_", "NPM_CONFIG_"))}
BASE.update(HOME=str(ROOT / "home"), CI="1", NO_COLOR="1", COREPACK_ENABLE_PROJECT_SPEC="0")
(ROOT / "home").mkdir()
NODE = subprocess.check_output(["node", "--version"], text=True).strip()
NPM = subprocess.check_output(["npm", "--version"], text=True).strip()
METADATA = []
for name, version in [("inflight", "1.0.6"), ("once", "1.4.0"), ("wrappy", "1.0.2")]:
    url = "https://registry.npmjs.org/" + name + "/" + version
    with urllib.request.urlopen(url, timeout=30) as response:
        raw = response.read()
    filename = "supplement-" + name + "-metadata.json"
    (OUT / filename).write_bytes(raw)
    metadata = json.loads(raw)
    METADATA.append(dict(name=name, version=version, url=url, file=filename,
                         sha256=sha(raw), license=metadata["license"],
                         dist=metadata["dist"], dependencies=metadata.get("dependencies", {}),
                         deprecated=metadata.get("deprecated")))

for flavor, package, version in [("classic", "yarn", "1.22.22"),
                                 ("berry", "@yarnpkg/cli-dist", "4.10.3")]:
    tool = ROOT / flavor / "tool"
    # Historical tooling locks have absolute-path package keys. Preserve them and
    # derive a conventional npm-ci lock from their exact pinned registry entries.
    historical = json.loads((OUT / (flavor + "-tooling-lock.json")).read_text())
    entry = next(v for k, v in historical["packages"].items() if k and v.get("version") == version)
    manifest = dict(name="p03-supplement-" + flavor + "-tool", private=True,
                    dependencies={package: version})
    lock = dict(name=manifest["name"], lockfileVersion=3, requires=True,
                packages={"": {"name": manifest["name"], "dependencies": manifest["dependencies"]},
                          "node_modules/" + package: entry})
    write(tool / "package.json", manifest)
    write(tool / "package-lock.json", lock)
    write(OUT / "supplement-projects" / flavor / "tool/package.json", manifest)
    write(OUT / "supplement-projects" / flavor / "tool/package-lock.json", lock)
    result, _ = run(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund",
                     "--registry=https://registry.npmjs.org"], tool, BASE, flavor + "-tooling")
    if result.returncode:
        raise RuntimeError("tooling failed: " + flavor)
    env = dict(BASE, PATH=str(tool / "node_modules/.bin") + os.pathsep + BASE["PATH"])
    if flavor == "berry":
        env.update(YARN_IGNORE_PATH="1", YARN_ENABLE_GLOBAL_CACHE="0", YARN_ENABLE_COLORS="0",
                   YARN_ENABLE_TELEMETRY="0", YARN_ENABLE_IMMUTABLE_INSTALLS="0")
    result, _ = run(["yarn", "--version"], tool, env, flavor + "-version")
    if result.returncode or result.stdout.decode().strip() != version:
        raise RuntimeError("wrong Yarn version")
    project = ROOT / flavor / "project"
    write(project / "package.json", dict(name="p03-supplement-" + flavor, version="1.0.0",
                                         private=True, license="MIT", dependencies={"inflight": "1.0.6"}))
    if flavor == "berry":
        write(project / ".yarnrc.yml", "nodeLinker: node-modules\nnpmRegistryServer: https://registry.npmjs.org\nenableScripts: false\n")
        write(project / "yarn.lock", "")
    for offline in [False, True]:
        cache = ROOT / flavor / ("cold-cache" if offline else "online-cache")
        cache.mkdir()
        if any(cache.iterdir()):
            raise RuntimeError("cache not fresh")
        if offline:
            shutil.rmtree(project / "node_modules")
            if flavor == "berry":
                shutil.rmtree(project / ".yarn")
        flags = (["--ignore-scripts", "--no-default-rc", "--registry", "https://registry.npmjs.org",
                  "--cache-folder", str(cache)] if flavor == "classic" else ["--mode=skip-build"])
        current_env = dict(env)
        if flavor == "berry":
            current_env["YARN_CACHE_FOLDER"] = str(cache)
        if offline:
            flags += ["--offline", "--frozen-lockfile"] if flavor == "classic" else ["--immutable", "--immutable-cache"]
            if flavor == "berry":
                current_env["YARN_ENABLE_NETWORK"] = "0"
        name = flavor + ("-cold-cache-offline-miss" if offline else "-dependency-deprecation")
        result, receipt = run(["yarn", "install", *flags], project, current_env, name)
        if (not offline and result.returncode != 0) or (offline and result.returncode == 0):
            raise RuntimeError("unexpected install outcome: " + name)
        case = dict(name="P03/supplement-" + name, family="yarn-install", command=receipt["command"],
                    status="passthrough", version="yarn " + version + "; Node " + NODE,
                    platform=platform.platform(), termination=receipt["termination"],
                    completeness="complete", presentation="unknown", file=receipt["file"],
                    provenance=dict(producer="supplement.py", argv=receipt["argv"], cwd=receipt["cwd"],
                                    executable=receipt["executable"], sha256=receipt["sha256"],
                                    boundary=receipt["boundary"], environment=receipt["environment"]))
        CASES.append(case)
    for filename in ["package.json", "yarn.lock", ".yarnrc.yml"]:
        if (project / filename).exists():
            destination = OUT / "supplement-projects" / flavor / "project" / filename
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(project / filename, destination)

# Append observations without reserializing historical rows or touching archives.
path = OUT / "cases.json"
original = path.read_text()
existing = json.loads(original)
if set(c["name"] for c in existing["cases"]) & set(c["name"] for c in CASES):
    raise RuntimeError("supplement IDs already exist")
marker = original.rfind("\n  ]")
if marker < 0:
    raise RuntimeError("missing cases delimiter")
path.write_text(original[:marker] + ",\n" + ",\n".join("    " + json.dumps(c, separators=(",", ":"), ensure_ascii=False) for c in CASES) + original[marker:])
updated = json.loads(path.read_text())
updated["archives"] += [r["file"] for r in RECEIPTS if r["file"] not in {c["file"] for c in CASES}]
# Change only archive declaration; history remains byte-identical otherwise.
path.write_text(path.read_text().replace(json.dumps(existing["archives"]), json.dumps(updated["archives"]), 1))
write(OUT / "supplement-receipts.json", dict(root=str(ROOT), node=NODE, npm=NPM,
      platform=platform.platform(), producerSha256=sha(Path(__file__).read_bytes()),
      metadata=METADATA, executions=RECEIPTS,
      artifacts=[dict(file=str(p.relative_to(OUT)), sha256=sha(p.read_bytes()))
                 for p in sorted((OUT / "supplement-projects").rglob("*")) if p.is_file()]))
