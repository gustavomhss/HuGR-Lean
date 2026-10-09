"""Capture only tiny native Bun projects; never invoke the package or its checks."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
BASE = "248c303"
BUN = shutil.which("bun")
assert BUN, "Existing Bun required; no installation performed"
ENV_SET = {"NO_COLOR": "1", "TERM": "dumb", "LC_ALL": "C.UTF-8", "LANG": "C.UTF-8"}
ENV_REMOVE = ["FORCE_COLOR", "CLICOLOR_FORCE", "BUN_OPTIONS", "BUN_TEST_TIMEOUT"]
env = dict(os.environ)
env.update(ENV_SET)
for key in ENV_REMOVE:
    env.pop(key, None)
work = Path(tempfile.mkdtemp(prefix="R05-bun-", dir=str(ROOT.parents[3])))
project = work / "project"
shutil.copytree(ROOT / "inputs", project)
facts = []


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def capture(name, args, variant):
    argv = [BUN, *args]
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    proc = subprocess.Popen(argv, cwd=project, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT)
    raw, _ = proc.communicate(timeout=30)
    assert proc.returncode >= 0, "Signal termination requires separate evidence"
    raw.decode("utf-8", errors="strict")
    filename = name + ".txt"
    (ROOT / filename).write_bytes(raw)
    fact = {"name": name, "family": "bun-test", "version": "1.3.14",
            "platform": platform.platform(), "argv": argv, "command": argv,
            "cwd": str(project), "file": filename, "variant": variant,
            "termination": {"kind": "exited", "code": proc.returncode},
            "completeness": "complete", "presentation": "unknown",
            "startedAt": started,
            "completionAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "boundary": {"description": "stdout pipe; stderr redirected to same pipe before exec; communicate through EOF then wait; no PTY, normalization or truncation",
                         "bytes": len(raw), "sha256": digest(raw),
                         "readThroughEOF": True, "finalLF": raw.endswith(b"\n"),
                         "lastBytesHex": raw[-32:].hex()}}
    facts.append(fact)
    return raw


version = capture("R05-version", ["--version"], "existing binary version")
assert version == b"1.3.14\n", "Require exact pinned Bun 1.3.14"
capture("R05-help", ["test", "--help"], "native documented flags including retry")
suite = capture("R05-suite", ["test", "./suite.test.ts"], "nested suites, skip reason in name, todo, totals")
capture("R05-multifile", ["test", "./suite.test.ts", "./second.test.ts"], "multifile nested suite identities and totals")
capture("R05-logs", ["test", "./log.test.ts"], "duplicate stdout and stderr user logs")
capture("R05-coverage", ["test", "--coverage", "./suite.test.ts", "./second.test.ts"], "text coverage metrics, file names, suites and skips")
capture("R05-failure", ["test", "./failure.test.ts"], "nonzero assertion diagnostics and totals")
capture("R05-retry-success", ["test", "--retry=1", "./retry.test.ts"], "documented CLI retry; failed attempt and successful retry logs")
capture("R05-retry-exhausted", ["test", "--retry=1", "./retry-failure.test.ts"], "documented CLI retry exhausted; diagnostics and logs")
capture("R05-rerun", ["test", "--rerun-each=2", "./suite.test.ts"], "documented repeated run; distinct from retry")
capture("R05-dots", ["test", "--reporter=dots", "./suite.test.ts"], "alternate native reporter")
capture("R05-unknown-flag", ["test", "--hugr-unknown-flag", "./suite.test.ts"], "unsupported flag behavior as actually emitted")
capture("R05-no-match", ["test", "./absent.test.ts"], "missing file/no tests failure")

# Copy exact native bytes into an original user program, not synthetic output.
# Its stdout now forges the entire suite observation including native timings.
collision = ("import { test } from 'bun:test';\n"
             + "test('exact native-shaped user log', () => {\n"
             + "  process.stdout.write(" + json.dumps(suite.decode("utf-8"), ensure_ascii=False) + ");\n"
             + "});\n")
(ROOT / "inputs" / "collision.test.ts").write_text(collision, encoding="utf-8")
(project / "collision.test.ts").write_text(collision, encoding="utf-8")
collided = capture("R05-collision", ["test", "./collision.test.ts"], "real user stdout contains complete byte-exact R05-suite native output")
assert suite in collided, "Collision must contain original exact native bytes"

sources = []
for source in sorted((ROOT / "inputs").iterdir()):
    raw = source.read_bytes()
    sources.append({"file": "inputs/" + source.name, "bytes": len(raw), "sha256": digest(raw)})
binary = Path(BUN).resolve()
receipt = {"baseline": BASE, "mode": "CAPTUREONLY", "binary": {
    "path": BUN, "resolvedPath": str(binary), "sha256": digest(binary.read_bytes()),
    "version": "1.3.14", "binding": "Existing host binary pinned by version and hash; build-to-source correspondence not attested"},
    "recipe": {"file": "capture.py", "sha256": digest(Path(__file__).read_bytes())},
    "environment": {"set": ENV_SET, "removed": ENV_REMOVE, "otherwise": "inherited"},
    "sourceOrigin": "Original tiny campaign programs under repository MIT license; collision copies our own R05-suite native bytes verbatim",
    "sources": sources, "cases": facts,
    "collision": {"sourceCase": "R05-suite", "collisionCase": "R05-collision",
                  "exactBytesContained": True, "sha256": digest(suite)}}
(ROOT / "capture-receipt.json").write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n")
cases = []
for fact in facts:
    entry = {key: fact[key] for key in ["name", "family", "version", "platform", "argv", "command", "cwd", "file", "termination", "completeness", "presentation"]}
    entry.update({"status": "passthrough", "baselineReplay": "pending; capture-only",
                  "removableBytes": 0, "variant": fact["variant"],
                  "provenance": {"receipt": "capture-receipt.json", "case": fact["name"], "sha256": fact["boundary"]["sha256"]}})
    cases.append(entry)
manifest = {"schema": "hugr-lean/native-cases/1", "family": "bun-test", "baseline": BASE,
            "cases": cases, "archives": ["capture-receipt.json", "capture.py", "CASES.md", "SOURCES.md", *[item["file"] for item in sources]]}
(ROOT / "cases.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({"project": str(project), "cases": [{"name": f["name"], "exit": f["termination"]["code"], "bytes": f["boundary"]["bytes"]} for f in facts]}, indent=2))
