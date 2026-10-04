# Distribution status

The operational repository is [gusmhs/HuGR-Lean](https://github.com/gusmhs/HuGR-Lean).
The installation path in the [README](../README.md#install-and-enable) builds a pinned,
reviewed integration snapshot from source. It does not depend on migrated release assets.

## Source and release identities

At this delivery handoff:

| Reference | Meaning |
| --- | --- |
| `main` and the commit tagged `v0.2.0` | Older release source: `69607794cbb2a3ce6707a509777ac648aa859bdd`. |
| `integrate/benchmark-final` | Integration branch containing the reviewed snapshot; a branch name can move. |
| `ae4c3b5b5d444f80207c119c2fdc794f5cd954ff` | Exact reviewed integration source used by the README installation commands. |
| Delivery PRs | Proposed changes for review; a PR is not a release or a promotion to `main`. |

The [pinned source commit](https://github.com/gusmhs/HuGR-Lean/commit/ae4c3b5b5d444f80207c119c2fdc794f5cd954ff)
is the install target even if branch tips later change. Checking it out also selects its original
README and package metadata; the repository URL update in this documentation PR is later than that pin.

## Tarball identity and availability

Original-release asset migration is incomplete. A copied tag or release description does not
establish that the original package or corpus bytes are available. The README therefore uses
`npm ci`, then `npm pack` (whose `prepack` script builds the package), then global installation
of the resulting local `hugr-lean-0.2.0.tgz`, followed by `hugr-lean doctor`.

The snapshot retains package version `0.2.0`. Its filename and reported version do not establish
identity with the original `v0.2.0` release tarball. Treat every rebuilt tarball as a separate
snapshot artifact unless its bytes are independently matched to the original recorded checksum.
Pinning the source does not itself promise a byte-reproducible npm archive.

The next release and its version require explicit human approval. This handoff does not announce
a new release or npm registry publication. Historical benchmark links, measurements, donor pins
and fixture provenance continue to describe their original evidence.
