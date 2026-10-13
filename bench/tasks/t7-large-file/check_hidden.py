"""Hidden success check for t7-large-file. Run with the workspace as cwd: python3 -I check_hidden.py <workspace>."""
import ast
import subprocess
import sys
from pathlib import Path

ws = Path(sys.argv[1])
more = (ws / "more_itertools/more.py").read_text()
tree = ast.parse(more)
top = [n.name for n in tree.body if isinstance(n, (ast.FunctionDef, ast.ClassDef))]
assert "pairwise_diff" in top, "pairwise_diff is not a top-level definition in more.py"
assert top[top.index("difference") + 1] == "pairwise_diff", "pairwise_diff is not directly after difference"


def all_of(path):
    for node in ast.parse(path.read_text()).body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", "") == "__all__" for t in node.targets):
            return list(ast.literal_eval(node.value))
    raise AssertionError(f"no __all__ in {path}")


for path in (ws / "more_itertools/more.py", ws / "more_itertools/more.pyi"):
    names = all_of(path)
    assert "pairwise_diff" in names, f"pairwise_diff missing from __all__ of {path.name}"
    assert names == sorted(names), f"__all__ of {path.name} is not sorted"
assert "def pairwise_diff(" in (ws / "more_itertools/more.pyi").read_text(), "no stub in more.pyi"
assert ".. autofunction:: pairwise_diff" in (ws / "docs/api.rst").read_text(), "no api.rst entry"

probe = r"""
import more_itertools as mi
assert list(mi.pairwise_diff([1, 4, 9, 16])) == [3, 5, 7]
assert list(mi.pairwise_diff([5])) == []
assert list(mi.pairwise_diff([])) == []
assert list(mi.pairwise_diff(iter([2.5, 1.0]))) == [-1.5]
it = mi.pairwise_diff(x for x in range(10**9))
assert next(it) == 1  # lazy
"""
subprocess.run([sys.executable, "-c", probe], cwd=ws, check=True)
subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests/test_more.py"],
               cwd=ws, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print("ok")
