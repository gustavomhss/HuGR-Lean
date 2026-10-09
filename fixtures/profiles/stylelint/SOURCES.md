# Stylelint L09 capture provenance

Capture-only packet at base `63d3ece`; branch `campaign/native-v2/L09`.
Exclusive ownership: `fixtures/profiles/stylelint/**`. No runtime profile admitted.

## Pinned producer

- Stylelint npm `16.25.0`, MIT, upstream `https://github.com/stylelint/stylelint`.
- Commit `a6efacbd24c1d3cc94f9b4d4eb68696fcf4b0d85` (npm registry gitHead).
- Tarball `https://registry.npmjs.org/stylelint/-/stylelint-16.25.0.tgz`.
- SRI `sha512-Li0avYWV4nfv1zPbdnxLYBGq4z8DVZxbRgx4Kn6V+Uftz1rMoF1qiEI3oL4kgWqyYgCgs7gT5maHNZ82Gk03vQ==`.
- `producer.json` binds tarball SHA-256, verified SRI, install argv/output hash and license hash.
- `LICENSE-STYLELINT.txt`: verbatim npm `package/LICENSE`; no modifications.
- `package-lock.json`: complete resolved transitive versions/integrities, not a new root dependency.
- CSS/config/plugin sources authored for this packet; no donor fixtures or parser copied.

## Native boundary

Python subprocess executes exact argv without shell. One merged pipe (`stdout=PIPE`,
`stderr=STDOUT`) preserves native bytes through process exit and pipe EOF. No PTY,
stream reconstruction, ANSI stripping, newline rewriting, or substituted formatter.
Default formatter is native string; verbose and JSON are explicitly requested in argv.
`capture-receipt.json` records per-case cwd, exact argv, exit, UTF-8 byte length,
SHA-256, EOF tail, platform, Node/npm versions, source hashes and fix effects.
`cases.json` uses file inputs only, never duplicate inline output. Every noninput
`.txt` is explicitly archived, including license and unapproved candidates.

Host: macOS 15.3.2 x86_64; Node v22.17.1; npm 10.9.2. Explicit environment:
NO_COLOR=1, FORCE_COLOR=0, TERM=dumb, NODE_OPTIONS unset. Other host environment
inherited; no hermetic-platform or producer-authentication claim. Stack paths/PIDs
are native evidence and can vary on recapture.

## Reproduction recipe

From this worktree, choose a nonexistent child of the approved temp directory:

```sh
python3 fixtures/profiles/stylelint/capture.py /var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/L09-stylelint-recapture
python3 fixtures/profiles/stylelint/propose.py
```

Collector refuses an existing project. Installs only pinned local Stylelint with
`--ignore-scripts --no-audit --no-fund`; registry SRI checked before install.
Sources reset before each invocation. Each fix capture saves all CSS before/after
bytes and hashes, including unchanged files. Capture scripts regenerate artifacts;
run reproduction in a disposable copy to preserve this original receipt.

## Verification boundary

Only native capture commands, provenance collection, artifact generation and git
review performed. No tests, typecheck, build, smoke, benchmark, mutation probe or CI.
Manifest dispositions are declared passthrough expectations, not executed filter
results. Independent lead review and corpus wiring remain pending.
