"""Read-only artifact audit; no package imports or native reruns."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root / "cases.json").read_text())
receipt = json.loads((root / "capture-receipt.json").read_text())


def check_bytes(raw, boundary):
    assert len(raw) == boundary["bytes"]
    assert hashlib.sha256(raw).hexdigest() == boundary["sha256"]
    assert raw.endswith(b"\n") == boundary["finalLF"]
    assert raw[-32:].hex() == boundary["lastBytesHex"]
    assert boundary["readThroughEOF"] is True


def check_inventory(archives):
    inputs = {entry["file"] for entry in manifest["cases"]}
    files = {str(path.relative_to(root)) for path in root.rglob("*") if path.is_file()}
    assert files == inputs | set(archives) | {"cases.json"}
    assert len(archives) == len(set(archives))


facts = {entry["name"]: entry for entry in receipt["cases"]}
assert len(facts) == len(receipt["cases"])
assert set(facts) == {entry["name"] for entry in manifest["cases"]}
for entry in manifest["cases"]:
    assert "output" not in entry
    raw = (root / entry["file"]).read_bytes()
    fact = facts[entry["name"]]
    check_bytes(raw, fact["boundary"])
    for key in ["command", "argv", "cwd", "version", "termination", "completeness", "presentation"]:
        assert entry[key] == fact[key]
    assert entry["provenance"]["sha256"] == fact["boundary"]["sha256"]
    assert entry["status"] == "passthrough"
for source in receipt["sources"] + [receipt["recipe"]]:
    raw = (root / source["file"]).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == source["sha256"]
suite = (root / "R05-suite.txt").read_bytes()
assert suite in (root / "R05-collision.txt").read_bytes()
check_inventory(manifest["archives"])
controls = 0
for operation in [lambda: check_bytes(suite + b"lost preservation", facts["R05-suite"]["boundary"]),
                  lambda: check_inventory([item for item in manifest["archives"] if item != "SOURCES.md"])]:
    try:
        operation()
    except AssertionError:
        controls += 1
    else:
        raise AssertionError("Artifact audit accepted destructive control")
assert controls == 2
print("Artifact hashes/EOF/inventory/collision verified; corrupted-byte and missing-archive controls rejected. Baseline replay pending.")
