"""Verify and append only this authorized Actions supplement; no native local execution."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
FAMILY = ROOT.parent
DOWNLOAD = Path(sys.argv[1]).resolve()
SOURCE = DOWNLOAD / "native-rustdoc"
RUN = "37989424550"
ARTIFACT = "11644276831"
SHA = "6b40ec97e78ed233e2373928854fd9dac02dd802"
DIGEST = "db8307b21dc4323cc0b9268f3389408dbaea75d442f791cc4ce24ea786b5934c"
BASE = "22ddaa6"

spec = importlib.util.spec_from_file_location("capture", ROOT / "capture.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.verify(SOURCE)
identity = json.loads((SOURCE / "identity.json").read_text())
assert identity["candidateSha"] == SHA and identity["runId"] == RUN
assert (DOWNLOAD / "ci-candidate.json").read_bytes() == (SOURCE / "identity.json").read_bytes()
archive = subprocess.run(["gh", "api", f"repos/gustavomhss/HuGR-Lean/actions/artifacts/{ARTIFACT}/zip"],
                         check=True, stdout=subprocess.PIPE).stdout
assert hashlib.sha256(archive).hexdigest() == DIGEST, "archive digest mismatch"
(DOWNLOAD / "artifact.zip").write_bytes(archive)

original_paths = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", BASE, "--", "fixtures/profiles/cargo-doc"], text=True).splitlines()
historical = {}
for path in original_paths:
    original = subprocess.check_output(["git", "show", BASE + ":" + path])
    assert Path(path).read_bytes() == original, "historical file changed: " + path
    historical[path] = hashlib.sha256(original).hexdigest()


def cfg_projection(raw):
    manifest = json.loads(raw)
    control = next(c for c in manifest["cases"] if c["id"] == "config-control")
    configured = next(c for c in manifest["cases"] if c["id"] == "user-config")
    configured["artifacts"] = control["artifacts"]
    return json.dumps(manifest).encode()


results = []
with tempfile.TemporaryDirectory(prefix="c05-probes-", dir=DOWNLOAD) as temp:
    probe = Path(temp) / "capture"
    shutil.copytree(SOURCE, probe)
    for label, relative, mutate in [
        ("raw-byte-corruption", "bins-checking.txt", lambda raw: raw + b"corruption"),
        ("receipt-eof-loss", "bins-checking.json", lambda raw: raw.replace(b'"eof": true', b'"eof": false')),
        ("identity-mismatch", "identity.json", lambda raw: raw.replace(SHA.encode(), b"0" * 40, 1)),
        ("empty-cases", "supplement.json", lambda raw: json.dumps({**json.loads(raw), "cases": []}).encode()),
        ("project-source-corruption", "project/src/lib.rs", lambda raw: raw + b"// corruption\n"),
        ("cfg-proof-projection", "supplement.json", cfg_projection),
    ]:
        path = probe / relative
        original = path.read_bytes()
        path.write_bytes(mutate(original))
        try:
            module.verify(probe)
        except AssertionError as error:
            results.append({"control": label, "rejected": str(error)})
        else:
            raise AssertionError("mutation accepted: " + label)
        finally:
            path.write_bytes(original)
        module.verify(probe)

for path in sorted(SOURCE.rglob("*")):
    if path.is_file():
        destination = ROOT / path.relative_to(SOURCE)
        assert not path.is_symlink()
        if destination.exists():
            assert destination.read_bytes() == path.read_bytes(), "existing source differs"
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, destination)

base_text = (FAMILY / "cases.json").read_text()
base = json.loads(base_text)
supplement = json.loads((ROOT / "supplement.json").read_text())
prefix = ROOT.name + "/"
appended = []
for captured in supplement["cases"]:
    case = json.loads(json.dumps(captured))
    case["id"] = "actions-" + case["id"]
    case["file"] = prefix + case["file"]
    case["receipt"] = prefix + case["receipt"]
    case["provenance"]["record"] = prefix + case["provenance"]["record"]
    case["provenance"]["recipe"] = prefix + case["provenance"]["recipe"]
    for artifact in case["artifacts"]:
        artifact["captureFile"] = prefix + artifact["captureFile"]
    appended.append(case)
assert not ({c["id"] for c in base["cases"]} & {c["id"] for c in appended}), "duplicate IDs"
archives = [prefix + str(p.relative_to(ROOT)) for p in sorted(ROOT.rglob("*"))
            if p.is_file() and not p.name.endswith(".txt")]
archives.append(prefix + "artifact-receipt.json")
# Insert only new array entries; keep all original case text and metadata untouched.
text = base_text.replace('  "archives": [\n', '  "archives": [\n' + "".join("    " + json.dumps(p) + ",\n" for p in archives), 1)
position = text.rfind("\n  ]\n}")
assert position > 0, "case array delimiter missing"
text = text[:position] + ",\n" + ",\n".join("    " + json.dumps(c, indent=2).replace("\n", "\n    ") for c in appended) + text[position:]
combined = json.loads(text)
assert combined["cases"][:len(base["cases"])] == base["cases"], "historical cases changed"
assert len({c["file"] for c in combined["cases"]}) == len(combined["cases"]), "duplicate files"
assert all("output" not in c for c in appended), "duplicate inline input"
(FAMILY / "cases.json").write_text(text)
for path, digest in historical.items():
    if path.endswith("/cases.json"):
        continue
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest, "historical bytes changed"
receipt = {"runUrl": f"https://github.com/gustavomhss/HuGR-Lean/actions/runs/{RUN}",
           "runId": RUN, "runAttempt": 1, "conclusion": "success", "candidateSha": SHA,
           "workflowSha": identity["workflowSha"], "artifactId": ARTIFACT, "artifactSHA256": DIGEST,
           "scope": "native-rustdoc-supplement only; exact passthrough; not final CI",
           "controls": results, "historicalFileSHA256": historical, "historicalCaseIds": [c["id"] for c in base["cases"]],
           "importModifications": "captured files unchanged; parent cases.json appends prefixed cases/archives; new import receipt/driver",
           "sourceLicense": "MIT", "leadImport": "cargo-doc fixtures only; exclude branch workflow"}
(ROOT / "artifact-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({k: v for k, v in receipt.items() if k != "historicalFileSHA256"}, indent=2))
