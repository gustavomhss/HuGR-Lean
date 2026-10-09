#!/usr/bin/env python3
"""Generate unapproved layout artifacts from untouched captures; no runtime checks."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
receipt = json.loads((root / "capture-receipt.json").read_text())
manifest = json.loads((root / "cases.json").read_text())
receipt["candidates"] = []
manifest["archives"] = ["LICENSE-STYLELINT.txt"]
for name in ("native-warning", "native-verbose-warning"):
    raw = (root / f"{name}.txt").read_bytes()
    if not raw.startswith(b"\n"):
        raise SystemExit("Proposal source does not begin with LF")
    candidate = raw[1:]
    filename = f"{name}.layout-candidate.txt"
    (root / filename).write_bytes(candidate)
    receipt["candidates"].append({
        "input": f"{name}.txt", "file": filename, "approved": False,
        "inputBytes": len(raw), "candidateBytes": len(candidate),
        "sha256": hashlib.sha256(candidate).hexdigest(),
        "proposal": "Remove exactly the first LF; retain every remaining byte including two-LF EOF."})
    manifest["archives"].append(filename)
for filename, value in (("capture-receipt.json", receipt), ("cases.json", manifest)):
    (root / filename).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
