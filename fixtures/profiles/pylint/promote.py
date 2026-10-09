"""Promote only independently captured canonical goldens; never regenerate native bytes."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
approved = {"L06-json-exit-zero", "L06-json-reports", "L06-json2-exit-zero", "L06-json2-reports"}
manifest = json.loads((ROOT / "cases.json").read_bytes())
receipt = json.loads((ROOT / "capture-receipt.json").read_bytes())
goldens = []
for entry in manifest["cases"]:
    if entry["name"] not in approved:
        continue
    capture = next(item for item in receipt["cases"] if item["name"] == entry["name"])
    candidate = next(item for item in receipt["candidates"] if item["case"] == entry["name"])
    raw = (ROOT / entry["file"]).read_bytes()
    expected = (ROOT / candidate["file"]).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == capture["boundary"]["sha256"]
    assert hashlib.sha256(expected).hexdigest() == candidate["sha256"]
    assert entry["termination"]["code"] == 0 and json.loads(raw) == json.loads(expected)
    golden = entry["name"] + ".golden.txt"
    (ROOT / golden).write_bytes(expected)
    entry["status"] = "reduced"
    entry["expectedFile"] = golden
    goldens.append({"case": entry["name"], "file": golden, "source": candidate["file"],
                    "sha256": candidate["sha256"], "inputBytes": len(raw), "outputBytes": len(expected),
                    "savedBytes": len(raw) - len(expected)})
launchers = json.loads((ROOT / "launcher-receipt.json").read_bytes())
for record in launchers["records"]:
    if record["file"] not in manifest["archives"]:
        manifest["archives"].append(record["file"])
(ROOT / "cases.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
note = {"schema": "hugr-lean/pylint-promotion/1", "captureCheckpoint": "15e25d7aa91bb382772a5c6b90d288592d8a3b1a",
        "producer": "pylint 4.0.4", "goldens": goldens,
        "approvedBytes": sum(item["savedBytes"] for item in goldens),
        "independentOracle": "Original capture.py lexical scanner candidates; copied byte-for-byte, never runtime parser output.",
        "unchangedCaptureReceiptSha256": hashlib.sha256((ROOT / "capture-receipt.json").read_bytes()).hexdigest(),
        "blocked": {"case": "L06-json2-clean", "proposedBytes": 141,
                    "reason": "Native score 10.0 is noncanonical; frozen jsonLayout and requested refusal policy forbid reduction."}}
(ROOT / "promotion-receipt.json").write_text(json.dumps(note, indent=2) + "\n", encoding="utf-8")
print(json.dumps(note, indent=2))
