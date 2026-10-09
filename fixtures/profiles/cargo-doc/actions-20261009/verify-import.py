"""Focused transport closure and unchanged historical-case validation."""
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent
FAMILY = ROOT.parent
spec = importlib.util.spec_from_file_location("capture", ROOT / "capture.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.verify(ROOT)
parent = json.loads((FAMILY / "cases.json").read_text())
historical = json.loads(subprocess.check_output(["git", "show", "22ddaa6:fixtures/profiles/cargo-doc/cases.json"]))
assert parent["cases"][:len(historical["cases"])] == historical["cases"], "historical cases changed"
supplement = json.loads((ROOT / "supplement.json").read_text())
new = parent["cases"][len(historical["cases"]):]
assert len(new) == len(supplement["cases"]) > 0, "empty/missing imported cases"
for captured, adapted in zip(supplement["cases"], new):
    assert adapted["id"] == "actions-" + captured["id"]
    assert adapted["file"] == ROOT.name + "/" + captured["file"]
    assert "output" not in adapted, "duplicate inline input"
    raw = (FAMILY / adapted["file"]).read_bytes()
    assert module.sha(raw) == adapted["provenance"]["sha256"], "adapted raw hash mismatch"
    assert adapted["termination"] == {"kind": "exited", "code": 0} and adapted["completeness"] == "complete"
    assert adapted["status"] == "passthrough" and adapted["removableBytes"] == 0
    assert adapted["version"] == captured["version"] and adapted["platform"] == captured["platform"]
    for key in ["record", "recipe"]:
        assert adapted["provenance"][key] == ROOT.name + "/" + captured["provenance"][key]
        assert (FAMILY / adapted["provenance"][key]).is_file()


def closure(manifest, files):
    inputs = [c["file"] for c in manifest["cases"]]
    archives = manifest["archives"]
    assert inputs and len(set(inputs)) == len(inputs), "empty/duplicate inputs"
    assert len(set(archives)) == len(archives), "duplicate archive"
    assert not set(inputs) & set(archives), "input/archive overlap"
    declared = set(inputs) | set(archives) | {"cases.json", "CASES.md", "SOURCES.md"}
    # Historical source/recipes are not newly declared by this supplement.
    historical_files = {str(p.relative_to(FAMILY)) for p in FAMILY.rglob("*") if p.is_file() and not p.is_relative_to(ROOT)}
    assert files <= declared | historical_files, "undeclared supplement file"
    assert set(inputs + archives) <= files, "missing declared file"


files = {str(p.relative_to(FAMILY)) for p in FAMILY.rglob("*") if p.is_file()}
closure(parent, files)
try:
    closure(parent, files | {ROOT.name + "/undeclared-probe.txt"})
except AssertionError as error:
    assert str(error) == "undeclared supplement file"
else:
    raise AssertionError("undeclared-file control accepted")
try:
    closure(parent, files - {new[0]["file"]})
except AssertionError as error:
    assert str(error) == "missing declared file"
else:
    raise AssertionError("missing-file control accepted")
print("Imported case/archives closure verified; missing/extra controls rejected; historical cases unchanged")
