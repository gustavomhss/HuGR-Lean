# L07 native provenance and reproduction

Recovered interrupted agent's untracked `capture.py` and reused its original tiny
projects, case names, launchers, and pins. Modification record: added actual function
context, strict/missing config, syntax, clean/Unicode JSON and verbose plugin cases;
plugin now flushes native-shaped stdout and stderr; collector derives/asserts version
and dependency pins, stores EOF/hash/recipe/source receipts, and generates artifacts.
No donor implementation or fixture copied. Original packet-authored Python sources
are embedded verbatim with UTF-8 sizes and SHA-256 in `capture-receipt.json`.

Tool: mypy 1.18.2 (compiled: yes), public PyPI; MIT license:
<https://github.com/python/mypy/blob/v1.18.2/LICENSE>.
Package release: <https://pypi.org/project/mypy/1.18.2/>.
This is tool provenance, not a donor-copy claim; no upstream code was vendored.

Capture host: macOS 15.3.2 x86_64; isolated CPython 3.12.13 local venv recovered
at `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/L07-mypy-venv`.
Local venv has no pip module: attempted `python -m pip freeze` failed with
`No module named pip`; collector uses `importlib.metadata` instead. No global install.
Recovered environment's creation command is unavailable; do not invent it.
Executed pin installation/check command using uv 0.11.18:

```sh
uv pip install --python /var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/L07-mypy-venv/bin/python --default-index https://pypi.org/simple --only-binary :all: mypy==1.18.2 mypy-extensions==1.1.0 typing-extensions==4.15.0 pathspec==0.12.1
```

uv found all four installed pins and reported `Checked 4 packages`; collector then
asserted exact distribution versions and real `python -m mypy --version` output.
Fresh reproduction may first create local venv with `uv venv --no-project --python
3.12 <absolute-venv-path>`; this is a recipe, not claimed historical execution.

Actual capture command, run using venv Python:

```sh
/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/L07-mypy-venv/bin/python fixtures/profiles/mypy/capture.py /var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/L07-mypy-venv
```

`cases.json` stores raw merged output exactly once as inline JSON strings; decoded
UTF-8 is original bytes, including empty/LF outputs. No `file` property is also
declared. Per case: original argv, shlex-rendered command, actual temporary cwd,
version/platform, completion time, exit, completeness, presentation, UTF-8 bytes,
SHA-256, final-LF flag and last-byte hex. stdout PIPE and stderr STDOUT share pipe
before exec; `subprocess.run` drains through EOF and waits, timeout 60 seconds.
Strict UTF-8 decoding; no normalization, trim, PTY or command rewriting. Explicit
`--no-incremental --cache-dir /dev/null` were original executed arguments, not
post-capture additions. Python module commands remain original module argv.

Environment receipt records controlled settings/removals; other environment inherited.
No ambient mypy config exists in generated tiny project's cwd; explicit configs are
source snapshots. Temporary projects removed by Python after capture; recipe/source
receipt preserves reproduction inputs. Absolute paths/timings naturally differ on rerun.
Collector's exact SHA-256 is in receipt. Native verbose metric rows also appear there
as evidence pointers; full unmodified raw output remains in manifest.

No source/test/shared edits. No fixture tests/typecheck/full checks/CI were run.
CAPTUREONLY status and zero approved savings are explicit in `CASES.md`.
