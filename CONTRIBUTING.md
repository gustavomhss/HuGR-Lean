# Contributing

Issues and pull requests are welcome at <https://github.com/gustavomhss/HuGR-Lean>.

## Setup

Node 22+ and npm.

```sh
npm ci
npm run check   # structure, typecheck, tests, build
npm run smoke   # pack, install and inspect the actual tarball
```

For a real-host check, point `OPENCODE_BIN` at an OpenCode binary. The scripts use an isolated
temporary HOME/XDG and a local model mock; they never read your OpenCode configuration.

```sh
OPENCODE_BIN=/path/to/opencode node scripts/package-smoke.mjs --opencode
OPENCODE_BIN=/path/to/opencode node scripts/opencode-raw-smoke.mjs
```

## Rules

- Keep it one small TypeScript package with no runtime dependencies. Core and profiles do no I/O.
- Unknown output, failures and truncated output must stay recoverable: never drop a failure line,
  and never emit a lossy summary without storing the original.
- A new profile needs real captured fixtures with their source recorded in a `SOURCES.md`,
  and tests that show the required evidence survives. Copied third-party material needs its
  path, commit, license and a modification record (see [NOTICE](NOTICE)).
- Source spans use UTF-16 indices; size metrics use UTF-8 bytes.
- Files should stay under 400 lines (hard limit 750); each `src/` module keeps its README,
  OWNERSHIP, MAINTENANCE, MANUAL and BLAST_RADIUS documents current. `npm run structure` checks this.
- Add a line to [CHANGELOG.md](CHANGELOG.md) for user-visible changes.

By contributing you agree that your contribution is licensed under the MIT License.
