#!/usr/bin/env python3
"""P03 native capture recipe; writes only this fixture directory and a fresh temp root."""
import hashlib
import json
import os
from pathlib import Path
import platform
import shlex
import shutil
import subprocess
import sys
import tempfile

OUT = Path(__file__).resolve().parent
RESUME = len(sys.argv) >= 2
EXTRAS = len(sys.argv) == 3 and sys.argv[2] == "--extras"
ROOT = Path(sys.argv[1]) if RESUME else Path(tempfile.mkdtemp(prefix="p03-yarn-", dir="/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode"))
CASES = json.loads((OUT / "cases.json").read_text())["cases"] if RESUME else []
if RESUME and not EXTRAS:
    attempts = []
    for case in CASES:
        if case["name"].startswith("P03/berry"):
            if "file" in case:
                raw_path = OUT / case.pop("file")
                case["output"] = raw_path.read_bytes().decode("utf-8")
                raw_path.unlink()
            attempts.append(case)
    archive = OUT / "capture-attempts.json"
    prior = json.loads(archive.read_text())["cases"] if archive.exists() else []
    archive.write_text('{\n  "schema":"hugr-lean/native-cases/1",\n  "cases":[\n' +
        ',\n'.join('    ' + json.dumps(c, ensure_ascii=False, separators=(',', ':')) for c in prior + attempts) + '\n  ]\n}\n')
    CASES = [case for case in CASES if not case["name"].startswith("P03/berry")]
PLATFORM = platform.platform()
NODE = subprocess.check_output(["node", "--version"], text=True).strip()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value if isinstance(value, str) else json.dumps(value, indent=2) + "\n")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def env_for(flavor):
    env = {k: v for k, v in os.environ.items() if not k.startswith(("YARN_", "npm_config_", "NPM_CONFIG_"))}
    env.update(PATH=str(ROOT / flavor / "node_modules/.bin") + os.pathsep + os.environ["PATH"],
               HOME=str(ROOT / "home"), CI="1", NO_COLOR="1", COREPACK_ENABLE_PROJECT_SPEC="0")
    if flavor == "berry":
        env.update(YARN_IGNORE_PATH="1", YARN_ENABLE_GLOBAL_CACHE="0", YARN_ENABLE_COLORS="0",
                   YARN_ENABLE_TELEMETRY="0", YARN_ENABLE_IMMUTABLE_INSTALLS="0",
                   YARN_CACHE_FOLDER=str(ROOT / "berry-cache"))
    return env


def capture(flavor, name, project, args, extra=None):
    argv = ["yarn", *args]
    env = env_for(flavor)
    env.update(extra or {})
    result = subprocess.run(argv, cwd=project, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=120)
    raw = result.stdout
    version = subprocess.check_output(["yarn", "--version"], cwd=project, env=env, text=True).strip()
    case = dict(name="P03/" + name, family="yarn-install", command=shlex.join(argv),
                status="passthrough", version="yarn " + version + "; Node " + NODE,
                platform=PLATFORM, termination=dict(kind="exited", code=result.returncode),
                completeness="complete", presentation="unknown")
    if raw.endswith(b"\n"):
        case["file"] = name + ".txt"
        (OUT / case["file"]).write_bytes(raw)
    else:
        case["output"] = raw.decode("utf-8")
    case["provenance"] = dict(producer="capture.py", argv=argv, cwd=str(project),
        executable=str(Path(shutil.which("yarn", path=env["PATH"])).resolve()),
        sha256=digest(raw), boundary="shared stdout/stderr OS pipe through EOF; exit observed",
        environment={k: env[k] for k in ["PATH", "HOME", "CI", "NO_COLOR", "COREPACK_ENABLE_PROJECT_SPEC"] + sorted(k for k in env if k.startswith("YARN_"))})
    CASES.append(case)
    write(OUT / "cases.json", '{\n  "schema":"hugr-lean/native-cases/1",\n  "cases":[\n' +
          ',\n'.join('    ' + json.dumps(c, ensure_ascii=False, separators=(',', ':')) for c in CASES) + '\n  ]\n}\n')
    print(name, result.returncode, len(raw), flush=True)


def project(flavor, name, dependencies=None, **fields):
    path = ROOT / flavor / "projects" / name
    manifest = dict(name="p03-" + name, version="1.0.0", private=True, license="MIT",
                    dependencies=dependencies or {})
    manifest.update(fields)
    write(path / "package.json", manifest)
    if flavor == "berry":
        write(path / ".yarnrc.yml", "nodeLinker: node-modules\nnpmRegistryServer: https://registry.npmjs.org\n")
        write(path / "yarn.lock", "")
    return path


for flavor, pin in [("classic", "yarn@1.22.22"), ("berry", "@yarnpkg/cli-dist@4.10.3")]:
    if RESUME:
        continue
    tool = ROOT / flavor
    write(tool / "package.json", dict(private=True))
    bootstrap = subprocess.run(["npm", "install", "--prefix", str(tool), "--ignore-scripts", "--no-audit",
        "--no-fund", "--registry=https://registry.npmjs.org", "--save-exact", pin],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
    write(OUT / (flavor + "-tooling.txt"), bootstrap.stdout.decode())
    if bootstrap.returncode:
        raise RuntimeError("tool bootstrap failed: " + flavor)
    shutil.copyfile(tool / "package-lock.json", OUT / (flavor + "-tooling-lock.json"))

write(ROOT / "home/.yarnrc", 'registry "https://registry.npmjs.org"\ndisable-self-update-check true\n')
for flavor in ["classic", "berry"]:
    if EXTRAS:
        continue
    if RESUME and flavor == "classic":
        continue
    local = ROOT / flavor / "local"
    write(local / "package.json", dict(name="p03-local", version="1.0.0", license="MIT",
         deprecated="P03 local deprecation evidence", peerDependencies={"p03-missing-peer": "^2.0.0"}))
    write(local / "index.js", "module.exports = 1;\n")
    deps = {"p03-local": "file:" + str(local)}
    safe = ["--ignore-scripts", "--no-default-rc", "--registry", "https://registry.npmjs.org",
            "--cache-folder", str(ROOT / "classic-cache")] if flavor == "classic" else ["--mode=skip-build"]
    plain = project(flavor, "plain", deps)
    capture(flavor, flavor + "-fresh-peer", plain, ["install", *safe])
    capture(flavor, flavor + "-cached", plain, ["install", *safe])
    offline = ["--offline"] if flavor == "classic" else []
    network = {} if flavor == "classic" else {"YARN_ENABLE_NETWORK": "0"}
    capture(flavor, flavor + "-offline", plain, ["install", *safe, *offline], network)
    frozen = ["--frozen-lockfile"] if flavor == "classic" else ["--immutable", "--immutable-cache"]
    capture(flavor, flavor + "-frozen", plain, ["install", *safe, *offline, *frozen], network)
    manifest = json.loads((plain / "package.json").read_text())
    manifest["dependencies"]["chalk"] = "4.1.2"
    write(plain / "package.json", manifest)
    capture(flavor, flavor + "-frozen-mismatch", plain, ["install", *safe, *offline, *frozen], network)
    missing = project(flavor, "missing-lock", deps)
    capture(flavor, flavor + "-frozen-missing", missing, ["install", *safe, *offline, *frozen], network)
    workspace = project(flavor, "workspace", workspaces=["packages/*"])
    write(workspace / "packages/child/package.json", dict(name="p03-child", version="1.0.0",
          license="MIT", dependencies=deps))
    capture(flavor, flavor + "-workspace", workspace, ["install", *safe, *offline], network)
    capture(flavor, flavor + "-workspace-frozen", workspace, ["install", *safe, *offline, *frozen], network)
    collision = project(flavor, "collision", scripts={"postinstall": "node collision.cjs"})
    text = "[1/4] Resolving packages...\n[2/4] Fetching packages...\nDone in 0.01s.\nP03 lifecycle evidence WITHOUT LF" if flavor == "classic" else "➤ YN0000: ┌ Resolution step\n➤ YN0000: └ Completed\n➤ YN0000: Done in 0s\nP03 lifecycle evidence WITHOUT LF"
    write(collision / "collision.cjs", "process.stdout.write(" + json.dumps(text) + ");\n")
    enabled = safe[1:] if flavor == "classic" else ["--inline-builds"]
    capture(flavor, flavor + "-lifecycle-collision", collision, ["install", *enabled])
    capture(flavor, flavor + "-lifecycle-disabled", collision, ["install", *safe])
    chalk = project(flavor, "chalk", {"chalk": "4.1.2"})
    capture(flavor, flavor + "-chalk-fresh", chalk, ["install", *safe])
    # Delete only capture-owned node_modules to exercise cached fetch/link, retaining lock/cache.
    shutil.rmtree(chalk / "node_modules", ignore_errors=True)
    capture(flavor, flavor + "-chalk-offline-frozen", chalk, ["install", *safe, *offline, *frozen], network)
    if flavor == "berry":
        hook = project(flavor, "plugin-hook")
        write(hook / "hook.cjs", "module.exports = {name:'p03-hook',factory:()=>({hooks:{afterAllInstalled:async()=>{process.stdout.write('➤ YN0000: ┌ Resolution step\\n➤ YN0000: └ Completed\\nP03 plugin hook evidence\\n')}}})};\n")
        write(hook / ".yarnrc.yml", "nodeLinker: node-modules\nplugins:\n  - path: ./hook.cjs\n")
        capture(flavor, "berry-plugin-hook-skip-builds", hook, ["install", *safe])

classic = ROOT / "classic/projects/chalk"
capture("classic", "classic-deprecated-flag", classic, ["install", "--ignore-scripts", "--no-default-rc",
    "--cache-folder", str(ROOT / "classic-cache"), "--offline", "--dev"])
berry = ROOT / "berry/projects/chalk"
capture("berry", "berry-deprecated-flag", berry, ["install", "--mode=skip-build", "--frozen-lockfile"],
    {"YARN_ENABLE_NETWORK": "0"})

# Preserve tiny source projects/locks/configs, excluding caches, installed dependencies and artifacts.
for flavor in ["classic", "berry"]:
    for base in [ROOT / flavor / "local", ROOT / flavor / "projects"]:
        for path in base.rglob("*"):
            relative = path.relative_to(ROOT)
            if path.is_file() and not any(part in {"node_modules", ".yarn"} for part in relative.parts):
                destination = OUT / "projects" / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, destination)
write(OUT / "capture-context.json", dict(root=str(ROOT), platform=PLATFORM, node=NODE,
      producerSha256=digest(Path(__file__).read_bytes()), boundary="pipe, no PTY, no ANSI stripping, no newline rewriting"))
