# R03 sources and recovery provenance

## Resumed provenance

User authorized cleanup/reinstall; prior private `R03-vitest-e0kejzsc/node_modules` removed after
preservation. Cleanup sidecar exists externally at `L08-pyright-native/cleanup-preservation.json`;
it is not copied or treated as native termination proof. Fresh scratch reinstall uses committed
`inputs/package-lock.json` with `npm ci --ignore-scripts`, no global installation. Lock remains exact.
Resumed licenses are checked byte-equal to preserved copies; installed producer versions checked
against 3.2.4 pins. `resumed-install-receipt.json`, `resumed-version.txt` and `capture-receipt.json`
bind install/CLI version and actual executions. Inherited environment is not exhaustively archived;
CI/NO_COLOR/TZ and case overrides are recorded, FORCE_COLOR and R03_FAIL cleared.

New raw files are written after successful `communicate()` to EOF and process return, then receipt
persisted before next case. The duplicate-config failure is retained under R03-user-reporter-config;
`capture-config.py` adds a corrected single-config witness without replaying other captures.
Current `capture.py` includes both historical failed recipe and corrected case for reproduction.
Source hashes in native receipt bind executed inputs; capture tooling changed during focused repair,
and executed per-case argv remains authoritative over an inferred reconstruction from today's script.
`capture-direct.py` adds only direct-argv routing witnesses with already installed private tools.
No command rewriting: native manifest commands equal executed receipt argv; logical argv analysis
is separately labeled in closure receipt. Direct collision golden records actual default-filter result.

Historical `R03-default-projects.txt`, `install.txt` and `recovery-receipt.json` stay untouched;
new success does not authenticate old EOF/exit. Recovery receipt is an immutable checkpoint inventory
of old artifact versions, not a current-tree hash manifest. New manifest archives its artifacts.
`close.mjs` uses existing tsx 4.23.15 from main workspace to load frozen source; no runtime build/install.
Its baseline actual reduction golden intentionally exposes configured-reporter evidence deletion.

## Historical recovery notes (05b3019 checkpoint)

All input tests/configs and `capture.py` are newly authored for this tiny capture packet;
no donor implementation copied. Isolated dependencies declared as `vitest@3.2.4` and
`@vitest/coverage-v8@3.2.4`. `inputs/package-lock.json` preserves registry URLs, exact versions,
SRI and dependency closure. Package lock is pin evidence, not proof of an executed producer.

License copies, unmodified:
- `LICENSE.vitest.txt`: published `vitest@3.2.4` package path `LICENSE.md`, MIT core and bundled notices.
- `LICENSE.vitest-coverage-v8.txt`: published `@vitest/coverage-v8@3.2.4` package path `LICENSE`, MIT.

These are published-package/SRI pins, not upstream Git commit attestations. Recovery receipt binds
local copied license/source/raw bytes with SHA-256. No producer build-to-commit claim.

At the interruption checkpoint, `capture.py` was the intended recipe, not a recovered execution transcript. It merges stderr into
stdout through a single OS pipe and normally uses `communicate()` before writing raw. Final per-case
receipt is written only after all matrix entries, so interruption loses termination evidence.
`R03-default-projects.txt` exists and has a terminal reporter summary; neither summary nor final LF
proves process EOF or exit 0. Preserve exact bytes as completeness unknown. No cases manifest created.

Known session failures (full available error text in `interruption.txt`): first install reached
license copy and failed looking for `vitest/LICENSE`; corrected fallback uses `LICENSE.md`.
Second scratch preparation failed with `[Errno 28] No space left on device`. Existing scratch named
in raw RUN banner is `R03-vitest-e0kejzsc`. Session/harness interruption then left raw without final
receipt. Ordering and any unrecorded intervening invocation remain unknown; do not reconstruct argv
from recipe as observed fact. Install output remains `install.txt`, not a Vitest reporter capture.

Historical recipe (user stop later lifted for resumed work above):
`python3 fixtures/profiles/vitest/capture.py`, or isolated scratch reuse via `R03_SCRATCH`.
It can install dependencies and launch native captures. `recover.py` only inventories existing files;
it performs no native execution, installation, network access or tests. Do not rerun it to overwrite
the historical recovery receipt; its inventory describes checkpoint versions.

`recovery-receipt.json` uses a recovery-specific schema, not `hugr-lean/native-cases/1`.
Its archives are relative string paths for every existing non-receipt artifact, including raw,
licenses, install output, recipes, docs and source inputs. No inline duplicate raw bytes.
