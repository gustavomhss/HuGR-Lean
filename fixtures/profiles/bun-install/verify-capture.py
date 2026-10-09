"""Tiny fixture integrity check plus one in-memory corruption control; no SUT."""
import hashlib
import json
import pathlib
import shlex

root = pathlib.Path(__file__).parent
document = json.loads((root / "cases.json").read_text())
assert document["schema"] == "hugr-lean/native-cases/1"
cases = document["cases"]
assert cases and len({case["name"] for case in cases}) == len(cases)

def intact(case, raw):
    return hashlib.sha256(raw).hexdigest() == case["provenance"]["sha256"]

for case in cases:
    raw = (root / case["file"]).read_bytes() if "file" in case else case["output"].encode("utf-8")
    assert intact(case, raw), case["name"]
    facts = case["provenance"]
    if "receipt" in facts:
        facts = next(fact for fact in json.loads((root / facts["receipt"]).read_text())["cases"]
                     if fact["name"] == case["name"])
    assert case["command"] == shlex.join(facts["argv"])
    assert case["version"] == "bun 1.3.14"
    assert case["termination"]["kind"] == "exited"
    assert case["completeness"] == "complete"
    assert case["presentation"] == "unknown"
    assert case["status"] == "passthrough"

raw = cases[0]["output"].encode("utf-8")
assert raw and not intact(cases[0], b"X" + raw[1:]), "corruption control missed"
assert intact(cases[0], raw), "original failed after in-memory control"
print(f"Integrity: {len(cases)} raw hashes matched; one changed-byte control rejected; original intact.")

by_name = {case["name"]: case for case in cases}
for proposal in json.loads((root / "proposals.json").read_text())["proposals"]:
    original = by_name[proposal["name"]]["output"].encode("utf-8")
    proposed = proposal["output"].encode("utf-8")
    print(f"Literal proposal {proposal['name']}: {len(original)} -> {len(proposed)} UTF-8 bytes; "
          f"potential {len(original) - len(proposed)} bytes; SHA-256 {hashlib.sha256(proposed).hexdigest()}.")
