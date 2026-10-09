# L04 provenance and replay

Run from this worktree:

```sh
python3 fixtures/profiles/golangci-lint/capture.py
```

Requires existing golangci-lint **2.11.4**, reported commit **8f3b0c7**, and existing Go.
The receipt records resolved binary path/SHA-256, full immutable source commit,
verbatim version/build metadata, Go version/hash, Python/platform, recipe hash,
original argv/cwd/environment, exit, bytes/hash and EOF. No installs or downloads of
Go dependencies: GOTOOLCHAIN=local, GOPROXY=off, GOSUMDB=off, GOWORK=off, GOENV=off.
Tiny original sources/configs are inline in capture-receipt.json with hashes;
temporary sources/cache are removed by the collector after complete capture.

Boundary: one stdout pipe, stderr redirected into it before execution, subprocess
read through EOF then wait. No PTY, shell wrapper, normalization or separate-stream
concatenation. Original byte files preserve cross-stream order, trailing LF and
Unicode. Timeouts fail the collector instead of inventing complete output.
Replay timestamps/timings/cache/temporary paths can differ; committed artifacts are
the actual captured run, not deterministically regenerated pseudo-output.

## License-only donor archive

- Repository: https://github.com/golangci/golangci-lint
- Commit: `8f3b0c7ed018e57905fbd873c697e0b1ede605a5`
- Pinned path: `LICENSE`
- URL: https://raw.githubusercontent.com/golangci/golangci-lint/8f3b0c7ed018e57905fbd873c697e0b1ede605a5/LICENSE
- License: GPL-3.0; copied verbatim to `LICENSE.golangci-lint.txt`.
- Modification record: none. Receipt pins exact license hash. No upstream code or
  fixtures copied. Original tiny modules/configs use this repository's MIT license.
- Existing producer binary reports `vcs.revision` matching this commit and
  `vcs.modified=false`; this is reported build metadata, not independently attested
  reproducible build or release-checksum verification.

`cases.json` uses `hugr-lean/native-cases/1`: one `file` per case, no inline output.
`archives` contains string paths for every noninput `.txt`: license, Go version and
binary build metadata. Receipt separately binds archive hashes/commands/exits.
No reduction proposals are declared. CASES.md records finite coverage and blockers.
