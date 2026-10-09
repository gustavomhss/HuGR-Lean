# Pyright native provenance and recipe

Producer: npm `pyright@1.1.408`, MIT, Microsoft Corporation.
Immutable package: `https://registry.npmjs.org/pyright/-/pyright-1.1.408.tgz`.
Registry/installed-lock integrity:
`sha512-N61pxaLLCsPcUuPPHMNIrGoZgGBgrbjBX5UqkaT5UV8NVZdL7ExsO6N3ectv1DzAUsLOzdlyqoYtX76u8eF4YA==`.
Upstream repository: `https://github.com/microsoft/pyright`.
Tag `1.1.408` resolved via GitHub API to commit
`ad444cc7a0923cb6127279fb95fe0b576d96d0d7`; producer path `packages/pyright`;
upstream license path `LICENSE.txt`. Registry does not publish `gitHead` for this version;
the tag pin identifies upstream release, while tarball integrity identifies the npm artifact.

Recovery reused prior agent's isolated install at
`/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/L08-pyright-native`.
Installed package version, `--version`, installed lock integrity and current npm registry metadata agree.
The earlier install's stdout/stderr and timestamp were not retained; no fresh-install receipt is claimed.
Capture receipt records exact argv, command quoting, resolved source cwd, version output, platform,
Node/npm versions, selected inherited environment, source hashes, entry/license hashes, termination,
completeness and raw output SHA-256/bytes. `evidence.json` adds exact EOF bytes.

## Reproduce in an isolated npm directory

Use a new empty temporary directory for `ISOLATED`; keep the repository dependencies untouched.
From this worktree root:

```sh
npm install --prefix "$ISOLATED" --ignore-scripts --no-audit --no-fund --save-exact pyright@1.1.408
python3 fixtures/profiles/pyright/capture.py "$ISOLATED/node_modules/.bin/pyright"
python3 fixtures/profiles/pyright/evidence.py
```

The capture script checks the exact native version. It runs eleven tiny direct argv commands with
cwd `source/`, stdin DEVNULL, stdout PIPE and stderr redirected to that pipe at child spawn,
without a shell or PTY. Each child has a 90-second timeout; a timeout retains partial bytes and marks
the observation truncated/timed_out. Actual captures all exited. Pipe bytes are written directly,
never reconstructed from terminal text or a JSON serialization of the output.
Presentation is `unknown` per public schema, with pipe details in the receipt.
Absolute `/private/var` paths, JSON `time` and duration fields vary on replay; compare native evidence,
not historical hashes across environments. Verbose shows ambient Python 3.14 library search paths,
while local config requests Python 3.12/Darwin. The tiny project is not a hermetic Python environment.

## Material and modifications

- `source/**` and the initial `capture.py` were existing untracked prior-agent work in this worktree.
  Recovery read and reused all seven source files unchanged. No third-party project/example was copied.
- Raw `.txt` captures were generated anew by the pinned native CLI, not copied or hand-authored.
  Raw bytes were not edited. Candidate files are explicitly modified derivatives: only outside-string
  JSON layout whitespace removed; original terminal LF run retained.
- `capture.py` recovery modifications: file-only artifacts/manifest, complete receipt, version assertion,
  timeout preservation. `evidence.py` is local capture-artifact tooling, not a runtime reducer.
- `LICENSE-PYRIGHT.txt` copies installed `node_modules/pyright/LICENSE.txt` verbatim from the above
  integrity-pinned package / release commit, MIT, unmodified; hash is recorded in capture receipt.
- Local CASES/provenance/metadata contain no donor parser implementation. No reduction support claimed.
