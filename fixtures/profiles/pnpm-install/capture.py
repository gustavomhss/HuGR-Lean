"""Bounded native captures; original tiny projects, no parser or output normalization."""
import hashlib
import json
import os
from pathlib import Path
import platform
import signal
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = Path(sys.argv[1]) if len(sys.argv) == 2 else Path(tempfile.mkdtemp(prefix="p02-pnpm-", dir=HERE.parents[3]))
HOME = ROOT / "home"
HOME.mkdir(exist_ok=True)
ENV = {**os.environ, "HOME": str(HOME), "XDG_CONFIG_HOME": str(HOME),
       "npm_config_cache": str(ROOT / "npm-cache"),
       "npm_config_registry": "https://registry.npmjs.org/",
       "npm_config_fetch_retries": "0", "npm_config_fetch_timeout": "15000"}
for key in ("CI", "FORCE_COLOR", "NO_COLOR", "PNPM_HOME", "NODE_OPTIONS"):
    ENV.pop(key, None)
CASES = []


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def package(path, value):
    write(path / "package.json", json.dumps(value, indent=2) + "\n")


def run(argv, cwd, timeout=60):
    with subprocess.Popen(argv, cwd=cwd, env=ENV, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, start_new_session=True) as child:
        try:
            output, _ = child.communicate(timeout=timeout)
            termination = {"kind": "exited", "code": child.returncode}
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            output, _ = child.communicate()
            termination = {"kind": "timeout"}
    return output, termination


def capture(name, project, args, store="local-store"):
    argv = ["node", str(PNPM), *args, "--store-dir", str(ROOT / store)]
    output, termination = run(argv, ROOT / project)
    (HERE / (name + ".txt")).write_bytes(output)
    CASES.append({"name": "P02/" + name, "family": "pnpm-install",
                  "command": "pnpm " + " ".join(args) + " --store-dir " + str(ROOT / store),
                  "file": name + ".txt", "status": "passthrough",
                  "termination": termination,
                  "completeness": "complete" if termination["kind"] == "exited" else "incomplete",
                  "presentation": "unknown", "version": VERSION,
                  "platform": platform.platform(),
                  "provenance": {"producer": "capture.py", "project": project,
                                 "argv": argv, "store": store,
                                 "boundary": "shared stdout/stderr OS pipe through EOF; subprocess exit observed",
                                 "sha256": hashlib.sha256(output).hexdigest(),
                                 "captureRoot": str(ROOT), "date": "2026-10-08"}})
    print(name, termination, len(output), "bytes", flush=True)


def save_cases():
    write(HERE / "cases.json", '{\n  "schema": "hugr-lean/native-cases/1",\n  "cases": [\n' +
          ',\n'.join('    ' + json.dumps(case, ensure_ascii=False, separators=(',', ':')) for case in CASES) + '\n  ]\n}\n')


def peers():
    for project in ("peer-warning", "peer-strict"):
        path = ROOT / project
        package(path / "host", {"name": "p02-host", "version": "1.0.0"})
        package(path / "consumer", {"name": "p02-peer", "version": "1.0.0",
                                    "peerDependencies": {"p02-host": "^2.0.0"}})
        package(path, {"name": "p02-" + project, "private": True,
                       "dependencies": {"p02-host": "file:./host", "p02-peer": "file:./consumer"}})
        write(path / ".npmrc", "auto-install-peers=false\n")
        args = ["install", "--ignore-scripts", "--offline"]
        if project == "peer-strict":
            args.append("--strict-peer-dependencies")
        capture(project, project, args)


if len(sys.argv) == 2:
    PNPM = ROOT / "tool/node_modules/pnpm/bin/pnpm.cjs"
    version, term = run(["node", str(PNPM), "--version"], ROOT)
    assert version == b"10.18.3\n" and term == {"kind": "exited", "code": 0}
    node, _ = run(["node", "--version"], ROOT)
    VERSION = "pnpm 10.18.3; Node " + node.decode().strip()
    CASES = json.loads((HERE / "cases.json").read_text())["cases"]
    peers()
    save_cases()
    sys.exit(0)


tool = ROOT / "tool"
tool.mkdir()
bootstrap = ["npm", "install", "--prefix", str(tool), "pnpm@10.18.3",
             "--ignore-scripts", "--no-audit", "--no-fund",
             "--registry=https://registry.npmjs.org/"]
output, termination = run(bootstrap, ROOT, 90)
print("bootstrap", termination, output.decode(), flush=True)
assert termination == {"kind": "exited", "code": 0}
PNPM = tool / "node_modules/pnpm/bin/pnpm.cjs"
version, termination = run(["node", str(PNPM), "--version"], ROOT)
assert version == b"10.18.3\n" and termination == {"kind": "exited", "code": 0}
node, _ = run(["node", "--version"], ROOT)
VERSION = "pnpm " + version.decode().strip() + "; Node " + node.decode().strip()
print(VERSION, ROOT, flush=True)

plain = ROOT / "plain"
package(plain / "dep", {"name": "p02-local", "version": "1.2.3"})
package(plain, {"name": "p02-plain", "version": "1.0.0", "private": True,
                "dependencies": {"p02-local": "file:./dep"}})
capture("local-install", "plain", ["install", "--ignore-scripts"])
capture("local-cached", "plain", ["install", "--ignore-scripts"])
capture("local-frozen", "plain", ["install", "--frozen-lockfile", "--offline", "--ignore-scripts"])
package(plain, {"name": "p02-plain", "version": "1.0.0", "private": True,
                "dependencies": {"p02-local": "file:./dep"}, "devDependencies": {"chalk": "4.1.2"}})
capture("frozen-mismatch", "plain", ["install", "--frozen-lockfile", "--offline", "--ignore-scripts"])
package(ROOT / "missing-lock", {"name": "p02-missing-lock", "private": True,
                                "dependencies": {"chalk": "4.1.2"}})
capture("frozen-missing", "missing-lock", ["install", "--frozen-lockfile", "--offline", "--ignore-scripts"])

workspace = ROOT / "workspace"
package(workspace, {"name": "p02-workspace", "private": True,
                    "dependencies": {"p02-host": "workspace:*", "p02-peer": "workspace:*"}})
write(workspace / "pnpm-workspace.yaml", "packages:\n  - packages/*\n")
write(workspace / ".npmrc", "auto-install-peers=false\n")
package(workspace / "packages/host", {"name": "p02-host", "version": "1.0.0"})
package(workspace / "packages/peer", {"name": "p02-peer", "version": "1.0.0",
                                     "peerDependencies": {"p02-host": "^2.0.0"}})
capture("workspace-peer", "workspace", ["install", "--ignore-scripts", "--offline"])
capture("workspace-frozen", "workspace", ["install", "--frozen-lockfile", "--ignore-scripts", "--offline"])
peers()

lifecycle = ROOT / "lifecycle"
package(lifecycle, {"name": "p02-lifecycle", "version": "1.0.0", "private": True,
                    "scripts": {"postinstall": "node collision.cjs"}})
write(lifecycle / "collision.cjs", "process.stdout.write('Progress: resolved 7, reused 7, downloaded 0, added 7, done\\nPackages: +7\\nDone in 1s using pnpm v10.18.3\\nopaque lifecycle evidence λ\\n');\n")
capture("lifecycle-enabled", "lifecycle", ["install", "--offline"])
capture("lifecycle-disabled", "lifecycle", ["install", "--offline", "--ignore-scripts"])

for project in ("chalk-cold", "chalk-warm", "chalk-offline", "chalk-miss"):
    package(ROOT / project, {"name": "p02-" + project, "version": "1.0.0", "private": True,
                             "dependencies": {"chalk": "4.1.2"}})
capture("chalk-cold", "chalk-cold", ["install", "--ignore-scripts"], "chalk-store")
(HERE / "chalk-lock.yaml").write_bytes((ROOT / "chalk-cold/pnpm-lock.yaml").read_bytes())
capture("chalk-warm", "chalk-warm", ["install", "--ignore-scripts"], "chalk-store")
capture("chalk-offline", "chalk-offline", ["install", "--offline", "--ignore-scripts"], "chalk-store")
capture("chalk-offline-miss", "chalk-miss", ["install", "--offline", "--ignore-scripts"], "empty-store")
capture("chalk-frozen", "chalk-offline", ["install", "--frozen-lockfile", "--offline", "--ignore-scripts"], "chalk-store")

deprecated = ROOT / "deprecated"
package(deprecated / "dep", {"name": "p02-deprecated", "version": "1.0.0",
                             "deprecated": "P02 original deprecated-package witness"})
package(deprecated, {"name": "p02-deprecated-root", "private": True,
                     "dependencies": {"p02-deprecated": "file:./dep"}})
capture("deprecated-local", "deprecated", ["install", "--offline", "--ignore-scripts"])
help_output, term = run(["node", str(PNPM), "install", "--help"], ROOT)
(HERE / "install-help.txt").write_bytes(help_output)
assert term == {"kind": "exited", "code": 0}
save_cases()
print("BOOTSTRAP_ARGV", json.dumps(bootstrap), flush=True)
print("PNPM_SHA256", hashlib.sha256(PNPM.read_bytes()).hexdigest(), flush=True)
print("CAPTURE_ROOT", ROOT, flush=True)
