# Distribution status

## Published 0.4.0

- npm package: [`hugr-lean@0.4.0`](https://www.npmjs.com/package/hugr-lean/v/0.4.0).
- [GitHub release `v0.4.0`](https://github.com/gustavomhss/HuGR-Lean/releases/tag/v0.4.0):
  `hugr-lean-0.4.0.tgz` and `hugr-lean-0.4.0.tgz.sha256`.
- Tag source: `0660c2b5dc9249816330603160aadfaeb33e5fc7`.
- Tarball SHA-256: `5ff983c58aa056d82059d5edd5b428478dda50a7683a201b7d844949aa1712a3`.
- [Release CI](https://github.com/gustavomhss/HuGR-Lean/actions/runs/38402476737) and
  [npm provenance](https://registry.npmjs.org/-/npm/v1/attestations/hugr-lean@0.4.0)
  identify the published artifact. The npm tarball matches the GitHub release asset digest.

The package is one MIT TypeScript/JavaScript package with zero runtime dependencies and Node
22+ support. OpenCode is needed for the plugin, not for the CLI, `hugr-lean/core` or
`hugr-lean/raw`. Installation and standalone examples are in the [README](../README.md).
The root and `./server` exports are the OpenCode plugin; `./core` and `./raw` are library APIs.
The installed command is `hugr-lean`, not `lean`.

`npm install -g hugr-lean@0.4.0` pins the CLI. For the plugin, use `"hugr-lean@0.4.0"` in
OpenCode's plugin list. A globally installed CLI does not itself enable the plugin or run a
host compatibility check. The tarball fallback still uses npm to install a downloaded archive;
it is a registry-free installation option, not an npm-free installer.

## Verification boundary

Installation, registry signatures and provenance establish availability, package shape and
origin. They do not establish the summarizer's preservation guarantees or real-world usefulness.
See [current delivery status and published-artifact limitations](DELIVERY.md).

A locally rebuilt archive is a separate artifact even when `package.json` still says 0.4.0.
Record its full source SHA and digest; do not reuse the published archive's evidence or claim
that local changes have shipped. Node/package CI and actual OpenCode-host tests are separate.

## History

The [pre-publication distribution record](history/DISTRIBUTION-2026-10-13.md) retains the 0.2.0
archive identities and 0.3.0/0.4.0 candidate discussion. Its source-only and unpublished statements
are superseded by the verified 0.4.0 release above. Earlier archive hashes remain identifiers
for those artifacts only.
