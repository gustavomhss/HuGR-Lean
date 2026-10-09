# ShellCheck provenance

Original campaign shell scripts/configs and capture recipe: repository MIT license.
Source bytes and SHA-256 are embedded in `capture-receipt.json`; no donor fixture copied.
Shell payloads were analyzed only, never executed.

Producer: existing `/usr/local/bin/shellcheck`, reports **0.11.0 / GNU GPL version 3**.
Resolved binary path and SHA-256 are recorded in receipt. No installation or global modification.
Binary-to-upstream build correspondence is not independently attested; version pin is not build proof.

## Copied donor artifact

- Repository: <https://github.com/koalaman/shellcheck>
- Immutable commit: `aac0823e6b58f8a499e856e93738082691cbf212`
- Release: `v0.11.0`; tag object `b12c2a6a0834a5b8c12b1c0eb36704f698de5bac`
- Pinned source path: `LICENSE`
- License: GPL-3.0; upstream executable version reports GPL version 3.
- Local archive: `LICENSE.shellcheck.txt`, explicitly declared in manifest `archives`.
- SHA-256: `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`;
  also recorded under receipt `donor.sha256`.
- Modifications: none, byte-for-byte license archive. No donor parser, implementation or fixture copied.

Native outputs are generated evidence, not copied source. Raw `.txt` captures retain EOF/hash/exit,
exact argv and source bindings; `json`/`json1` are separate explicit invocations. ANSI remains raw.
Requested formats do not guarantee machine-readable failures: missing-file outputs stay native text.
No suggested shell fix is applied or executed. No ShellCheck code linked into the MIT TypeScript package.
