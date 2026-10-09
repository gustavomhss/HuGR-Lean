"""Import the authorized hosted artifact; never execute Rust locally."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
DOWNLOAD = Path(sys.argv[1]).resolve()
SOURCE = DOWNLOAD / "native-cargo-bench"
RUN = "37979866069"
ARTIFACT = "11640431967"
SHA = "da4c7601ad37cd1305c1ecd52733a84ee8dcc769"
DIGEST = "6f9f5925813f335cbc543ffa729d064cbcff9bb0b8ed01dbcf914e4808908bbd"

spec = importlib.util.spec_from_file_location("capture", ROOT / "capture.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.verify(SOURCE)
identity = json.loads((SOURCE / "identity.json").read_text())
assert identity["candidateSha"] == SHA and identity["runId"] == RUN
assert (DOWNLOAD / "ci-candidate.json").read_bytes() == (SOURCE / "identity.json").read_bytes()

# Compare the actual archive bytes with GitHub's artifact digest, not a recompressed tree.
archive = subprocess.run(["gh", "api", f"repos/gustavomhss/HuGR-Lean/actions/artifacts/{ARTIFACT}/zip"],
                         check=True, stdout=subprocess.PIPE).stdout
assert hashlib.sha256(archive).hexdigest() == DIGEST, "GitHub archive digest mismatch"
(DOWNLOAD / "artifact.zip").write_bytes(archive)

# Positive and negative controls on a disposable copy; restoration precedes import.
results = []
with tempfile.TemporaryDirectory(prefix="c06-receipt-probes-", dir=DOWNLOAD) as temp:
    probe = Path(temp) / "capture"
    shutil.copytree(SOURCE, probe)
    for label, relative, mutate in [
        ("raw-byte-corruption", "default.txt", lambda raw: raw + b"corruption"),
        ("receipt-eof-loss", "default.json", lambda raw: raw.replace(b'"eof": true', b'"eof": false')),
        ("identity-mismatch", "identity.json", lambda raw: raw.replace(SHA.encode(), b"0" * 40, 1)),
        ("empty-case-list", "cases.json", lambda raw: json.dumps({**json.loads(raw), "cases": []}).encode()),
        ("project-source-corruption", "source/benches/builtin.rs", lambda raw: raw + b"// corruption\n"),
    ]:
        path = probe / relative
        original = path.read_bytes()
        path.write_bytes(mutate(original))
        try:
            module.verify(probe)
        except AssertionError as error:
            results.append({"control": label, "rejected": str(error)})
        else:
            raise AssertionError("corruption accepted: " + label)
        finally:
            path.write_bytes(original)
        module.verify(probe)

for path in sorted(SOURCE.rglob("*")):
    if path.is_file():
        relative = path.relative_to(SOURCE)
        destination = ROOT / relative
        assert not path.is_symlink(), "artifact symlink"
        if destination.exists():
            assert destination.read_bytes() == path.read_bytes(), "existing source differs: " + str(relative)
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, destination)

manifest = json.loads((ROOT / "cases.json").read_text())
manifest["archives"].extend(["artifact-receipt.json", "import-artifact.py"])
(ROOT / "cases.json").write_text(json.dumps(manifest, indent=2) + "\n")
receipt = {"runUrl": f"https://github.com/gustavomhss/HuGR-Lean/actions/runs/{RUN}",
           "runId": RUN, "runAttempt": 1, "conclusion": "success", "candidateSha": SHA,
           "workflowSha": identity["workflowSha"], "artifactId": ARTIFACT,
           "artifactName": f"native-cargo-bench-{RUN}-1", "artifactSHA256": DIGEST,
           "scope": "native-capture-only; candidate-progress-unapproved; not final CI",
           "invalidDefinitionRun": "37979697871", "controls": results,
           "importModifications": "cases.json archives extended with artifact-receipt.json and import-artifact.py; captured raw/receipts/source/snapshots unchanged",
           "sourceLicense": "MIT", "leadImport": "fixtures only; exclude .github/workflows/ci.yml"}
(ROOT / "artifact-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, indent=2))
