# HuGR-Lean 0.2.0 release

## Delivered
- One MIT TypeScript package, five modules: core, profiles, raw, opencode, cli.
- Eight reducing profiles; tsc and unsupported variants explicitly preserve original.
- Per-module README, ownership, maintenance, manual and blast radius.
- Compiled JavaScript/declarations, installed CLI, notices and pinned fixture provenance.

## Verification
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

## Reproduce
```sh
npm ci
npm run check
npm run smoke
npm run benchmark
OPENCODE_BIN=/absolute/path/opencode node scripts/package-smoke.mjs --opencode
OPENCODE_BIN=/absolute/path/opencode node scripts/opencode-raw-smoke.mjs
```
Optional `HUGR_SMOKE_DEPS` reuses a validated isolated SDK installation, never user configuration.

## Distribution
GitHub release provides `hugr-lean-0.2.0.tgz` and SHA-256 checksum. Install/enable/upgrade/remove
instructions are in README. npm registry publication requires valid authentication; `npm whoami`
returned `E401` during this delivery. Registry availability is not implied by tarball or loader proof.

## Scope and compatibility
See COVERAGE.md and OPENCODE.md. Profiles use complete admitted native grammars; failures,
unknown output, truncation, overlap or invalid evidence keep original. Real-host proof applies to
the tested route/version/platform; CI proves the package/core/CLI/storage paths it executes.
