# P02 native sources

Original tiny projects and bounded capture recipe: `capture.py` (repository MIT;
no donor source copied). Package manifests, workspace YAML, .npmrc peer setting and
collision script are inline original source. Native stdout/stderr and generated
chalk lockfile are captured without edits, normalization, truncation or deduplication.

- Capture date: 2026-10-08; darwin x86_64, macOS 15.3.2; Node v22.17.1.
- Assigned baseline: `07ffe15e2263c2925778022194c5385807216603`.
- Disposable root `R`: `/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/p02-pnpm-83cb9upg`.
- Bootstrap argv: `["npm","install","--prefix",R+"/tool","pnpm@10.18.3","--ignore-scripts","--no-audit","--no-fund","--registry=https://registry.npmjs.org/"]`; exit 0.
- pnpm public npm package 10.18.3, MIT, installed locally; executable `P = R + /tool/node_modules/pnpm/bin/pnpm.cjs`.
- Version argv `["node",P,"--version"]`; exit 0, raw `10.18.3\n`.
- Executable SHA-256: `b276da51dc8ca5b0d3ee3371695b50fc8b3244b281b091c63a3f082a88dadeb9`.
- Every install exact argv, project cwd relative to R, isolated store, output SHA-256
  and exit status: `cases.json`. Earlier `command` now records actual Node argv
  without rewriting it to pnpm. Earlier raw files and hashes remain unchanged.
- Help argv `["node",P,"install","--help"]`, cwd R; exit 0; SHA-256
  `1485a45242c945a4262f1089bd9eaaf3ac186a0b8ea4983d996e2108b9a34183`.
- `chalk-lock.yaml` pins chalk 4.1.2 and five transitive MIT packages with integrity
  hashes (ansi-styles 4.3.0, color-convert 2.0.1, color-name 1.1.4, has-flag 4.0.0,
  supports-color 7.2.0). Registry: `https://registry.npmjs.org/`. Nothing executed.
- Lockfile SHA-256: `cfe2171f0923d3f2e58f8602d788eab7e7c471591a3a401b1aa2d7830aab760d`.
- Earlier capture.py SHA-256 before metadata correction: `6da0a816f588e00de9258ac14193aa2ff127f3858ad095736c0e5a4bd579f310`.

All installs: subprocess timeout 60s (bootstrap 90s), shared OS pipe for stdout
and stderr through EOF, observed exit, no PTY. Every recorded case exited before
deadline. Presentation metadata stays unknown; raw pipe bytes are authoritative.
Lifecycle text has no authenticated producer boundary within merged transcript.
Inherited environment with isolated HOME/XDG_CONFIG_HOME/npm cache, fixed public
registry, fetch retries 0/timeout 15000ms; CI/FORCE_COLOR/NO_COLOR/PNPM_HOME/NODE_OPTIONS
removed. Default reporter; original argv has no forced reporter/color flags.
Native `<ROOT>` in frozen error is pnpm's own rendering, not capture substitution.
First local install includes native update notice; retained intact.
`git diff --check` reports native blank EOF lines in frozen-mismatch.txt and
peer-strict.txt. Those bytes are hash-authenticated output and retained intact.

Replay from worktree: `python3 fixtures/profiles/pnpm-install/capture.py`.
Actual peer follow-up used same isolated tool/root after observing workspace links
gave no peer warning: `python3 fixtures/profiles/pnpm-install/capture.py R`.
Default recipe now includes those file-dependency peer cases directly. Fresh replay
changes cwd/timings/latest-version notices; fixture hashes authenticate this capture,
not byte-identical future registry output. No source inventory/receipt framework.

Hash recipe, run from this fixture directory:

```sh
shasum -a 256 capture.py chalk-lock.yaml install-help.txt *.txt
```

For indexed files compare SHA-256 against `cases.json` provenance. Completion means
complete command output at this OS-pipe boundary, not terminal screen reconstruction.

## Direct producer-safe captures

`capture-direct.py` supplies original tiny sources and direct argv. It reuses
isolated pinned tool above through PATH prefix `R/tool/node_modules/.bin`;
actual child argv starts `pnpm`, verified version stdout `10.18.3\n`.
New disposable root: `/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/p02-direct-ch9oyios`.
Every safe install includes original `--ignore-scripts --ignore-pnpmfile`.
Flag is available in pnpm 10.18.3 and all safe commands exit 0. Enabled malicious
`.pnpmfile.cjs` witness keeps only ignore-scripts and emits native-looking progress
plus Unicode logs through readPackage. It remains exact. All outputs use complete
merged OS pipe through EOF, observed exit, default reporter, no PTY, 60s deadline.
Fresh HOME/XDG_CONFIG_HOME; same public registry and bounded network policy.
`safe-chalk-lock.yaml` records direct cold dependency graph/integrities.
New output argv/hash/termination records append to existing minimal cases.json.
Hash recipe additionally includes `capture-direct.py safe-chalk-lock.yaml`.
