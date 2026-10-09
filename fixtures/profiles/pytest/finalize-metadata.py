"""Finalize capture archives and hash-locked replay pins; never execute tests/filter."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root / "cases.json").read_text())
report = json.loads((root / "package-resolution.json").read_text())
pins = []
for package in report["install"]:
    data = package["metadata"]
    digest = package["download_info"]["archive_info"]["hashes"]["sha256"]
    pins.append(f'{data["name"]}=={data["version"]} --hash=sha256:{digest}')
(root / "requirements.lock").write_text("\n".join(sorted(pins)) + "\n")
inputs = {record["file"] for record in manifest["cases"]}
archives = [str(path.relative_to(root)) for path in sorted(root.rglob("*")) if path.is_file() and path.name not in {"cases.json", "allnoninput.txt"} and str(path.relative_to(root)) not in inputs]
(root / "allnoninput.txt").write_text("\n".join(archives) + "\n")
manifest["archives"] = archives + ["allnoninput.txt"]
(root / "cases.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print("Archive metadata finalized; native captures unchanged.")
