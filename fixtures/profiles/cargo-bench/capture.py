"""Hosted capture only. No local native execution; verification reads JSON and bytes."""
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parent
TOOLCHAIN = "nightly-2026-10-08"
RUST_COMMIT = "1d81eb4ad9cd207e3e638bd32b17ec4fce8412a6"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def verify(root):
    manifest = json.loads((root / "cases.json").read_text())
    identity = json.loads((root / "identity.json").read_text())
    assert identity["status"] == "verified", "identity rejected"
    assert identity["candidateSha"] == identity["githubSha"] == identity["workflowSha"] == identity["checkoutSha"], "identity mismatch"
    assert {c["id"] for c in manifest["cases"]} == {"default", "cached", "workspace", "selector", "list", "ignored", "custom"}, "missing or extra capture"
    assert len({c["id"] for c in manifest["cases"]}) == len(manifest["cases"]), "duplicate case"
    for case in manifest["cases"]:
        raw = (root / case["file"]).read_bytes()
        receipt = json.loads((root / case["receipt"]).read_text())
        assert digest(raw) == case["provenance"]["sha256"] == receipt["sha256"], "raw hash mismatch"
        assert len(raw) == case["inputBytes"], "byte mismatch"
        assert receipt["eof"] and not receipt["timeout"] and receipt["exitCode"] == 0, "incomplete capture"
        assert receipt["expectationMet"], "native expectation failed"
        assert receipt["candidateSha"] == identity["candidateSha"], "receipt identity mismatch"
    for item in manifest["snapshots"]:
        assert digest((root / item["path"]).read_bytes()) == item["sha256"], "snapshot mismatch"
    print("Capture JSON, raw hashes, source snapshots and receipt identity verified")


def capture():
    assert os.environ.get("GITHUB_ACTIONS") == "true", "native execution requires GitHub Actions"
    assert os.environ["RUSTUP_TOOLCHAIN"] == TOOLCHAIN
    out = Path(os.environ["CAPTURE_OUTPUT"])
    out.mkdir(parents=True, exist_ok=False)
    shutil.copyfile(os.environ["CI_PROVENANCE_PATH"], out / "identity.json")
    shutil.copytree(ROOT / "source", out / "source")
    shutil.copyfile(__file__, out / "capture.py")
    shutil.copyfile(ROOT / "CASES.md", out / "CASES.md")
    shutil.copyfile(ROOT / "SOURCES.md", out / "SOURCES.md")
    project = Path(os.environ["RUNNER_TEMP"]) / "c06-project"
    shutil.copytree(ROOT / "source", project)
    receipts = []

    def run(name, argv, cwd, timeout=240):
        started = time.time()
        proc = subprocess.Popen(argv, cwd=cwd, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, start_new_session=True)
        timed_out = False
        try:
            raw, _ = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(proc.pid, signal.SIGKILL)
            raw, _ = proc.communicate()
        (out / (name + ".log")).write_bytes(raw)
        receipt = {"argv": argv, "cwd": str(cwd), "startedUnix": started,
                   "elapsedSeconds": time.time() - started, "exitCode": proc.returncode,
                   "timeout": timed_out, "eof": True, "sha256": digest(raw),
                   "bytes": len(raw), "boundary": "one shared stdout/stderr pipe; communicate waits for EOF",
                   "candidateSha": os.environ["GITHUB_SHA"],
                   "runId": os.environ["GITHUB_RUN_ID"], "runAttempt": os.environ["GITHUB_RUN_ATTEMPT"]}
        receipts.append(receipt)
        write_json(out / (name + ".json"), receipt)
        return raw, receipt

    try:
        url = "https://static.rust-lang.org/dist/2026-10-08/channel-rust-nightly.toml"
        with urllib.request.urlopen(url, timeout=60) as response:
            (out / "channel-rust-nightly.toml").write_bytes(response.read())
        raw, receipt = run("install", ["rustup", "toolchain", "install", TOOLCHAIN, "--profile", "minimal"], project, 600)
        assert receipt["exitCode"] == 0 and not receipt["timeout"], "toolchain installation failed"
        versions = {}
        for tool, args in [("rustup", ["--version"]), ("cargo", ["--version", "--verbose"]), ("rustc", ["--version", "--verbose"])]:
            raw, receipt = run(tool, [tool] + args, project)
            assert receipt["exitCode"] == 0
            versions[tool] = raw.decode()
        assert "commit-hash: " + RUST_COMMIT in versions["rustc"], "rustc commit mismatch"
        write_json(out / "environment.json", {"platform": platform.platform(), "machine": platform.machine(),
                   "versions": versions, "toolchain": TOOLCHAIN,
                   "homes": {key: os.environ[key] for key in ["RUSTUP_HOME", "CARGO_HOME"]}})
        specs = [("default", [], "sum_256"), ("cached", [], "sum_256"),
                 ("workspace", ["--workspace"], "beta_identity"),
                 ("selector", ["--bench", "builtin", "sum_256"], "sum_256"),
                 ("list", ["--bench", "builtin", "--", "--list"], None),
                 ("ignored", ["--bench", "builtin", "suite::ignored_sum", "--", "--ignored", "--exact"], "suite::ignored_sum"),
                 ("custom", ["--bench", "custom"], None)]
        cases = []
        failed = []
        for name, extra, measured in specs:
            argv = ["cargo", "bench", "--offline", "--color", "never"] + extra
            raw, receipt = run(name, argv, project)
            text = raw.decode("utf-8")
            expected = bool(re.search(r"test " + re.escape(measured) + r"\s+\.\.\. bench:\s+[0-9,.]+ ns/iter", text)) if measured else (
                "sum_256: benchmark" in text if name == "list" else raw.endswith(b"no final LF"))
            if name in ["default", "cached", "workspace"]:
                expected = expected and "multiply" in text and "explicit ignored measurement only" in text
            receipt["expectationMet"] = expected
            write_json(out / (name + ".json"), receipt)
            complete = receipt["exitCode"] == 0 and not receipt["timeout"] and expected
            if not complete:
                failed.append(name)
            (out / (name + ".txt")).write_bytes(raw)
            cases.append({"id": name, "name": "cargo-bench-" + name, "family": "cargo-bench",
                "argv": argv, "command": " ".join(argv), "cwd": str(project), "source": "shell",
                "termination": {"kind": "exited", "code": receipt["exitCode"]},
                "completeness": "complete" if not receipt["timeout"] else "incomplete",
                "presentation": "unknown", "file": name + ".txt", "receipt": name + ".json",
                "status": "passthrough", "removableBytes": 0, "inputBytes": len(raw),
                "nativeOutcome": "expected" if complete else "failed", "cacheFrom": "default" if name == "cached" else None,
                "provenance": {"sha256": digest(raw), "record": "SOURCES.md", "recipe": "capture.py",
                               "completedStream": not receipt["timeout"]}})
        if (project / "Cargo.lock").exists():
            shutil.copyfile(project / "Cargo.lock", out / "source" / "Cargo.lock")
        snapshots = [{"path": str(p.relative_to(out)), "sha256": digest(p.read_bytes())}
                     for p in sorted(out.rglob("*")) if p.is_file()]
        write_json(out / "cases.json", {"schema": "hugr-lean/native-cases/1", "family": "cargo-bench",
                   "state": "CAPTURED" if not failed else "CAPTURE_FAILED", "scope": "candidate-progress-unapproved",
                   "cases": cases, "failures": failed, "snapshots": snapshots,
                   "archives": [s["path"] for s in snapshots if not s["path"].endswith(".txt")]})
        assert not failed, "native expectations failed: " + ", ".join(failed)
        verify(out)
    except Exception as error:
        write_json(out / "failure.json", {"error": str(error), "receipts": receipts})
        raise


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "verify":
        verify(Path(sys.argv[2]))
    else:
        capture()
