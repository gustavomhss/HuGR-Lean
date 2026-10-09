# B04 provenance and reproduction

## Pinned producer

- Public npm package: `rollup@4.52.4`.
- Tarball: `https://registry.npmjs.org/rollup/-/rollup-4.52.4.tgz`.
- SRI: `sha512-CLEVl+MnPAiKh5pl4dEWSyMTpuflgNQiLGhMv8ezD5W/qP8AKvmYpCOKRRNOh7oRKnauBZ4SyeYkMS+1VSyKwQ==`.
- npm `gitHead`: `cd81da74af1d11fda0ee1752cc26f6dc8217e9ca`.
- Upstream: `https://github.com/rollup/rollup/tree/cd81da74af1d11fda0ee1752cc26f6dc8217e9ca`.
- License: MIT for Rollup; complete published `node_modules/rollup/LICENSE.md`
  copied verbatim into `LICENSE-ROLLUP.txt`, including bundled dependency notices.
- Copied license source: pinned tarball `package/LICENSE.md`, installed as
  `node_modules/rollup/LICENSE.md`; npm metadata binds release to stated gitHead.
  No claim that generated bundled notice equals upstream checkout's license file.
  Copy modification record:
  filename changed to `.txt`; contents unchanged. SHA-256:
  `bc91f5e3c168054fba08a1ea209a89c0fc10bc0667e52911481ee284c07ef69b`.

All tiny JS/config sources are original packet-authored material, embedded
verbatim in `capture.py` and `capture-receipt.json` with UTF-8 sizes and hashes.
No upstream implementation or fixtures copied. Compiled/native modules execute
only in isolated temporary install and are not vendored. Native installed package
is `@rollup/rollup-darwin-x64@4.52.4`; package metadata is in receipt and npm SRI
is in exact lock archive. All resolved dependency versions/SRIs are locked there.
Registry metadata is package provenance, not independently verified correspondence
between compiled module and upstream source commit.

## Executed recipe

```sh
python3 fixtures/profiles/rollup/capture.py
```

Python 3.14.5; Node v22.17.1; npm 10.9.2; macOS 15.3.2 x86_64.
Collector creates `B04-rollup-*` under preapproved temporary parent, with separate
install, cache and fresh per-case project directories. `package.json` contains
exact `rollup: "4.52.4"`. Actual installation argv, cwd, exit and merged output
hash are in receipt:

```sh
/usr/local/bin/npm install --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --cache <temporary-root>/npm-cache
```

No global install, private registry, lifecycle scripts, project build or large
dependency project. `--ignore-scripts` applies to installation only: real Rollup
config plugins execute normally during native captures. Metadata command and
full returned bytes are archived, including registry's unrelated version history;
that archive does not expand the one captured version's compatibility claim.
The npm lock records exact resolution and integrity, which npm enforces on fetch.

Collector drains stdout PIPE with stderr redirected to same pipe before exec,
then waits for child termination. `subprocess.run`, 120-second timeout, strict
UTF-8 decoding only for version/metadata. Case bytes written without decoding,
trim, ANSI removal, reordering, newline replacement, PTY or truncation. Observed
outputs are not normalized. Per case: original argv, shell-rendered command,
cwd, version/platform, exit, completion timestamp, completeness/presentation,
SHA-256, UTF-8 size, final-LF flag and last-32-byte hex. Recipe SHA in receipt.

Environment overrides/removals are recorded; otherwise inherited. Fresh cwd has
only packet sources, with explicit config where requested. Plugin outputs are
arbitrary user bytes, not authenticated native progress. Quiet plugin capture
retains no-LF final bytes; normal plugin capture joins those bytes to native
completion row. Pipes merge before execution, not by post-hoc concatenation.

All native output files and sourcemaps are copied byte-for-byte into
`artifacts/<case>/<original-relative-path>.txt`, with original path, size and hash
in receipt. `.txt` extension is archival only. Source maps preserve their original
source references/content. Sources, raw outputs, artifact names and hashes can
be compared independently without invoking HuGR-Lean. Temporary install/projects
are removed after capture; rerun paths, stack offsets and timings can differ.

`cases.json`: `hugr-lean/native-cases/1`; one file-backed input per case,
`status: passthrough`. `archives` contains string paths for license, npm metadata,
install output, exact lock and every generated artifact. No candidate archive.
Full raw output stays in original case files, not duplicated as inline strings.
