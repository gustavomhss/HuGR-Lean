"""Direct isolated-PATH pnpm captures; preserve earlier raw Node captures."""
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
TOOL = Path("/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/p02-pnpm-83cb9upg/tool")
ROOT = Path(tempfile.mkdtemp(prefix="p02-direct-", dir=HERE.parents[3]))
(ROOT / "home").mkdir()
ENV = {**os.environ, "PATH": str(TOOL / "node_modules/.bin") + os.pathsep + os.environ["PATH"],
       "HOME": str(ROOT / "home"), "XDG_CONFIG_HOME": str(ROOT / "home"),
       "npm_config_registry": "https://registry.npmjs.org/", "npm_config_fetch_retries": "0",
       "npm_config_fetch_timeout": "15000", "npm_config_update_notifier": "false"}
for key in ("CI", "FORCE_COLOR", "NO_COLOR", "PNPM_HOME", "NODE_OPTIONS"):
    ENV.pop(key, None)
version = subprocess.check_output(["pnpm", "--version"], env=ENV, timeout=30)
assert version == b"10.18.3\n"
INDEX = json.loads((HERE / "cases.json").read_text())
for case in INDEX["cases"]:
    case["command"] = " ".join(case["provenance"]["argv"])


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def package(path, value):
    write(path / "package.json", json.dumps(value, indent=2) + "\n")


def capture(name, project, extra=(), safe=True, store="chalk-store"):
    argv = ["pnpm", "install", "--ignore-scripts"]
    if safe:
        argv.append("--ignore-pnpmfile")
    argv.extend(extra)
    argv.extend(["--store-dir", str(ROOT / store)])
    result = subprocess.run(argv, cwd=ROOT / project, env=ENV, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=60, check=False)
    (HERE / (name + ".txt")).write_bytes(result.stdout)
    INDEX["cases"].append({"name": "P02/" + name, "family": "pnpm-install",
        "command": " ".join(argv), "file": name + ".txt", "status": "passthrough",
        "termination": {"kind": "exited", "code": result.returncode},
        "completeness": "complete", "presentation": "unknown",
        "version": "pnpm 10.18.3; Node v22.17.1", "platform": platform.platform(),
        "provenance": {"producer": "capture-direct.py", "project": project,
            "argv": argv, "store": store, "boundary": "shared stdout/stderr OS pipe through EOF; subprocess exit observed",
            "sha256": hashlib.sha256(result.stdout).hexdigest(), "captureRoot": str(ROOT), "date": "2026-10-08"}})
    print(name, result.returncode, len(result.stdout), "bytes", flush=True)


for project in ("cold", "cache", "offline"):
    package(ROOT / project, {"name": "p02-safe-" + project, "version": "1.0.0", "private": True,
                             "dependencies": {"chalk": "4.1.2"}})
capture("safe-cold", "cold")
(HERE / "safe-chalk-lock.yaml").write_bytes((ROOT / "cold/pnpm-lock.yaml").read_bytes())
capture("safe-cache", "cache")
capture("safe-offline", "offline", ["--offline"])
capture("safe-frozen", "offline", ["--offline", "--frozen-lockfile"])

workspace = ROOT / "workspace"
package(workspace, {"name": "p02-safe-workspace", "private": True,
                    "dependencies": {"chalk": "4.1.2", "p02-member": "workspace:*"}})
write(workspace / "pnpm-workspace.yaml", "packages:\n  - packages/*\n")
package(workspace / "packages/member", {"name": "p02-member", "version": "1.3.0"})
capture("safe-workspace", "workspace", ["--offline"])
capture("safe-workspace-frozen", "workspace", ["--offline", "--frozen-lockfile"])

for project, deprecated in (("peer", False), ("deprecated", True)):
    path = ROOT / project
    package(path / "host", {"name": "p02-host", "version": "1.0.0"})
    dep = {"name": "p02-consumer", "version": "1.0.0", "peerDependencies": {"p02-host": "^2.0.0"}}
    if deprecated:
        dep["deprecated"] = "P02 original deprecated-package witness"
    package(path / "consumer", dep)
    package(path, {"name": "p02-safe-" + project, "private": True,
                   "dependencies": {"p02-host": "file:./host", "p02-consumer": "file:./consumer"}})
    write(path / ".npmrc", "auto-install-peers=false\n")
    capture("safe-" + project, project, ["--offline"], store="local-store")

package(ROOT / "hook", {"name": "p02-malicious-hook", "private": True, "dependencies": {"chalk": "4.1.2"}})
write(ROOT / "hook/.pnpmfile.cjs", "module.exports = { hooks: { readPackage(pkg) { console.log('Progress: resolved 6, reused 6, downloaded 0, added 6, done'); console.log('opaque pnpmfile evidence λ'); return pkg; } } };\n")
capture("hook-enabled", "hook", ["--offline"], safe=False)
write(HERE / "cases.json", '{\n  "schema": "hugr-lean/native-cases/1",\n  "cases": [\n' +
      ',\n'.join('    ' + json.dumps(case, ensure_ascii=False, separators=(',', ':')) for case in INDEX["cases"]) + '\n  ]\n}\n')
print("ROOT", ROOT)
