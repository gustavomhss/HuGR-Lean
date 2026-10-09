"""Disposable native producer. Prints captures; never writes repository fixtures."""
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import tempfile

ROOT = Path(tempfile.mkdtemp(prefix="p01-npm-", dir="/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode"))
env = {key: os.environ[key] for key in ("PATH", "TMPDIR") if key in os.environ}
env.update(HOME=str(ROOT / "home"), NPM_CONFIG_CACHE=str(ROOT / "cache"),
           NPM_CONFIG_USERCONFIG="/dev/null", NPM_CONFIG_GLOBALCONFIG=str(ROOT / "global.npmrc"),
           NPM_CONFIG_REGISTRY="https://registry.npmjs.org/", NPM_CONFIG_UPDATE_NOTIFIER="false",
           NPM_CONFIG_FETCH_RETRIES="0", NPM_CONFIG_FETCH_TIMEOUT="10000", NO_COLOR="1")
(ROOT / "home").mkdir()
(ROOT / "global.npmrc").write_text("")
captures = []

def package(path, **fields):
    path.mkdir(parents=True, exist_ok=True)
    (path / "package.json").write_text(json.dumps(fields, indent=2) + "\n")

def run(name, cwd, args, retain=True):
    # One OS pipe shared by stdout and stderr: exact merged host boundary,
    # not stdout-followed-by-stderr reconstruction. No terminal/ANSI rewriting.
    result = subprocess.run(["npm", *args], cwd=cwd, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=30)
    text = result.stdout.decode("utf-8", errors="strict")
    if retain:
        captures.append(dict(name=name, command="npm " + " ".join(args), cwd=str(cwd),
                             code=result.returncode, output=text,
                             sha256=hashlib.sha256(result.stdout).hexdigest()))
        print(json.dumps(captures[-1], ensure_ascii=False), flush=True)
    elif result.returncode:
        raise RuntimeError(text)
    return text

package(ROOT / "plain" / "dep", name="p01-local-dep", version="1.0.0",
        funding="https://example.invalid/p01")
package(ROOT / "plain", name="p01-plain", version="1.0.0", private=True,
        dependencies={"p01-local-dep": "file:./dep"})
run("install-disabled", ROOT / "plain", ["install", "--ignore-scripts", "--no-audit"])
run("install-cached", ROOT / "plain", ["install", "--ignore-scripts", "--no-audit"])
run("ci-offline", ROOT / "plain", ["ci", "--offline", "--ignore-scripts", "--no-audit"])
run("lock-only", ROOT / "plain", ["install", "--package-lock-only", "--offline", "--ignore-scripts", "--no-audit"])
run("ci-audit", ROOT / "plain", ["ci", "--ignore-scripts"])

package(ROOT / "workspace" / "packages" / "one", name="p01-one", version="1.0.0")
package(ROOT / "workspace" / "packages" / "two", name="p01-two", version="1.0.0",
        dependencies={"p01-one": "file:../one"})
package(ROOT / "workspace", name="p01-workspace", version="1.0.0", private=True,
        workspaces=["packages/*"])
run("workspaces-install", ROOT / "workspace", ["install", "--workspaces", "--ignore-scripts", "--offline", "--no-audit"])
run("workspaces-ci", ROOT / "workspace", ["ci", "--workspace=p01-two", "--ignore-scripts", "--offline", "--no-audit"])

package(ROOT / "lifecycle", name="p01-lifecycle", version="1.0.0", private=True,
        scripts={"postinstall": "node user-log.cjs"})
(ROOT / "lifecycle" / "user-log.cjs").write_text(
    "console.log('USER LOG: keep 🦴');\n"
    "console.log('added 777 packages in 1s');\n"
    "console.log('up to date, audited 888 packages in 1s');\n"
    "console.error('npm warn deprecated user-log@1.0.0: this is application evidence');\n")
run("lifecycle-install", ROOT / "lifecycle", ["install", "--offline", "--no-audit"])
run("lifecycle-ci", ROOT / "lifecycle", ["ci", "--offline", "--no-audit"])
run("lifecycle-disabled", ROOT / "lifecycle", ["ci", "--offline", "--ignore-scripts", "--no-audit"])

package(ROOT / "deprecated-src", name="p01-deprecated", version="1.0.0",
        deprecated="P01 local deprecation evidence; preserve exact text")
run("pack-setup", ROOT / "deprecated-src", ["pack", "--ignore-scripts", "--offline"], False)
package(ROOT / "deprecated", name="p01-deprecation-root", version="1.0.0", private=True,
        dependencies={"p01-deprecated": "file:../deprecated-src/p01-deprecated-1.0.0.tgz"})
run("deprecated-install", ROOT / "deprecated", ["install", "--ignore-scripts", "--offline", "--no-audit"])

package(ROOT / "peer" / "host", name="p01-host", version="1.0.0")
package(ROOT / "peer" / "plugin", name="p01-plugin", version="1.0.0",
        peerDependencies={"p01-host": "^2.0.0"})
run("peer-pack-setup", ROOT / "peer" / "plugin", ["pack", "--ignore-scripts", "--offline"], False)
package(ROOT / "peer", name="p01-peer", version="1.0.0", private=True,
        dependencies={"p01-host": "file:./host", "p01-plugin": "file:./plugin/p01-plugin-1.0.0.tgz"})
run("peer-conflict", ROOT / "peer", ["install", "--ignore-scripts", "--offline", "--no-audit"])
package(ROOT / "missing-lock", name="p01-missing-lock", version="1.0.0", private=True)
run("ci-missing-lock", ROOT / "missing-lock", ["ci", "--ignore-scripts", "--offline", "--no-audit"])
print(json.dumps(dict(root=str(ROOT), platform=platform.platform(), complete=True)), flush=True)
