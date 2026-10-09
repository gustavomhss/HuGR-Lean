# C07 capture checkpoint

- State: CAPTURED, pending independent review and lead corpus disposition.
- Base: `71bcaea`; exclusive ownership: `fixtures/profiles/cargo-nextest/**`.
- Producer: official checksum-pinned cargo-nextest 0.9.148; matching reported commit
  `cd1d6d5467322dbc0d39a80cb671d000ac302798`; Darwin x86_64.
- Native compilation: original dependency-free two-package Rust workspace; three binaries,
  nine test names. Only isolated capture compilation, not HuGR package compilation.
- Saved evidence: 23 original merged pipe captures, 50,537 UTF-8 bytes.
  Proposed deletion: 0 bytes. All inputs file-only under `hugr-lean/native-cases/1`;
  archive entries are noninput `.txt` strings.
- Coverage: success/multiple suites/names/counts/skips/ignored execution, default and selected
  status/footer levels, immediate/final stdout/stderr, failure/fail-fast/no-fail-fast,
  native list/verbose list, expression/name/skip/package selectors, no-tests policy,
  invalid argv/filter, captured and uncaptured native-shaped arbitrary test logs.
- Actual behavior: workspace plus package selector still selects workspace; saved native
  failure exit 100. Invalid filter exits 94. Original mistaken observer expectations retained;
  supplement corrects metadata without rewriting captured commands or raw files.
- Ignore reasons: native reporter does not emit them; original Rust source retains exact strings.
- Native recipe artifacts: source hashes, executable/asset hashes, license copies, generated lockfile,
  toolchain versions, argv, cwd, platform, complete exit/EOF and collector recipes retained.
- Artifact inspection: raw SHA-256, byte counts, EOF tails, source/license/recipe hashes,
  unique file-only inputs, receipt/manifest correspondence and archive shape checked.
  In-memory altered-byte and altered-EOF controls rejected; saved files unchanged.
- Staged `git diff --check` reports native help trailing whitespace and final-log blank
  EOF lines. These are original producer bytes and intentionally preserved, not repaired.
- Native capture recipes ran. No package parser tests, fixture-only suites, typecheck,
  full check/build, smoke, benchmark or CI run. No runtime red/green or preservation-test claim.

## Decisions and blockers

User-approved exact retention applies to ambiguous logs. This packet keeps them all and
proposes no deletion. `--no-capture` emits native-shaped user Summary/Starting/Finished rows
at the merged output boundary; regex/prose recognition cannot authenticate producer identity.
Captured mode provides visible stdout/stderr sections, but no bounded deletion grammar is implemented.

Passthrough declarations are pending corpus-review expectations, not executed default-filter proof.
Independent capture review and corpus promotion remain pending. Parser support and safe-format
reduction remain unimplemented; no completed family claim. Binary-to-source build attestation,
other OS/TTY/color/custom reporter/profile and broader flag combinations remain outside this capture.

Framing to reject: "nextest supported", "progress reduction proven", "default-hidden logs are
filter savings", "ignored reasons appear in native output", or "all checks/CI green".
Correct framing: pinned native evidence packet with exact ambiguous logs and zero proposed savings.
