# Distribution status

The local repository is canonical; the public source destination is
[gustavomhss/HuGR-Lean](https://github.com/gustavomhss/HuGR-Lean).
This destination is source-only for this handoff. A new repository does not automatically
contain old release assets or establish an npm release. The [README](../README.md#install-and-enable)
builds from an approved full source SHA; candidate approval and verification remain pending.

## Source and release identities

Source dates below identify commits, not archive build timestamps:

| Reference | Meaning |
| --- | --- |
| Historical `v0.2.0`, local `main` (2026-09-30) | Original release source: `69607794cbb2a3ce6707a509777ac648aa859bdd`; not the completed delivery candidate. |
| Historical integration (2026-10-03) | `ae4c3b5b5d444f80207c119c2fdc794f5cd954ff`, formerly the installation pin. |
| Frozen code baseline (2026-10-07) | `56cd420190506e495b6446daf6ec6e4f95c94da2`; documentation is authored on this tree, with full local proof still ongoing. |
| Delivery PR/candidate receipt | Must record the exact full reviewed head externally; approval, CI and release are distinct decisions. |

The old `ae4c3b5` pin predates the final format-profile C1 preservation fix
`cdf7fcfc8ed0979505ad94738020d3a84604da8c`; it must not be advertised as containing that fix.
`delivery/github-ready` is the proposed delivery/default branch, not an immutable snapshot or
a merge into `main`. Replace `FULL_REVIEWED_DELIVERY_SHA` in the README before running commands,
using the approved PR head and matching evidence receipt. This document does not pin itself.

## Tarball identity and availability

These historical package identities remain separate:

| Artifact | Source / historical record | SHA-256 |
| --- | --- | --- |
| Original `hugr-lean-0.2.0.tgz`, 55,606 bytes | `69607794cbb2a3ce6707a509777ac648aa859bdd`, released 2026-09-30; original local tarball/checksum retained. | `2c6429505ab22c14148bc6b699f40be45e45821f9698c2fed211739fbbf2af0e` |
| Rebuilt integration `hugr-lean-0.2.0.tgz`, 81,242 bytes | Historical handoff for `ae4c3b5b5d444f80207c119c2fdc794f5cd954ff` (source dated 2026-10-03); separate integration artifact. | `666d5c9f38f1f54c4a394b01cc6a82bdd650e5d1c09a6976fe288bb82b072fd4` |

The local handoff record is `recovery/2026-10-02/DELIVERY-HANDOFF.md` in the canonical
checkout; it is not a shipped/public evidence bundle. Its previous-owner draft upload is
historical, not a release at the new destination. Neither checksum identifies a new candidate
build. A copied tag or release description does not prove asset availability.

The README uses `npm ci`, then normal `npm pack` (whose `prepack` builds the package),
then installation of that local archive into a writable npm prefix, followed by doctor.

The snapshot retains package version `0.2.0`. Its filename and reported version do not establish
identity with the original `v0.2.0` release tarball. Treat every rebuilt tarball as a separate
snapshot artifact unless its bytes are independently matched to the original recorded checksum.
Pinning source does not promise a byte-reproducible npm archive. Record the actual local path,
checksum and full source SHA; keep separate artifacts for upgrade and rollback even at `0.2.0`.

The historical native corpus remains unrecovered for a fresh verification pass:
`hugr-lean-real-world-20260930.tar.gz`, 2,242,474 bytes, SHA-256
`ce98ba7e6f0a6f26d67c861184e93f3ed53a22072f4b0419697a0d7d0c5017b7`.
Git source history cannot replace it. Historical benchmark links retain their original identity;
they do not claim current availability or new-head verification.

The next release/version, publication, corpus disposition and practical-usefulness judgment
require explicit human decisions. See the single [delivery status](DELIVERY.md) for pending
verification and deferred Actions. Historical measurements, donor pins and fixture provenance
continue to describe their original evidence.
