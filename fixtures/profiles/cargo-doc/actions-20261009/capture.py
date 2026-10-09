"""Bounded hosted Rustdoc capture; local verify mode reads evidence only."""
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import signal
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parent
COMMIT = "1d81eb4ad9cd207e3e638bd32b17ec4fce8412a6"
PIN = "nightly-2026-10-08"
IDS = {"default-nooffline", "bins-checking", "cross-aarch64", "config-control", "user-config"}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def verify(root):
    identity = json.loads((root / "identity.json").read_text())
    manifest = json.loads((root / "supplement.json").read_text())
    assert identity["status"] == "verified", "identity rejected"
    assert len({identity[k] for k in ["candidateSha", "githubSha", "workflowSha", "checkoutSha"]}) == 1, "identity mismatch"
    assert {c["id"] for c in manifest["cases"]} == IDS and len(manifest["cases"]) == len(IDS), "case closure mismatch"
    for case in manifest["cases"]:
        raw = (root / case["file"]).read_bytes()
        receipt = json.loads((root / case["receipt"]).read_text())
        assert sha(raw) == case["provenance"]["sha256"] == receipt["sha256"], "raw hash mismatch"
        assert len(raw) == case["inputBytes"], "byte mismatch"
        assert receipt["eof"] and not receipt["timeout"] and receipt["exitCode"] == 0, "incomplete capture"
        assert receipt["expectationMet"], "native proof failed"
        assert receipt["candidateSha"] == identity["candidateSha"] and receipt["runId"] == identity["runId"], "receipt identity mismatch"
        assert case["version"] and case["platform"] and case["versions"]["rustdoc"], "active metadata missing"
        assert "--offline" not in case["argv"], "no-offline witness changed"
        assert "commit-hash: " + COMMIT in case["versions"]["rustdoc"], "active rustdoc commit mismatch"
        if case["id"] == "bins-checking":
            assert b"Checking c05-beta" in raw and b"Checking c05-alpha" in raw, "Checking proof missing"
        if case["id"] == "cross-aarch64":
            assert "aarch64-unknown-linux-gnu" in case["argv"], "cross argv missing"
            index = next(a for a in case["artifacts"] if a["file"].endswith("c05_alpha/index.html"))
            assert b"aarch64_marker" in (root / index["captureFile"]).read_bytes(), "cross HTML marker missing"
        for artifact in case["artifacts"]:
            assert sha((root / artifact["captureFile"]).read_bytes()) == artifact["sha256"], "HTML hash mismatch"
    control = next(c for c in manifest["cases"] if c["id"] == "config-control")
    configured = next(c for c in manifest["cases"] if c["id"] == "user-config")
    for case, present in [(control, False), (configured, True)]:
        index = next(a for a in case["artifacts"] if a["file"].endswith("c05_alpha/index.html"))
        assert (b"user_config_marker" in (root / index["captureFile"]).read_bytes()) == present, "cfg HTML control failed"
    for item in manifest["snapshots"]:
        assert sha((root / item["path"]).read_bytes()) == item["sha256"], "snapshot mismatch"
    print("Rustdoc native receipts, identity, raw/source/HTML hashes and paired cfg controls verified")


def capture():
    assert os.environ.get("GITHUB_ACTIONS") == "true", "native capture requires Actions"
    assert os.environ["RUSTUP_TOOLCHAIN"] == PIN
    out = Path(os.environ["CAPTURE_OUTPUT"])
    out.mkdir(parents=True, exist_ok=False)
    shutil.copyfile(os.environ["CI_PROVENANCE_PATH"], out / "identity.json")
    shutil.copytree(ROOT / "project", out / "project")
    for name in ["capture.py", "SOURCES.md"]:
        shutil.copyfile(ROOT / name, out / name)
    project = Path(os.environ["RUNNER_TEMP"]) / "c05-project"
    shutil.copytree(ROOT / "project", project)
    receipts = []

    def run(name, argv, env=None, timeout=240):
        started = time.time()
        proc = subprocess.Popen(argv, cwd=project, env=env, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, start_new_session=True)
        timed_out = False
        try:
            raw, _ = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(proc.pid, signal.SIGKILL)
            raw, _ = proc.communicate()
        (out / (name + ".log")).write_bytes(raw)
        receipt = {"argv": argv, "cwd": str(project), "exitCode": proc.returncode,
                   "timeout": timed_out, "eof": True, "sha256": sha(raw), "bytes": len(raw),
                   "startedUnix": started, "elapsedSeconds": time.time() - started,
                   "candidateSha": os.environ["GITHUB_SHA"], "runId": os.environ["GITHUB_RUN_ID"],
                   "runAttempt": os.environ["GITHUB_RUN_ATTEMPT"],
                   "boundary": "shared stdout/stderr pipe; communicate waits for EOF"}
        receipts.append(receipt)
        save(out / (name + ".json"), receipt)
        return raw, receipt

    try:
        with urllib.request.urlopen("https://static.rust-lang.org/dist/2026-10-08/channel-rust-nightly.toml", timeout=60) as response:
            (out / "channel-rust-nightly.toml").write_bytes(response.read())
        for name, argv in [("install", ["rustup", "toolchain", "install", PIN, "--profile", "minimal"]),
                           ("target-install", ["rustup", "target", "add", "aarch64-unknown-linux-gnu", "--toolchain", PIN])]:
            raw, receipt = run(name, argv, timeout=600)
            assert receipt["exitCode"] == 0 and not receipt["timeout"], name + " failed"
        versions = {}
        for tool in ["rustup", "cargo", "rustc", "rustdoc"]:
            raw, receipt = run(tool, [tool, "--version"] + ([] if tool == "rustup" else ["--verbose"]))
            assert receipt["exitCode"] == 0
            versions[tool] = raw.decode()
        assert "commit-hash: " + COMMIT in versions["rustc"] and "commit-hash: " + COMMIT in versions["rustdoc"], "toolchain commit mismatch"
        environment = {"versions": versions, "platform": platform.platform(), "machine": platform.machine(),
                       "toolchain": PIN, "env": {k: os.environ.get(k) for k in ["RUSTUP_HOME", "CARGO_HOME", "RUSTUP_TOOLCHAIN", "RUSTFLAGS", "RUSTDOCFLAGS"]}}
        save(out / "environment.json", environment)
        specs = [("default-nooffline", []), ("bins-checking", ["--bins", "--no-deps"]),
                 ("cross-aarch64", ["--target", "aarch64-unknown-linux-gnu", "--no-deps"]),
                 ("config-control", ["--lib", "--no-deps"]), ("user-config", ["--lib", "--no-deps"])]
        cases, failures = [], []
        for name, extra in specs:
            env = dict(os.environ)
            target = project / "targets" / name
            env["CARGO_TARGET_DIR"] = str(target)
            config = None
            if name == "user-config":
                config = Path(env["CARGO_HOME"]) / "config.toml"
                assert not config.exists(), "unexpected user config"
                config.write_text('[build]\nrustdocflags = ["--cfg", "capture_user_config"]\n')
                shutil.copyfile(config, out / "user-config.toml")
            argv = ["cargo", "doc", "--color", "never"] + extra
            raw, receipt = run(name, argv, env)
            receipt["env"] = {k: env.get(k) for k in ["CARGO_TARGET_DIR", "CARGO_HOME", "RUSTUP_HOME", "RUSTUP_TOOLCHAIN", "RUSTFLAGS", "RUSTDOCFLAGS"]}
            htmls = []
            for page in sorted(target.rglob("*.html")):
                if page.name != "index.html" and "marker" not in page.name:
                    continue
                if "/doc/src/" in str(page):
                    continue
                dest = out / "html" / name / page.relative_to(target)
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(page, dest)
                htmls.append({"file": str(page), "captureFile": str(dest.relative_to(out)), "sha256": sha(page.read_bytes())})
            alpha = next((a for a in htmls if a["file"].endswith("c05_alpha/index.html")), None)
            expected = bool(htmls) and b"Generated" in raw
            if name == "bins-checking":
                expected = expected and b"Checking c05-beta" in raw and b"Checking c05-alpha" in raw
            if name == "cross-aarch64":
                expected = expected and alpha is not None and b"aarch64_marker" in (out / alpha["captureFile"]).read_bytes()
            if name in ["config-control", "user-config"]:
                expected = expected and alpha is not None and (b"user_config_marker" in (out / alpha["captureFile"]).read_bytes()) == (name == "user-config")
            receipt["expectationMet"] = expected
            receipt["artifacts"] = htmls
            save(out / (name + ".json"), receipt)
            complete = receipt["exitCode"] == 0 and not receipt["timeout"] and expected
            if not complete:
                failures.append(name)
            (out / (name + ".txt")).write_bytes(raw)
            cases.append({"id": name, "name": "cargo-doc-actions-" + name, "family": "cargo-doc",
                          "argv": argv, "command": " ".join(argv), "cwd": str(project), "source": "shell",
                          "version": versions["cargo"].splitlines()[0], "versions": versions,
                          "platform": environment["platform"], "presentation": "unknown",
                          "termination": {"kind": "timeout"} if receipt["timeout"] else {"kind": "exited", "code": receipt["exitCode"]},
                          "completeness": "incomplete" if receipt["timeout"] else "complete",
                          "file": name + ".txt", "receipt": name + ".json", "inputBytes": len(raw),
                          "status": "passthrough", "removableBytes": 0, "artifacts": htmls,
                          "nativeOutcome": "expected" if complete else "failed",
                          "provenance": {"sha256": sha(raw), "record": "SOURCES.md", "recipe": "capture.py",
                                         "recipeSHA256": sha((out / "capture.py").read_bytes()), "completedStream": not receipt["timeout"]}})
        if (project / "Cargo.lock").exists():
            shutil.copyfile(project / "Cargo.lock", out / "project" / "Cargo.lock")
        snapshots = [{"path": str(p.relative_to(out)), "sha256": sha(p.read_bytes())} for p in sorted(out.rglob("*")) if p.is_file()]
        save(out / "supplement.json", {"schema": "hugr-lean/native-cases/1", "family": "cargo-doc",
             "scope": "native-rustdoc-supplement; exact-passthrough", "cases": cases, "failures": failures,
             "snapshots": snapshots, "archives": [s["path"] for s in snapshots if not s["path"].endswith(".txt")]})
        assert not failures, "native proof failed: " + ", ".join(failures)
        verify(out)
    except Exception as error:
        save(out / "failure.json", {"error": str(error), "receipts": receipts})
        raise


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "verify":
        verify(Path(sys.argv[2]))
    else:
        capture()
