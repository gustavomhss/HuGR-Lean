"""Inspect capture artifacts and measure JSON layout only; never run a filter."""
import hashlib
import json
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent
receipt = json.loads((root / "capture-receipt.json").read_text())
manifest = json.loads((root / "cases.json").read_text())
records = {record["name"]: record for record in receipt["records"]}
rows = []
framing_errors = []
for case in manifest["cases"]:
    if ("file" in case) == ("output" in case):
        framing_errors.append(case["name"])
        continue
    raw = (root / case["file"]).read_bytes()
    record = records[case["name"]]
    digest = hashlib.sha256(raw).hexdigest()
    if digest != record["sha256"] or len(raw) != record["bytes"]:
        raise ValueError("Raw capture differs from receipt: " + case["name"])
    row = {"name": case["name"], "rawBytes": len(raw), "sha256": digest,
           "trailingLFBytes": len(raw) - len(raw.rstrip(b"\n")),
           "last16BytesHex": raw[-16:].hex(), "approvedSavingsBytes": 0}
    if case["name"] in ("L08-json-success", "L08-json-error"):
        text = raw.decode("utf-8")
        json.loads(text)
        # Preserve every string/escape/number token and the exact terminal LF run.
        compact = re.sub(r'"(?:\\.|[^"\\])*"|[ \t\r\n]+',
                         lambda match: match[0] if match[0].startswith('"') else "",
                         text)
        compact += "\n" * row["trailingLFBytes"]
        if json.loads(compact) != json.loads(text):
            raise ValueError("Layout measurement changed JSON values")
        candidate = compact.encode("utf-8")
        filename = case["file"].replace(".txt", ".layout-candidate.txt")
        (root / filename).write_bytes(candidate)
        row.update({"layoutCandidateFile": filename,
                    "layoutCandidateBytes": len(candidate),
                    "layoutCandidateSha256": hashlib.sha256(candidate).hexdigest(),
                    "layoutCandidateSavingsBytes": len(raw) - len(candidate),
                    "eligibility": "unimplemented" if case["termination"]["code"] == 0
                                   else "unsafe/nonzero"})
    rows.append(row)
report = {"kind": "artifact inspection; not a reducer test or public-filter result",
          "framingErrors": framing_errors,
          "rawBytes": sum(row["rawBytes"] for row in rows),
          "approvedSavingsBytes": 0, "cases": rows}
(root / "evidence.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(report, ensure_ascii=False, indent=2))
