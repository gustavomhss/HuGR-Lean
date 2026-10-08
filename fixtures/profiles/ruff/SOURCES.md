# Ruff native provenance

Original tiny source authored for this packet; no donor source copied. Source snapshots and
native output are embedded verbatim in unchanged `capture-receipt.json`, each with UTF-8 size and SHA-256.
Flat `cases.json` retains actual original argv and bindings. Ten output blobs also reside byte-exact
in `.txt`; three JSON blobs await a no-final-LF write-tool exception (see CASES.md).
Ruff output is unmodified, including absolute `/private/var/...` JSON filenames, Unicode,
trailing-newline presence/absence, warnings and nonzero results. Source names match original argv.

- Capture date: 2026-10-08. Host: macOS 15.3.2 x86_64.
- Baseline: `07ffe15e2263c2925778022194c5385807216603`.
- Worktree: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-native-v2-L03`.
- Branch: `campaign/native-v2/L03`; PR base: `campaign/native-integration`.
- Version receipt: direct binary `--version`, exit 0, exact `ruff 0.14.0\n`, 12 bytes,
  SHA-256 `4c19d978a40e405035f16d9c5ae54e3a29a88823e31420d53764c0f64259dbb7`.
- Executable: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/L03-ruff-venv/bin/ruff`.
- Binary SHA-256: `52b2bda1dc20d5c781eb43a90f6e5f228d448f2c93f6a8117e3f6751cd59a30b`.
- Disposable producer: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/L03-ruff-capture.py`,
  4824 bytes, SHA-256 `ce4ba5eba72d5aa09edb5d404f94ea6a7056ec2f3185984c771c98bc2f1eb358`.
  No retained collector dependency. `Popen` received direct binary plus recorded original arguments;
  stdout PIPE, stderr STDOUT before exec, `communicate(timeout=20)` through EOF, strict UTF-8 decode.
  Version was captured and asserted before case execution. Cases ran in manifest order.
  Ruff alone changed fix/format source; before/after bytes were read around each invocation.
- Environment: inherited, except RUFF_OUTPUT_FORMAT, RUFF_CONFIG, FORCE_COLOR,
  CLICOLOR_FORCE removed. `--isolated`/`--no-cache` always explicit original arguments.
- Installation: uv 0.11.18, isolated disposable CPython 3.14.5 venv, binary-only public PyPI.
  No global package install or runtime flag injection.

Exact installation commands:

```sh
uv venv --no-project /var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/L03-ruff-venv
uv pip install --python /var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/L03-ruff-venv/bin/python --default-index https://pypi.org/simple --only-binary :all: ruff==0.14.0
```

Ruff package upstream: <https://pypi.org/project/ruff/0.14.0/>;
tool license MIT, <https://github.com/astral-sh/ruff/blob/0.14.0/LICENSE>.
No upstream implementation/fixtures copied, so no donor commit/modification record applies.
Inline dictionary sharing stores identical observed bytes once; it does not deduplicate output.
Manifest receipts describe original pipe capture, not terminal-rendered presentation.
