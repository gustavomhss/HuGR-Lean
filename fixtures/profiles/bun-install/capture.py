"""Original P04 capture helper; prints JSON, never writes fixture files."""
import argparse
import datetime
import hashlib
import json
import os
import platform
import shlex
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("name")
parser.add_argument("project")
parser.add_argument("flags", nargs="*")
args = parser.parse_args()
root = "/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/p04-bun-native"
env = os.environ.copy()
for key in ("CI", "FORCE_COLOR", "NO_COLOR", "NODE_OPTIONS", "BUN_OPTIONS"):
    env.pop(key, None)
env.update(HOME=root + "/home", XDG_CONFIG_HOME=root + "/home/config")
version = subprocess.run(["bun", "--version"], env=env, capture_output=True, check=True)
assert version.stdout == b"1.3.14\n", version.stdout
argv = ["bun", "install", *args.flags]
cwd = root + "/" + args.project
result = subprocess.run(argv, cwd=cwd, env=env, stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT, timeout=60)
raw = result.stdout
case = dict(name="P04/" + args.name, family="bun-install", command=shlex.join(argv),
            output=raw.decode("utf-8"), status="passthrough",
            termination=dict(kind="exited", code=result.returncode),
            completeness="complete", presentation="unknown", version="bun 1.3.14",
            platform=platform.platform(), provenance=dict(
                producer="capture.py", argv=argv, cwd=cwd,
                date=datetime.date.today().isoformat(),
                boundary="shared stdout/stderr OS pipe through EOF; subprocess exit observed; no PTY",
                sha256=hashlib.sha256(raw).hexdigest()))
print(json.dumps(case, ensure_ascii=False, separators=(",", ":")))
