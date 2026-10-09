# R03 sources and recovery provenance

All input tests/configs and `capture.py` are newly authored for this tiny capture packet;
no donor implementation copied. Isolated dependencies declared as `vitest@3.2.4` and
`@vitest/coverage-v8@3.2.4`. `inputs/package-lock.json` preserves registry URLs, exact versions,
SRI and dependency closure. Package lock is pin evidence, not proof of an executed producer.

License copies, unmodified:
- `LICENSE.vitest.txt`: published `vitest@3.2.4` package path `LICENSE.md`, MIT core and bundled notices.
- `LICENSE.vitest-coverage-v8.txt`: published `@vitest/coverage-v8@3.2.4` package path `LICENSE`, MIT.

These are published-package/SRI pins, not upstream Git commit attestations. Recovery receipt binds
local copied license/source/raw bytes with SHA-256. No producer build-to-commit claim.

`capture.py` is the intended recipe, not a recovered execution transcript. It merges stderr into
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

Historical recipe (DO NOT RUN while user stop remains active):
`python3 fixtures/profiles/vitest/capture.py`, or isolated scratch reuse via `R03_SCRATCH`.
It can install dependencies and launch native captures. `recover.py` only inventories existing files;
it performs no native execution, installation, network access or tests.

`recovery-receipt.json` uses a recovery-specific schema, not `hugr-lean/native-cases/1`.
Its archives are relative string paths for every existing non-receipt artifact, including raw,
licenses, install output, recipes, docs and source inputs. No inline duplicate raw bytes.
