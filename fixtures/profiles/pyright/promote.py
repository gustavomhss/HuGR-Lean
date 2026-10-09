"""Bind manually authored token goldens to native two-LF EOF and file-only cases."""
import hashlib
import json
import pathlib

root = pathlib.Path(__file__).resolve().parent
manifest = json.loads((root / "cases.json").read_text())
admitted = {"L08-json-success", "L08-json-warning", "L08-json-information", "L08-json-multi-unicode"}
rows = []
for case in manifest["cases"]:
    raw = (root / case["file"]).read_bytes()
    if case["name"] not in admitted:
        continue
    if case["termination"] != {"kind": "exited", "code": 0} or case["completeness"] != "complete":
        raise ValueError("Cannot promote incomplete or nonzero capture: " + case["name"])
    filename = case["file"].replace(".txt", ".golden.txt")
    # Token content was transcribed independently using apply_patch, not jsonLayout.
    golden = (root / filename).read_bytes().rstrip(b"\n") + b"\n\n"
    (root / filename).write_bytes(golden)
    case["status"] = "reduced"
    case["expected"] = golden.decode("utf-8")
    rows.append({"name": case["name"], "inputBytes": len(raw), "outputBytes": len(golden),
                 "savingsBytes": len(raw) - len(golden), "goldenFile": filename,
                 "goldenSha256": hashlib.sha256(golden).hexdigest(), "terminalLFBytes": 2})
report = {"scope": "explicitly selected pyrightProfile; default registry remains lead-owned",
          "goldenMethod": "manual native token transcription; native EOF appended; not reducer-generated",
          "expectedSavingsBytes": sum(row["savingsBytes"] for row in rows), "cases": rows}
for filename, value in (("cases.json", manifest), ("reduction-receipt.json", report)):
    (root / filename).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(report, ensure_ascii=False, indent=2))
