# HuGR-Lean releases

Each `## X.Y.Z — date` section is the GitHub release body for tag `vX.Y.Z`
(extracted by `scripts/release-tag.mjs`). Older sections are kept unchanged as history.

## 0.4.0 — 2026-10-12

First npm release: `npm install hugr-lean`, or add `"hugr-lean"` to the `plugin` list in `opencode.json`.

### What changed

- New default `mode: "summarize"`. Large `bash` output (above 4 KiB) keeps head, tail and failure lines;
  `read` and `webfetch` cap at 8 KiB (read names the next `offset`). Thresholds are configurable.
- Failures stay whole: on a nonzero or unknown exit every failure line and its continuation block is kept.
- Every lossy summary stores the complete original locally and ends with `[full output: lean recall <id>]`.
  The model recalls it with the `lean_recall` tool; people use `hugr-lean recall <id> [--lines A-B]`.
- Lossless cleanup with no recall: ANSI and carriage-return stripping, repeated-line marking,
  read line-number compaction.
- `mode: "lossless"` keeps the 0.3 exact-evidence behavior.

### Numbers

Offline replay over 27 recorded OpenCode session databases (343,045 tool calls, 1,626.1 MB):
**41.3% fewer tool-output bytes** with the defaults (bash 58.3%, file read 36.7%, webfetch 60.8%).
This is an upper bound: it cannot count the bytes added back by recall or follow-up reads, it is one
developer's corpus, and bytes are not tokens. Details: `docs/BENCHMARK_REAL.md`.

### Upgrading from 0.3

Summaries are now on by default and need the local store (`~/.cache/hugr-lean/raw`, 64 MiB,
seven days, oldest evicted first). For the previous behavior set `"mode": "lossless"`.
`"raw": false` disables storage and therefore summaries.

### Verification

- Local (macOS, Node 22.17.1): `npm pack --dry-run` and `npm publish --dry-run --provenance=false`
  pass with no `npm pkg fix` changes; 191 files, about 205 kB packed.
- Real host, OpenCode 1.18.17 on macOS with an isolated HOME/XDG and a local model mock:
  the installed tarball reduced a Cargo log 1,058 → 248 bytes through both the file route and the
  `"hugr-lean"` package-name route (tuple `enabled` true/false); failed output (exit 101) stayed exact,
  small unknown output reached the model with only CRLF → LF under the summarize default and byte-exact
  under `mode: "lossless"`; raw off created no store, raw on stored one original recovered exactly by
  the CLI; a failing 16,647-byte build log was summarized to 3,249 bytes with its failure lines and a
  recovery line, and `hugr-lean recall` returned the exact original and the requested line range.
- CI: Node 22.17.1 on Linux, macOS and Windows runs structure, typecheck, tests, build, installed smoke
  and pack before publishing. Linux and Windows OpenCode hosts are not separately proven.

### Assets

`hugr-lean-0.4.0.tgz` and `hugr-lean-0.4.0.tgz.sha256`. The npm package is published from
GitHub Actions with provenance.

## 0.2.0 — 2026-09-30

> **Historical notice — 2026-09-30:** This record describes the original 0.2.0 delivery,
> source `69607794cbb2a3ce6707a509777ac648aa859bdd`. Its CI results, assets and reproduction
> commands remain historical; they do not certify the current candidate or asset availability
> at `gustavomhss/HuGR-Lean`. The new destination is source-only for this handoff.
> Current candidate/local-proof/CI status and pending human decisions are in
> [DELIVERY.md](DELIVERY.md); artifact identities are in [DISTRIBUTION.md](DISTRIBUTION.md).
> No new release or npm publication is announced here. The original results below are unchanged.

### Delivered
- One MIT TypeScript package, five modules: core, profiles, raw, opencode, cli.
- Eight reducing profiles; tsc and unsupported variants explicitly preserve original.
- Per-module README, ownership, maintenance, manual and blast radius.
- Compiled JavaScript/declarations, installed CLI, notices and pinned fixture provenance.

### Verification
- `npm run check`: 294 local tests passed, zero skipped; structure/typecheck/build passed.
- CI: Node 22 on Linux/macOS/Windows, including clean-installed tarball smoke.
- Real host: OpenCode 1.18.17 macOS x64 legacy route, local deterministic model mock.
- File and package-name loading, tuple enable/disable, failed and unknown output preservation.
- `opencode-raw-smoke.mjs`: raw off creates no store; raw on persists one material original;
  actual host-runtime storage and Node CLI recovery agree exactly, including Unicode.
- Core preservation guard removed deliberately: required-span test failed; restored source and test passed.
- Cargo streaming refinement preserves the previous grammar; differential and mutation checks passed.
- Measured p95 (20 warmups, 100 samples), background load recorded: core 4.584/17.247 ms,
  raw-off adapter 4.082/17.438 ms for 256 KiB/1 MiB. All four engineering budgets met.
  These are mechanical workload measurements, not universal token/cost/quality claims.

### Reproduce
```sh
npm ci
npm run check
npm run smoke
npm run benchmark
OPENCODE_BIN=/absolute/path/opencode node scripts/package-smoke.mjs --opencode
OPENCODE_BIN=/absolute/path/opencode node scripts/opencode-raw-smoke.mjs
```
Optional `HUGR_SMOKE_DEPS` reuses a validated isolated SDK installation, never user configuration.

### Distribution
GitHub release provides `hugr-lean-0.2.0.tgz` and SHA-256 checksum. Install/enable/upgrade/remove
instructions are in README. npm registry publication requires valid authentication; `npm whoami`
returned `E401` during this delivery. Registry availability is not implied by tarball or loader proof.

### Scope and compatibility
See COVERAGE.md and OPENCODE.md. Profiles use complete admitted native grammars; failures,
unknown output, truncation, overlap or invalid evidence keep original. Real-host proof applies to
the tested route/version/platform; CI proves the package/core/CLI/storage paths it executes.
