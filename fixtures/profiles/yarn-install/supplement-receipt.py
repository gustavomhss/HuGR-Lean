#!/usr/bin/env python3
"""Bind already captured supplement bytes to existing native reader receipt contract."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
manifest_path = root / "cases.json"
receipt_path = root / "supplement-receipts.json"
manifest_text = manifest_path.read_text()
manifest = json.loads(manifest_text)
receipt = json.loads(receipt_path.read_text())
facts = []
for case in manifest["cases"]:
    if not case["name"].startswith("P03/supplement-"):
        continue
    raw = (root / case["file"]).read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    assert digest == case["provenance"]["sha256"]
    execution = next(r for r in receipt["executions"] if r["file"] == case["file"])
    assert execution["sha256"] == digest
    facts.append(dict(name=case["name"], command=case["command"], version=case["version"],
                      platform=case["platform"], termination=case["termination"],
                      completeness=case["completeness"], presentation=case["presentation"],
                      boundary=dict(bytes=len(raw), sha256=digest, readThroughEOF=True,
                                    finalLF=raw.endswith(b"\n"), lastBytesHex=raw[-32:].hex()),
                      adapterBounds=dict(maxInputBytes=4194304, inputBytes=len(raw),
                                         withinBound=len(raw) <= 4194304)))
    old = json.dumps(case, separators=(",", ":"), ensure_ascii=False)
    case["provenance"].update(receipt="supplement-receipts.json", case=case["name"])
    new = json.dumps(case, separators=(",", ":"), ensure_ascii=False)
    assert old in manifest_text
    manifest_text = manifest_text.replace(old, new, 1)
receipt["cases"] = facts
receipt["bindingProducer"] = dict(file=Path(__file__).name,
                                 sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
manifest_path.write_text(manifest_text)
receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
