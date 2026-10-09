"""Inspect capture artifacts only; does not run product, tests, or native tools."""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
manifest = json.loads((HERE / "cases.json").read_text())
receipt = json.loads((HERE / "capture-receipt.json").read_text())


def sha(data):
    return hashlib.sha256(data).hexdigest()


def inspect(item):
    data = (HERE / item["file"]).read_bytes()
    if sha(data) != item["sha256"]:
        raise ValueError("Capture SHA-256 mismatch")
    if len(data) != item["bytesUtf8"] or data.endswith(b"\n") != item["endsWithLF"]:
        raise ValueError("Capture size/EOF mismatch")
    if data[-32:].hex() != item["tailHex"]:
        raise ValueError("Capture tail mismatch")
    return data


# Calibrate hash comparison in memory; committed/captured bytes never mutated.
first = receipt["cases"][0]
inspect(first)
try:
    inspect({**first, "sha256": "0" * 64})
except ValueError as error:
    calibration = str(error)
else:
    raise ValueError("Hash comparison failed to detect mismatched receipt")

by_id = {item["id"]: item for item in receipt["cases"]}
if len(by_id) != len(receipt["cases"]):
    raise ValueError("Duplicate capture ID")
if {case["name"] for case in manifest["cases"]} != set(by_id):
    raise ValueError("Manifest/receipt ID mismatch")
for case in manifest["cases"]:
    if "file" not in case or "input" in case or "output" in case:
        raise ValueError("Manifest must declare file only")
    item = by_id[case["name"]]
    inspect(item)
    if case["file"] != item["file"] or case["provenance"]["sha256"] != item["sha256"]:
        raise ValueError("Manifest hash/file mismatch")
    if case["command"] != item["command"] or case["termination"] != item["termination"]:
        raise ValueError("Manifest command/exit mismatch")
    if case["status"] != "passthrough" or case["presentation"] != "unknown":
        raise ValueError("Invalid capture-only disposition/presentation")
    for side in item.get("sideArtifacts", []):
        inspect(side)
for item in receipt["projectSources"]:
    inspect(item)
for package in receipt["packages"]:
    inspect(package["licenseCopy"])
inspect(receipt["sourceEvidence"])
for candidate in receipt["candidates"]:
    data = inspect(candidate)
    original = (HERE / candidate["input"]).read_bytes()
    if len(original) - len(data) != candidate["savedBytesUtf8"] or candidate["approved"]:
        raise ValueError("Invalid candidate delta/status")
actual_txt = {str(path.relative_to(HERE)) for path in HERE.rglob("*.txt")}
declared_txt = {case["file"] for case in manifest["cases"]} | set(manifest["archives"])
if actual_txt != declared_txt or len(manifest["archives"]) != len(set(manifest["archives"])):
    raise ValueError("Missing/extra/duplicate txt declaration")
report_bytes = (HERE / "requested-results.json").read_bytes()
if report_bytes != (HERE / "json-stdout-errors.txt").read_bytes():
    raise ValueError("File/JSON stdout report bytes differ")
report = json.loads(report_bytes)
expected = [("errors.md", 3, "MD019", [4, 1]),
            ("errors.md", 5, "MD033", [11, 3]),
            ("errors.md", 7, "MD025", None),
            ("path spaces/café 🧪.md", 3, "MD033", [9, 3])]
observed = [(r["fileName"], r["lineNumber"], r["ruleNames"][0], r["errorRange"]) for r in report]
if observed != expected or (HERE / "json-stdout-success.txt").read_bytes() != b"[]":
    raise ValueError("Requested report disagrees with fixture source evidence")
collision = (HERE / "reporter-collision.txt").read_bytes()
for row in (b"Finding: clean.md\n", b"Linting: 1 file\n", b"Summary: 0 issues in 0 files\n"):
    if collision.count(row) != 2:
        raise ValueError("Reporter collision not retained")
summary = {"scope": "capture artifact inspection only; no product or test invocation",
           "hashCalibration": calibration, "cases": len(by_id),
           "declaredTxtInputs": len(manifest["cases"]), "declaredTxtArchives": len(manifest["archives"]),
           "jsonFileEqualsMergedJsonStdout": True, "jsonSuccessExactHex": "5b5d",
           "collisionRowsRetainedTwice": True,
           "candidateBytesProposed": sum(c["savedBytesUtf8"] for c in receipt["candidates"]),
           "approvedSavings": 0}
(HERE / "evidence.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary, indent=2))
