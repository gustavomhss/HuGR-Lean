"""Fixture-only receipt audit; not a public-filter test or campaign CI gate."""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EXPECTED = {
    "version": (0, 6), "check-clean": (0, 66), "check-dirty": (1, 123),
    "check-multiple": (1, 145), "list-clean": (0, 0), "list-multiple": (1, 31),
    "debug-clean": (0, 9), "debug-multiple": (0, 31), "default-source": (0, 24),
    "syntax-check": (2, 214), "syntax-list": (2, 132), "syntax-debug": (2, 132),
    "config-failure": (1, 98), "ignored": (0, 66), "no-files": (2, 132),
    "no-files-allowed": (0, 66), "unknown-option": (0, 130),
    "plugin-collision": (0, 132), "npx-check": (0, 66),
    "npx-no-install-check": (0, 66), "config-good": (0, 66),
    "default-clean": (0, 17), "default-unicode": (0, 26), "syntax-default": (2, 132),
    "config-list": (1, 75), "config-debug": (1, 75), "config-default": (1, 75),
    "ignored-list": (0, 0), "ignored-debug": (0, 0), "ignored-default": (0, 20),
    "no-files-list": (2, 66), "no-files-debug": (2, 66), "no-files-default": (2, 66),
    "plugin-list": (0, 66), "plugin-debug": (0, 273), "plugin-default": (0, 83),
    "plugin-multiple": (1, 277), "default-multiple": (0, 67),
}
CANDIDATES = {"check-clean", "ignored", "no-files-allowed", "npx-check",
              "npx-no-install-check", "config-good"}
HEADER = b"Checking formatting...\n"
SUMMARY = b"All matched files use Prettier code style!\n"


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def validate_raw(raw, row):
    assert len(raw) == row["bytes"], "byte count mismatch"
    assert sha(raw) == row["sha256"], "raw hash mismatch"
    eof = "LF" if raw.endswith(b"\n") else "empty" if not raw else "no-LF"
    assert eof == row["eof"], "EOF mismatch"


def must_reject(action):
    try:
        action()
    except AssertionError:
        return
    raise AssertionError("destructive probe unexpectedly accepted")


receipt = json.loads((ROOT / "capture-receipt.json").read_text())
manifest = json.loads((ROOT / "cases.json").read_text())
assert manifest["schema"] == "hugr-lean/native-cases/1"
rows = receipt["cases"]
names = [row["name"] for row in rows]
expected_names = {"L05/" + name for name in EXPECTED}
assert len(names) == len(set(names)) and set(names) == expected_names
assert [case["name"] for case in manifest["cases"]] == names
assert receipt["version"] == "3.6.2"
assert sha((ROOT / "capture.py").read_bytes()) == receipt["collectorSha256"]
for path, digest in receipt["sourceSha256"].items():
    assert sha((ROOT / path).read_bytes()) == digest, path
for item in [receipt["install"], receipt["toolSource"]]:
    path = item.get("file", item.get("metadataFile"))
    digest = item.get("sha256", item.get("metadataSha256"))
    assert sha((ROOT / path).read_bytes()) == digest
lock = json.loads((ROOT / "project/package-lock.json").read_text())
assert lock["packages"]["node_modules/prettier"]["integrity"] == receipt["toolSource"]["dist"]["integrity"]
stats = Counter()
total = 0
for row, case in zip(rows, manifest["cases"]):
    name = row["name"].removeprefix("L05/")
    assert ("file" in case) != ("output" in case)
    raw = (ROOT / case["file"]).read_bytes()
    validate_raw(raw, row)
    assert case["provenance"]["sha256"] == row["sha256"]
    for key in ["argv", "command", "termination", "completeness"]:
        assert case[key] == row[key], key
    assert case["status"] == "passthrough" and row["completeness"] == "complete"
    assert row["termination"] == {"kind": "exited", "code": EXPECTED[name][0]}
    assert len(raw) == EXPECTED[name][1]
    if name in CANDIDATES:
        assert raw == HEADER + SUMMARY
        disposition = "NOT_IMPLEMENTED"
        candidate = len(HEADER)
    elif name.startswith("plugin-") or name == "unknown-option" or EXPECTED[name][0] != 0:
        disposition, candidate = "UNSAFE", 0
    else:
        disposition, candidate = "ZERO_NOISE", 0
    stats[disposition] += 1
    total += len(raw)
    print(f"{name}: exit={EXPECTED[name][0]} bytes={len(raw)} {disposition} candidate={candidate}")

# Positive controls: real differences/syntax/plugin output; UTF-8 bytes, not characters.
assert (ROOT / "captures/list-multiple.txt").read_bytes() == "dirty.js\nspace dir/雪 file.js\n".encode()
assert len((ROOT / "captures/default-unicode.txt").read_bytes()) > len((ROOT / "captures/default-unicode.txt").read_text())
assert b"SyntaxError: Unexpected token (1:16)" in (ROOT / "captures/syntax-check.txt").read_bytes()
assert (ROOT / "captures/plugin-list.txt").read_bytes() == (ROOT / "captures/check-clean.txt").read_bytes()
control = rows[names.index("L05/plugin-collision")]
raw = (ROOT / "captures/plugin-collision.txt").read_bytes()
validate_raw(raw, control)
# Probe in memory: never rewrite committed native evidence.
must_reject(lambda: validate_raw(raw.removeprefix(HEADER), control))
must_reject(lambda: validate_raw(raw[:-1], control))
mutant = b"X" + raw[1:]
must_reject(lambda: validate_raw(mutant, control))
validate_raw(raw, control)
print(f"Receipt audit + three rejected destructive probes + restored control; {len(rows)} cases; "
      f"{total} raw UTF-8 bytes; {dict(stats)}; candidate={len(CANDIDATES) * len(HEADER)}; approved=0")
