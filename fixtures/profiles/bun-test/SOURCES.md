# R05 provenance and reuse

Read first: PLAN.md, src/types.ts and src/core/types.ts, campaign delta contract,
fixtures/runners/SOURCES.md, fixtures/utility/node/SOURCES.md and native corpus
reader schema. Existing runner and Node/TAP material remains regression evidence;
not recaptured or copied. Node/TAP output does not cover Bun's console reporter.
New scope is Bun-native reporting and control surfaces only.

Original source paths: `fixtures/profiles/bun-test/inputs/*` and `capture.py`.
License: repository MIT. No donor implementation or fixture copied.
Modification record: original tiny tests authored; collision source generated
from our own captured R05-suite output with no byte edits. Each source and recipe
has SHA-256 in `capture-receipt.json`. Commit pin is the capture packet commit;
baseline pin is `248c303`. No source-to-binary build attestation claimed.

Binary: existing `/Users/gustavoschneiter/.bun/bin/bun`, version 1.3.14.
Resolved path, binary SHA-256, platform, literal original argv, original cwd,
start/completion timestamps, exit codes, environment changes and raw UTF-8 bytes
are bound by `capture-receipt.json`. No installation performed.

Boundary: one stdout pipe, stderr redirected into that same pipe before exec;
read through EOF and wait. No PTY, stream concatenation, ANSI stripping,
newline/path/timing normalization, truncation or fabricated native output.
Each boundary records UTF-8 byte size, SHA-256, final-LF and last-byte hex.
Durations are native evidence, not benchmark measurements.

Recipe: `python3 fixtures/profiles/bun-test/capture.py` from this worktree.
Isolated scratch project is retained under the approved opencode temporary root.
Recipe overwrites its owned capture artifacts on replay; replay generates new
native timings and hashes. Current receipt describes the retained capture only.
Environment otherwise inherited; this is not a hermetic host claim.

Post-capture modification: added documentation and read-only `verify.py`; enrolled
`verify.py` in manifest archives manually. Executed capture recipe remains exact.
After recipe replay, re-enroll `verify.py` before auditing inventory.

No package checks or CI dispatched. Capture artifacts are pending independent
lead review and corpus enrollment; no compatibility expansion claimed.
