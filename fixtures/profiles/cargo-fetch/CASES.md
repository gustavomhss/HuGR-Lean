# C08 capture coverage

Every native case uses `cases.json` with schema `hugr-lean/native-cases/1`.
Native input: `<id>/native.txt` only; no duplicate inline input. Exact bytes/hash/EOF
and termination belong to that case. Independent source evidence is executed project,
native Cargo messages, native lockfiles and actual installed executable receipts.
Expected golden is identity, implicit from input; no reduction golden introduced.
Public-filter disposition is declared passthrough, not exercised in capture-only work.
Approved removable bytes: **0** for every case. Test name: **none (capture-only)**.

| Stable ID | Required variant / combination | Native evidence retained |
| --- | --- | --- |
| fetch-cold | Empty isolated Cargo home; native online download | Updating, Locking, pinned Adding/version plus newer-version advice, Downloading, Downloaded |
| fetch-cache | Same home and project after cold fetch | Native empty successful output; cannot justify deletion |
| fetch-locked | Existing generated lock + populated cache | Native empty successful output |
| fetch-offline-cache | `--offline --locked` + populated cache | Native empty successful output |
| fetch-offline-cold-failure | `--offline --locked` + empty home | Exit 101; no matching package, search location, project association, offline advice |
| fetch-locked-missing-failure | `--locked` + missing lock + populated home | Exit 101; lock-update refusal and offline/removing-flag advice |
| fetch-resolution-failure | Online exact impossible `itoa =999.0.0` | Exit 101; failed version requirement, candidate versions, index and package association |
| install-cold | `--path` local original bin; empty target/root | Compiling, native warning/snippet/help, Finished, Installing artifact, Installed package/executable, PATH advice |
| install-already-installed | Repeat same `--path`, populated target/root, no force | Cached warning/Finished, Replacing and Replaced summaries; native path semantics, not ignored/no-op |
| install-cache-force | Same cached project with `--force` | Cached build output; Replacing/Replaced; warning and exact artifact path |
| install-features | `--force --features extra` | Feature-driven build; resulting executable prints `extra=true`; warnings/path/summary |
| install-collision | `--force --features collision`, normal verbosity | Build-script native-shaped warning wrapped by Cargo; no raw script stdout claimed visible |
| install-collision-verbose | Same collision feature with `-vv`, new cold target | Real script stdout including fake Updating/Downloading/Downloaded/Compiling/Finished/Installing/Installed; Cargo producer prefixes and native command/environment context |
| install-list-already-installed | `install --list --root` after verbose collision | Installed package version/source path and executable name |

## Preservation boundaries

Nonzero failures remain exact, including native advice and version candidates. Empty
successes are real native results, not parser stubs or proof of reduction coverage.
Artifact output archives are noninput `.txt` paths declared as strings in `archives`.
`installed-state/.crates.toml` and `.crates2.json` are final Cargo-native install records.
Every successful local path installation records binary hash/mode and direct execution.

## Framing corrections / blockers

- `--path` already-installed state produces replacement on Cargo 1.98.0. Calling it
  an ignored install would be wrong; registry already-installed skip is unobserved.
- Visible verbose stdout collisions carry Cargo prefixes. Claiming byte-identical
  unprefixed progress spoofing would exceed evidence.
- Exact producer ambiguity is approved scope, not a waiver for unobserved variants.
- No native capture command failed unexpectedly; expected resolver/lock/offline failures
  terminate 101 and retain their output. Native inputs need independent review.
- Safe deletion candidates remain unapproved; parser/default-filter verification and
  campaign corpus promotion are lead work. This packet alone cannot close runtime coverage.
