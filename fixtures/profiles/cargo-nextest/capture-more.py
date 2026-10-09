#!/usr/bin/env python3
"""Complete native capture; retain initial expectation errors explicitly."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess

ROOT = Path(__file__).resolve().parent
manifest = json.loads((ROOT / "cases.json").read_text())
receipt = json.loads((ROOT / "capture-receipt.json").read_text())
work = Path(receipt["isolation"]["work"])
env = os.environ.copy()
env["RUSTUP_HOME"] = env.get("RUSTUP_HOME", str(Path.home() / ".rustup"))
for key in list(env):
    if key.startswith(("NEXTEST_", "CARGO_")) or key in ("RUSTFLAGS", "RUSTDOCFLAGS"):
        del env[key]
env.update(HOME=str(work / "home"), CARGO_HOME=str(work / "cargo-home"),
           XDG_CONFIG_HOME=str(work / "home/.config"), CARGO_TERM_COLOR="never",
           PATH=str(work / "bin") + os.pathsep + env["PATH"])

for record in manifest["cases"]:
    if record["name"] == "C07-package-filter":
        record["initialExpectation"] = {"exit": 0, "scope": "single package"}
        record["expectedNativeExit"] = 100
        record["nativeExitMatches"] = True
        record["variants"] = ["workspace plus package selector", "workspace selection wins", "default fail-fast", "failure stdout/stderr/footer"]
    elif record["name"] == "C07-invalid-filter":
        record["initialExpectation"] = {"exit": 2}
        record["expectedNativeExit"] = 94
        record["nativeExitMatches"] = True
    elif record["name"] == "C07-list":
        record["variants"] = ["native default list", "binary associations", "names", "ignored tests omitted by default"]

def capture(name, argv, variants, expected_exit):
    if any(case["name"] == "C07-" + name for case in manifest["cases"]):
        raise SystemExit("Refusing duplicate capture or overwrite: " + name)
    child = subprocess.Popen(argv, cwd=work / "project", env=env,
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    raw, _ = child.communicate()
    raw.decode("utf-8", errors="strict")
    file = "raw/" + name + ".txt"
    (ROOT / file).write_bytes(raw)
    digest = hashlib.sha256(raw).hexdigest()
    record = dict(name="C07-" + name, family="cargo-nextest", file=file,
                  status="passthrough", source="shell", argv=argv, command=shlex.join(argv),
                  version=manifest["cases"][0]["version"], platform=manifest["cases"][0]["platform"],
                  termination=dict(kind="exited", code=child.returncode), completeness="complete",
                  presentation="unknown", cwd=str(work / "project"), boundary=receipt["boundary"],
                  inputBytes=len(raw), outputBytes=len(raw), sha256=digest, variants=variants,
                  completionAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  eof=dict(readThroughEOF=True, finalLF=raw.endswith(b"\n"), lastBytesHex=raw[-32:].hex()),
                  expectedNativeExit=expected_exit, nativeExitMatches=child.returncode == expected_exit,
                  disposition="CAPTURED_EXACT_PENDING_LEAD_DECISION", proposedRemovableBytes=0,
                  provenance=dict(record="capture-receipt.json", originalCase="C07-" + name, sha256=digest))
    manifest["cases"].append(record)
    print(name, "exit", child.returncode, "bytes", len(raw))

run = ["cargo", "nextest", "run", "--offline", "--color", "never", "--test-threads", "1"]
capture("isolated-package", run + ["-p", "capture-beta", "--success-output", "immediate"], ["package only", "single suite", "stdout/stderr"], 0)
capture("no-capture-collision", run + ["--workspace", "-E", "test(alpha_collision) | test(alpha_logs)", "--no-capture"], ["uncaptured arbitrary native-shaped output", "serial execution", "stdout/stderr", "summary/progress collision"], 0)
capture("status-none", run + ["--workspace", "-E", "not test(alpha_failure)", "--status-level", "none", "--final-status-level", "none"], ["status suppression flags", "retained start/summary", "default successful output hidden"], 0)
capture("list-ignored-all", ["cargo", "nextest", "list", "--offline", "--workspace", "--color", "never", "--run-ignored", "all", "--verbose"], ["verbose native list", "all nine names", "three binary associations", "ignored labels"], 0)
capture("list-help", ["cargo", "nextest", "list", "--help"], ["native list flag reference"], 0)

receipt["captures"] = manifest["cases"]
receipt["supplementRecipeSha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
receipt["initialCaptureResult"] = "Recipe exited 1 after retaining all captures: package-filter expected 0 observed 100; invalid-filter expected 2 observed 94. Supplement corrects expectations with initial values retained; raw bytes unchanged."
for path, data in (("cases.json", manifest), ("capture-receipt.json", receipt)):
    (ROOT / path).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
if any(not record["nativeExitMatches"] for record in manifest["cases"]):
    raise SystemExit("Native exit mismatch retained; inspect receipts")
