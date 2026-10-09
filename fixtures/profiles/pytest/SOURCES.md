# R01 native capture provenance and replay

Exclusive ownership: `fixtures/profiles/pytest/**`. Baseline `248c303`.
Project programs and capture/finalization recipes are original MIT work. Local MIT
LICENSE snapshot copied unchanged from baseline root `LICENSE`; no donor code used.
Dependency license bytes copied unchanged from pinned installed distributions;
original dist-info paths, versions and SHA-256s recorded under receipt `packages`.
pytest/pytest-xdist/pluggy/execnet/iniconfig use MIT; Pygments BSD; packaging dual
Apache-2.0/BSD. Fixture licenses do not introduce runtime dependencies.

## Setup and recipe

From this directory, with `$TEMP` an existing isolated temporary parent:

```sh
python3 -m venv "$TEMP/R01-pytest-venv"
"$TEMP/R01-pytest-venv/bin/python" -m pip --isolated install --index-url https://pypi.org/simple --only-binary=:all: --require-hashes -r requirements.lock
"$TEMP/R01-pytest-venv/bin/python" capture.py "$TEMP"
"$TEMP/R01-pytest-venv/bin/python" -m pip --isolated install --dry-run --ignore-installed --index-url https://pypi.org/simple --only-binary=:all: --report package-resolution.json -r requirements.txt
"$TEMP/R01-pytest-venv/bin/python" finalize-metadata.py
```

Replay in a fresh copy of this fixture directory **without existing capture JSON or
raw files**. Resume logic is specific to the recorded initial preparation failures;
it deliberately retains already captured valid cases. Timing/worker scheduling/root
paths may differ. No output normalization, timestamp replacement or stream rewriting.
Public argv records direct `pytest`; `capture.executedArgv` records the actual isolated
venv executable. This distinction is explicit, not an executed-command substitution.

Original install used exact `requirements.txt` pins and public PyPI wheel-only mode.
Subsequent dry-run resolution records wheel URLs/SHA-256s; `requirements.lock` makes
replay hash-enforced. This report is resolution evidence, not attestation that wheel
archives were independently hashed during original install. Installed Python modules
and copied licenses are directly hashed in the native receipt; Python executable too.
Python interpreter itself is host 3.14.5; packages live only in the isolated venv.

## Preparation failures and modification record

First attempt failed writing the first capture, ENOSPC: `FAILED-PREPARATION.md`.
Next attempt produced complete raw captures but serial collection hit ENOSPC, and
custom plugin cases failed import because direct pytest launcher omitted cwd from
module search. Those five raw failures and the whole original receipt remain under
`failed-captures/`, excluded from acceptance inputs, explicitly archived.

Recipe then added explicit temporary-root `PYTHONPATH`, disabled bytecode writes and
resumed only those five failed preparation cases. Other five successful captures
remain unchanged, including native disk-pressure warnings; never cleaned from logs.
Prior receipt pins prior recipe hash; current receipt pins resumed executed recipe.
Prior recipe source was not snapshotted before this edit; its change record is above.
Both receipt epochs retain per-case cwd/environment/argv/hash/EOF/exit facts. The
finalization recipe only adds archive path declarations and replay wheel hash pins;
raw bytes and capture receipts remain untouched.

Stderr merged into stdout pipe before process creation; subprocess reads through EOF
and waits for exit, no PTY. `finalLF` and last-byte hex preserve exact EOF. `file`
alone supplies case input; no duplicate inline output. Passthrough means independent
provisional KEEP is whole raw input, not a measured production-filter verdict.
Inherited environment is sanitized for Python/pytest options and color, with explicit
per-case overrides; full hermetic host environment or producer authentication is not
claimed. Worker stdout collision inside failing captured output is genuine original
test stdout. Terminal-summary collisions are genuine local plugin writes.
