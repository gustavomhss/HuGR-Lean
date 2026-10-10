# Structured-output verification

Base: `db767483c06b57614fbed6c3fe7f70ae810e46a4`. Twelve isolated work packages, explicit frozen contracts, one TypeScript package and the existing five modules. Existing shell registry and CI workflow remain independent of structured format selection.

## Review and corrections

Independent cold reviews covered each reducer, adapter, public conformance and shared engine in bounded groups. Review found and resolved exact-integer rounding, intact-span coverage, mutable termination reads, omitted modal descendants, and stale unwired-registry tests/documentation. Four fix-first groups re-reviewed and approved corrections. Approval does not establish arbitrary native GUI/MCP compatibility.

## Local evidence

- `npm run typecheck` and `npm run structure` completed; existing structure warnings remain visible.
- `node --import tsx --test --test-concurrency=2 tests/structured-*.test.ts tests/plugin.test.ts tests/opencode-boundary.test.ts tests/cli.test.ts`: 164 passed at integrated reducer/adapters snapshot; later runtime-vocabulary freeze was checked with the eight core tests and typecheck.
- Lead mutation probes: eleven reducer/adapter mutations caused twelve named preservation assertions to fail, including public default-registry conformance. Restored the exact source changes; same named selection passed. Separate required-span and accessor mutations caused both new core regressions to fail; restored and same tests passed.
- Build completed. Installed-package verification resolved `hugr-lean/core` from a fresh consumer's `node_modules`, exercised exact huge-number/Unicode JSON, compiled CLI reduction, direct default plugin table reduction with host fields intact, failure passthrough, and native Darwin ps cell preservation. This is direct adapter/package evidence, not a new native OpenCode host proof.

## Native process capture

Actual `/bin/ps -axo pid,ppid,stat,comm`, exit 0, Darwin, Node v22.17.1. Capture retained every row and complete command remainder. One local capture contained 667 rows, 65,189 input bytes and 60,563 output bytes. These are capture-specific bytes, not a token or universal compression claim.

- Original stdout SHA-256: `f831810884c014f0c938108f8f2cfb20d49f8d79997ff7e666e1dbcf36d54ba0`.
- Locally retained original/filtered/receipt and installed package: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-structured-proof-8qx6mmft/`.
- Tested tarball SHA-256: `257c8404ecb3c5276ac517e82e4eca0b0c9b364e028d77a074f7ef3348a6b321`. This package predates the final closeout documentation; final CI performs its own package smoke on its exact candidate.
- First installed-proof attempt failed because the oracle omitted the table view's final newline. Corrected oracle; successful rerun preserved original failed attempt separately. No application code changed for that correction.

Other schema fixtures are illustrative/custom interchange inputs, not native captures of file/window/event/accessibility producers. Native process support is limited to observed Darwin layout; other ps variants preserve original. Record projections are model-visible views, not JSON replacements for downstream programs.

## Delivery

Review is split into small dependent PRs; integrated branch contains the complete candidate. Integration PR carries stack order, exact head and CI links. CI runs unchanged Linux/macOS/Windows lanes with exact candidate identity receipts. Stop for lead review; no merge or release.
