"""P01 follow-up only: bounded, pinned public registry captures; no fixture writes."""
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import tempfile

ROOT = Path(tempfile.mkdtemp(prefix="p01-registry-", dir="/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode"))
env = {key: os.environ[key] for key in ("PATH", "TMPDIR") if key in os.environ}
env.update(HOME=str(ROOT / "home"), NPM_CONFIG_USERCONFIG="/dev/null",
           NPM_CONFIG_GLOBALCONFIG=str(ROOT / "global.npmrc"),
           NPM_CONFIG_REGISTRY="https://registry.npmjs.org/", NPM_CONFIG_UPDATE_NOTIFIER="false",
           NPM_CONFIG_FETCH_RETRIES="0", NPM_CONFIG_FETCH_TIMEOUT="10000", NO_COLOR="1")
(ROOT / "home").mkdir()
(ROOT / "global.npmrc").write_text("")

def package(path, **fields):
    path.mkdir(parents=True, exist_ok=True)
    (path / "package.json").write_text(json.dumps(fields, indent=2) + "\n")

def run(name, project, args, cache):
    env["NPM_CONFIG_CACHE"] = str(ROOT / cache)
    p = subprocess.run(["npm", *args], cwd=ROOT / project, env=env,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=40)
    print(json.dumps(dict(name=name, command="npm " + " ".join(args), project=project,
                          cache=cache, code=p.returncode, output=p.stdout.decode("utf-8"),
                          sha256=hashlib.sha256(p.stdout).hexdigest()), ensure_ascii=False), flush=True)
    return p.returncode

package(ROOT / "audit", name="p01-public-audit", version="1.0.0", private=True)
assert run("registry-audit-install", "audit",
           ["install", "lodash@4.17.20", "--save-exact", "--ignore-scripts"], "audit-cache") == 0
# Audit is auxiliary diagnostic evidence, not an installer command admission.
run("registry-audit-detail", "audit", ["audit", "--ignore-scripts"], "audit-cache")

for project in ("chalk-cold", "chalk-warm", "chalk-offline", "chalk-miss"):
    package(ROOT / project, name="p01-" + project, version="1.0.0", private=True,
            dependencies={"chalk": "4.1.2"})
args = ["install", "--ignore-scripts", "--no-audit"]
assert run("registry-cold", "chalk-cold", args, "chalk-cache") == 0
assert run("registry-warm", "chalk-warm", args, "chalk-cache") == 0
assert run("registry-offline", "chalk-offline", args + ["--offline"], "chalk-cache") == 0
assert run("registry-offline-ci", "chalk-offline",
           ["ci", "--ignore-scripts", "--no-audit", "--offline"], "chalk-cache") == 0
run("registry-offline-miss", "chalk-miss", args + ["--offline"], "empty-cache")

package(ROOT / "peer" / "host", name="p01-host", version="1.0.0")
package(ROOT / "peer" / "plugin", name="p01-plugin", version="1.0.0",
        peerDependencies={"p01-host": "^2.0.0"},
        peerDependenciesMeta={"p01-host": {"optional": True}})
assert run("peer-pack-setup", "peer/plugin", ["pack", "--ignore-scripts", "--offline"], "peer-cache") == 0
package(ROOT / "peer", name="p01-peer-optional", version="1.0.0", private=True,
        dependencies={"p01-host": "file:./host", "p01-plugin": "file:./plugin/p01-plugin-1.0.0.tgz"})
run("peer-override-attempt", "peer",
    ["install", "--ignore-scripts", "--no-audit", "--offline", "--force"], "peer-cache")

# Source/integrity facts are read from native lockfiles, not guessed from package names.
for project in ("audit", "chalk-cold", "chalk-warm", "chalk-offline"):
    lock = ROOT / project / "package-lock.json"
    print(json.dumps(dict(project=project, lockSha256=hashlib.sha256(lock.read_bytes()).hexdigest(),
                          packages=json.loads(lock.read_text())["packages"])), flush=True)
print(json.dumps(dict(root=str(ROOT), platform=platform.platform(), complete=True)), flush=True)
