# Delivery status

## Published: 0.4.0

`hugr-lean@0.4.0` is published on npm and as a
[GitHub release](https://github.com/gustavomhss/HuGR-Lean/releases/tag/v0.4.0).
It is not an unpublished release candidate.

- Release tag `v0.4.0`: `0660c2b5dc9249816330603160aadfaeb33e5fc7`.
- [Release workflow run 38402476737](https://github.com/gustavomhss/HuGR-Lean/actions/runs/38402476737)
  completed structure, typecheck, tests, build, installed smoke and package checks on Linux,
  macOS and Windows. It does not execute the real OpenCode host.
- npm and GitHub release tarball SHA-256:
  `5ff983c58aa056d82059d5edd5b428478dda50a7683a201b7d844949aa1712a3`.
- npm registry signature and provenance attestation were independently verified. The attestation
  binds the archive to the release commit, tag and workflow; provenance does not prove correctness.
- Default-branch head at audit, `ca71fb8d6da2ca5b17dfb5bda9e7120d5427a3c2`, has the same tree as
  the release tag (`af1e9f1bd9781588fde339737e6c006886c64a4f`). There is no separate CI run
  claimed for that merge commit or for later local changes.

## Evidence and limits

- Independent clean npm-package and tarball installs on Linux/Node 24.22.1 passed CLI `doctor`
  and the installed public-API inspection. The package requires Node 22+.
- Recorded actual-host proof is OpenCode 1.18.17 on macOS with an isolated configuration and
  a local model mock. Linux/Windows package CI is not actual-host proof for those systems.
- The CLI, pure core and raw store work without OpenCode. CLI `filter` is the conservative
  filtering path, not the plugin's summarize mode. See the [README](../README.md#standalone-use).
- The 41.3% number is historical offline tool-output **byte** reduction on one developer's
  private corpus, before additional recall/read traffic. It does not establish net token,
  cost or task-quality improvements. A separate 12-pair historical A/B in
  [PR #163](https://github.com/gustavomhss/HuGR-Lean/pull/163) is inconclusive.
  See [benchmark scope](BENCHMARK_REAL.md#lean-20-summarize-replay-2026-10-12).

## Known limitations of the published 0.4.0 artifact

The audit reproduced failure evidence lost during carriage-return cleanup without a recall
record, failure continuation blocks cut after 40 lines or at summary boundaries, read output
exceeding the advertised 8 KiB cap, and a recovery footer naming `lean recall` rather than
`hugr-lean recall`. The CLI's conservative `filter` path does not use that summarizer.
For byte-preserving refusal on failed or unknown shell observations, use CLI `filter` or the
plugin's `mode: "lossless"`; do not treat published 0.4.0 summarize mode as an absolute
failure-preservation guarantee.

Local fixes, tests or documentation do not replace the published archive. A subsequent release
needs its own version, exact source/artifact identity, checks and publication authorization.
No new release, fresh benchmark, broader host support or remote CI result is implied here.

## Unreleased source fixes

The current checkout incorporates fixes for the audited CR overwrite, failure continuation,
read-sizing and recovery-footer defects. The OpenCode adapter also enforces `maxInputBytes`
before every native string path and disables duplicate automatic fallback. Direct pure-core
summarization remains caller-bounded; read limits exclude recall and refuse unfit complete rows
rather than truncating them. Failure recognition is still heuristic, not semantic completeness.

Raw writes now publish before evicting unexpired originals and preserve validated ownership
through cleanup faults. A failed operation may already have published a complete new record;
postpublication crash/deletion failures can retain extra records above normal admission limits.
Ambiguous ownership/filesystem state still refuses automatic cleanup. See the
[core](../src/core/MANUAL.md), [adapter](../src/opencode/MANUAL.md) and
[raw](../src/raw/MANUAL.md) manuals and [Unreleased changelog](../CHANGELOG.md#unreleased).

These changes have not been published to npm or GitHub releases. The existing 0.4.0 archive,
release CI and historical benchmarks do not verify this checkout. Final integrated checks and
any future publication need their own exact source/artifact receipt; no new host or performance
claim is made here.

## Historical evidence

The [pre-publication delivery ledger](history/DELIVERY-2026-10-13.md) preserves the earlier
candidate, failed CI, local proof and human-review records. Its pending publication statements
and owner steps are historical, not current instructions. Earlier benchmark and release records
remain evidence for their named source and corpus only.
