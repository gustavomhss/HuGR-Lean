# P05 native pip install captures

Owner: P05, capture-only. Baseline: `07ffe15e2263c2925778022194c5385807216603`.
Branch: `campaign/native-v2/P05`. No parser, registry, TypeScript or CI changes.

## Origin and boundary

`capture.py` is original project material under this repository's MIT license.
Local wheels and in-tree PEP 517 backend are original, tiny synthetic projects;
their exact input SHA-256 values are in `capture-receipt.json`. No donor code copied.
Public tools/packages: pip 25.3 (MIT), colorama 0.4.6 (BSD-3-Clause).
PyPI release JSON URLs, response hashes, immutable wheel URLs and published wheel
SHA-256 values are in the receipt. Those URLs were fetched successfully; pip 25.3
was installed from public PyPI into the capture-only venv, not globally.
Public package implementation files are not vendored here. No source modifications.

Host: macOS, CPython 3.14.5; exact platform and pip version output in receipt.
Temporary project: `/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/P05-native-capture`.
`/var` resolves to `/private/var` on this host. Only that temporary venv changed.
Bare `pip` resolved through the venv's leading PATH entry. Module invocations used
the actual absolute venv Python path; neither launcher was rewritten or aliased.

Each case records actual argv, shell-quoted command, cwd, exit status, elapsed wall
time, complete output byte length and SHA-256. `stderr=STDOUT` joined both streams
at process creation; captured bytes were not normalized, trimmed or filtered.
No PTY/terminal rendering or OpenCode host adapter authentication is claimed.
Native ephemeral cache paths and user log timing remain intact.

Environment: PIP_CONFIG_FILE=/dev/null, temporary PIP_CACHE_DIR, other inherited
PIP_* variables removed, PATH prefixed by temporary venv bin. Ordinary host
environment otherwise inherited. No runtime flag injection or command rewriting.
Public cases explicitly request public index, zero retries and 15-second network
timeout. Each install has a 90-second subprocess deadline. All captured processes
exited normally, including recorded nonzero failures; no timeout output substituted.

## Recipe

From this worktree, with Python 3.14.5 and uv available:

```sh
python3 fixtures/profiles/pip-install/capture.py /absolute/existing/parent/new-P05-project
```

Project destination must not exist. Recipe builds deterministic local wheel bytes,
requirements, constraints and backend, then captures fresh/satisfied/reinstall
states sequentially. Public index responses, native cache paths and wall times can
change across runs. Re-running intentionally replaces this family's capture files.
Initial capture's backend lookup found the already-installed package; that genuine
snapshot is retained as `binary-satisfied-backend`. Two fresh-target follow-ups
captured actual wheel lookup rejection and explicit-source backend execution;
the final recipe includes all three commands in the same order.

## Integrity control

Temporary verifier compared the declared P05 case set, actual UTF-8 byte lengths,
raw SHA-256, command/argv consistency, original temporary input hashes and backend
collision markers. One native warning line in `offline-warning.txt` was changed
once: verifier rejected that case's hash. Original warning restored byte-exactly;
the same verifier then accepted the receipt. This proves capture-integrity checking,
not filter preservation. No repository test/typecheck/build/CI was run.
