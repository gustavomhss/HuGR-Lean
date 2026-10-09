#!/usr/bin/env python3
"""Archive native generated lockfile and finalize producer/source associations."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root / "cases.json").read_text())
receipt = json.loads((root / "capture-receipt.json").read_text())
lock = Path(receipt["isolation"]["work"]) / "project/Cargo.lock"
path = "archives/Cargo.lock.txt"
(root / path).write_bytes(lock.read_bytes())
if path not in manifest["archives"]:
    manifest["archives"].append(path)
receipt["sourceHashes"][path] = hashlib.sha256(lock.read_bytes()).hexdigest()
receipt["finalizeRecipeSha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
receipt["sourceAssociation"] = {
    "project": "Original dependency-free Rust source under project/ copied byte-for-byte to isolated cwd before capture; generated lockfile archived separately.",
    "licenseCopies": [
        {"repository": receipt["producer"]["repository"], "commit": receipt["producer"]["commit"],
         "path": name, "archive": "archives/" + name + ".txt", "modifications": "none; bytes unchanged"}
        for name in ("LICENSE-MIT", "LICENSE-APACHE")],
    "ignoreReasons": "Native reporter and verbose list do not emit Rust ignore reason strings; retained in original source, never injected into raw output.",
    "golden": "Whole native file must remain exact; no independent reduction golden or public-filter execution claimed.",
}
for case in manifest["cases"]:
    if case["name"] == "C07-list-ignored-all":
        case["variants"] = ["verbose native list", "all nine names including ignored", "three binary associations", "ignored labels/reasons not emitted"]
receipt["captures"] = manifest["cases"]
for name, value in (("cases.json", manifest), ("capture-receipt.json", receipt)):
    (root / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
