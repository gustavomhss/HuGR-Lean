# HuGR-Lean: completion plan

## Intent
One local MIT TypeScript package. Deterministic post-execution filtering, no extra model call.
Recognize command identity, validate the entire supported grammar, preserve declared evidence,
accept only smaller output. Unknown, incomplete, ambiguous or failed processing preserves original.

## Deliveries
1. Foundation: types, package, license, build and test tooling.
2. Pure core: bounded input, conservative command recognition, validated source spans, fail-open.
3. OpenCode: real after-hook, actual execution metadata, model-visible end-to-end smoke.
4. Profiles: native Cargo, pytest, Jest/Vitest, Go, Git status, ripgrep; diagnostics and install progress
   admitted only with a full grammar and preservation tests. Reuse donor fixtures and pure logic.
5. UX: short plugin options, installed CLI, enable/disable/upgrade/remove instructions.
6. Optional raw: local files, exact boundary recovery, byte/TTL limits, lazy cleanup, safe identifiers.
7. Proof/release: combined corpus, destructive-regression probes, measured latency/reduction,
   clean-installed tarball, notices, compatibility matrix, GitHub release and npm when authenticated.

## Frozen profile contract
Read `src/types.ts` and `src/core/lines.ts`. Each profile exports a `Profile`; it owns only its grammar.
Return `undefined` for any unrecognized line, unsupported variant or inconsistent summary.
Reduction contains source spans and fixed formatting pieces. Required spans must be emitted intact.
Use UTF-16 indices for spans and UTF-8 bytes for size measurements. Failures may remain exact.
No command execution, filesystem or network in profiles/core. No arbitrary log deduplication.

## Reuse
TRS (MIT): native fixtures/parser knowledge. RTK (Apache-2.0): formats and edge cases.
CX (MIT): critical-evidence and installed-smoke methodology. LeanCTX/context-compress: selective
recovery/progress/hook lessons. Copied material records repository, commit, path, license and changes.

## Done
Published package installs and filters supported real host calls; required evidence survives;
unknown output stays exact; raw opt-in works or explicitly reports unavailable; measured overhead
meets declared budgets; lifecycle is documented and reproducible. Compatibility never exceeds tests.

## Module discipline
One package, five modules: core, profiles, raw, opencode, cli. Every module has README, OWNERSHIP,
MAINTENANCE, MANUAL and BLAST_RADIUS. Source/test/script files target 400 logical LOC; 401–600
allowed, 601–750 tolerated, 751+ must split. `npm run structure` checks code size and document presence.
Review judges document truth and quality. Production modules fit the target; deep raw tests use tolerance.
