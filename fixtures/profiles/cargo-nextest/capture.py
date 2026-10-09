#!/usr/bin/env python3
"""Native capture only; never imports the package or asserts parser support."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import shlex
import shutil
import subprocess
import sys
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parent
WORK = Path(sys.argv[1]).resolve()
TAG = "cargo-nextest-0.9.148"
COMMIT = "cd1d6d5467322dbc0d39a80cb671d000ac302798"
ASSET = TAG + "-universal-apple-darwin.tar.gz"
DIGEST = "6c23b7fb4ca82c571fc8dfedbab45bfa773d45918f933170c85d21cd7f4b852b"
BOUNDARY = "stdout pipe; stderr redirected to same pipe before exec; communicate through EOF and wait; no PTY, normalization, truncation or command rewriting"

def sha(data):
    return hashlib.sha256(data).hexdigest()

def dump(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")

if not WORK.is_dir() or platform.system() != "Darwin":
    raise SystemExit("Existing isolated Darwin work directory required")
archive = (WORK / ASSET).read_bytes()
if sha(archive) != DIGEST:
    raise SystemExit("Official release asset checksum mismatch")
checksum = (WORK / (TAG + "-universal-apple-darwin.sha256")).read_bytes()
if DIGEST.encode() not in checksum:
    raise SystemExit("Published checksum does not contain pinned asset digest")
bin_dir = WORK / "bin"
bin_dir.mkdir()
with tarfile.open(WORK / ASSET) as bundle:
    member = bundle.getmember("cargo-nextest")
    if not member.isfile():
        raise SystemExit("Expected regular executable asset")
    executable = bundle.extractfile(member).read()
(bin_dir / "cargo-nextest").write_bytes(executable)
(bin_dir / "cargo-nextest").chmod(0o755)
shutil.copytree(ROOT / "project", WORK / "project")
home = WORK / "home"
cargo_home = WORK / "cargo-home"
home.mkdir()
cargo_home.mkdir()
env = os.environ.copy()
# Preserve rustup toolchain location while isolating Cargo and nextest defaults.
env["RUSTUP_HOME"] = env.get("RUSTUP_HOME", str(Path.home() / ".rustup"))
for key in list(env):
    if key.startswith(("NEXTEST_", "CARGO_")) or key in ("RUSTFLAGS", "RUSTDOCFLAGS"):
        del env[key]
env.update(HOME=str(home), CARGO_HOME=str(cargo_home),
           XDG_CONFIG_HOME=str(home / ".config"), CARGO_TERM_COLOR="never",
           PATH=str(bin_dir) + os.pathsep + env["PATH"])
cwd = WORK / "project"
captures = []

def capture(name, argv, variants, expected_exit):
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    child = subprocess.Popen(argv, cwd=cwd, env=env, stdout=subprocess.PIPE,
                             stderr=subprocess.STDOUT)
    raw, _ = child.communicate()
    text = raw.decode("utf-8", errors="strict")
    file = "raw/" + name + ".txt"
    (ROOT / "raw").mkdir(exist_ok=True)
    (ROOT / file).write_bytes(raw)
    record = dict(name="C07-" + name, family="cargo-nextest", file=file,
                  status="passthrough", source="shell", argv=argv,
                  command=shlex.join(argv), termination=dict(kind="exited", code=child.returncode),
                  completeness="complete", presentation="unknown", cwd=str(cwd),
                  inputBytes=len(raw), outputBytes=len(raw), sha256=sha(raw),
                  platform=platform.platform(), boundary=BOUNDARY, variants=variants,
                  startedAt=started, completionAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  eof=dict(readThroughEOF=True, finalLF=raw.endswith(b"\n"),
                           lastBytesHex=raw[-32:].hex()),
                  expectedNativeExit=expected_exit, nativeExitMatches=child.returncode == expected_exit,
                  disposition="CAPTURED_EXACT_PENDING_LEAD_DECISION", proposedRemovableBytes=0,
                  provenance=dict(record="capture-receipt.json", originalCase="C07-" + name, sha256=sha(raw)))
    captures.append(record)
    print(name, "exit", child.returncode, "bytes", len(raw))
    return text

version = capture("version", ["cargo", "nextest", "--version"], ["pinned version"], 0).strip()
capture("cargo-version", ["cargo", "--version"], ["toolchain"], 0)
capture("rustc-version", ["rustc", "--version", "--verbose"], ["host toolchain"], 0)
capture("run-help", ["cargo", "nextest", "run", "--help"], ["native flag reference"], 0)
run = ["cargo", "nextest", "run", "--offline", "--workspace", "--color", "never", "--test-threads", "1"]
success = ["-E", "not test(alpha_failure)"]
capture("success-default", run + success, ["success", "three binaries", "names/counts", "ignored/skips", "default reporter/footer", "default successful logs hidden"], 0)
capture("success-logs", run + success + ["--success-output", "immediate", "--status-level", "all", "--final-status-level", "all"], ["stdout/stderr", "suite association", "native-shaped arbitrary output collision", "all statuses/footer", "cached build"], 0)
capture("logs-final", run + ["-E", "test(alpha_logs) | test(beta_logs)", "--success-output", "final"], ["final stdout/stderr", "filter expression", "two suites", "filtered skips"], 0)
capture("ignored-only", run + ["--run-ignored", "only", "--success-output", "immediate", "--status-level", "all"], ["ignored execution", "ignored logs", "skip counts", "all statuses"], 0)
capture("ignored-all", run + success + ["--run-ignored", "all", "--success-output", "final"], ["include ignored", "multi-suite counts", "final logs"], 0)
capture("failure", run + ["--no-fail-fast", "--failure-output", "immediate-final", "--status-level", "all", "--final-status-level", "all"], ["failure exit", "panic", "stdout/stderr failure", "failure suite/name/footer", "continued multisuite run"], 100)
capture("package-filter", run + ["-p", "capture-beta", "--success-output", "immediate"], ["package selector", "single suite counts/logs"], 0)
capture("positional-filter", run + ["--", "alpha_pass"], ["positional name filter", "filtered skips/counts"], 0)
capture("exclude-name", run + success + ["--", "--skip", "alpha_logs"], ["libtest skip filter", "skip accounting"], 0)
capture("no-tests", run + ["-E", "test(no_such_test)", "--no-tests", "pass"], ["empty selection", "zero counts/footer", "explicit no-tests policy"], 0)
capture("list", ["cargo", "nextest", "list", "--offline", "--workspace", "--color", "never"], ["native list", "binary associations", "ignored labels", "names"], 0)
capture("list-filter", ["cargo", "nextest", "list", "--offline", "--workspace", "--color", "never", "-E", "test(alpha_pass) | test(beta_pass)"], ["list expression selector", "suite associations"], 0)
capture("invalid-flag", ["cargo", "nextest", "run", "--fixture-unknown-flag"], ["unknown flag refusal"], 2)
capture("invalid-filter", run + ["-E", "test("], ["invalid filter diagnostics"], 2)

for record in captures:
    record["version"] = version
sources = {str(path.relative_to(ROOT)): sha(path.read_bytes())
           for path in sorted((ROOT / "project").rglob("*")) if path.is_file()}
archives = []
for license_name in ("LICENSE-MIT", "LICENSE-APACHE"):
    url = "https://raw.githubusercontent.com/nextest-rs/nextest/" + COMMIT + "/" + license_name
    data = urllib.request.urlopen(url, timeout=60).read()
    path = "archives/" + license_name + ".txt"
    (ROOT / "archives").mkdir(exist_ok=True)
    (ROOT / path).write_bytes(data)
    archives.append(path)
    sources[path] = sha(data)
dump(ROOT / "cases.json", dict(schema="hugr-lean/native-cases/1", family="cargo-nextest",
     baseline="71bcaea", cases=captures, archives=archives))
dump(ROOT / "capture-receipt.json", dict(schema="hugr-lean/native-capture/1", baseline="71bcaea",
     producer=dict(repository="https://github.com/nextest-rs/nextest", tag=TAG, commit=COMMIT,
                   license="MIT OR Apache-2.0", asset=ASSET, sha256=DIGEST,
                   binarySha256=sha(executable), publishedChecksum=checksum.decode(),
                   binarySourceCorrespondence="official release attribution; build-to-commit not independently attested"),
     sourceHashes=sources, recipeSha256=sha(Path(__file__).read_bytes()),
     isolation=dict(work=str(WORK), cargoHome=str(cargo_home), home=str(home),
                    config="no copied Cargo/nextest global defaults; original project has no config"),
     boundary=BOUNDARY, captures=captures))
if any(not record["nativeExitMatches"] for record in captures):
    raise SystemExit("Native exit mismatch retained in receipts; inspect before claiming coverage")
