# R04 cases: reporter and actual Chromium captures

Browser blocker cleared after user-authorized campaign cleanup. Four successful
browser observations appended; original ENOSPC/setup and missing-executable
observations remain exact historical evidence. Approved removable bytes: **0**,
pending lead policy. Chromium only; no cross-engine or runtime-profile claim.

Baseline `248c303`. Exclusive fixture packet; no Playwright runtime profile.
Existing `src/profiles/runners.ts` collects Cargo/pytest/Go only. Campaign R04
row supplies required delta. Repository-wide Playwright search found that row
only; existing fixture search found no Playwright captures. Positive control:
same fixture search tooling finds existing pytest native corpus and goldens.
Reuse: campaign invariants, existing native-cases/1 schema, merged-pipe capture
and provenance conventions. No duplicate Playwright fixture reruns from baseline.

## Native observations

All native inputs inline in `cases.json`; native `.txt` input files absent by
design. `status: passthrough` means **pending lead disposition**, not verified
public-filter compatibility. Independent exact golden is original captured
output; no separate duplicated golden or approved byte deletion. Every row
currently has 0 approved removable bytes. No public-filter test name exists;
`audit.py` checks capture integrity only.

| Stable ID | Reporter / combination | Exit | UTF-8 bytes | Native summary | Attempts including skips | Attachments | stdout/stderr chunks |
| --- | --- | ---: | ---: | --- | ---: | ---: | --- |
| R04-api-list | list,json; api-a + api-b | 0 | 5650 | 2 passed, 2 flaky, 2 skipped | 8 | 8 | 6 / 2 |
| R04-api-line | line,json; api-a + api-b | 0 | 6134 | 2 passed, 2 flaky, 2 skipped | 8 | 8 | 6 / 2 |
| R04-api-json | json stdout; api-a + api-b | 0 | 21221 | 2 expected, 2 flaky, 2 skipped | 8 | 8 | 6 / 2 |
| R04-failure-list | list,json; two projects + permanent failures | 1 | 13246 | 2 passed, 2 failed, 2 flaky, 2 skipped | 12 | 12 | 10 / 2 |
| R04-failure-line | line,json; two projects + permanent failures | 1 | 13974 | 2 passed, 2 failed, 2 flaky, 2 skipped | 12 | 12 | 10 / 2 |
| R04-failure-json | json stdout; two projects + permanent failures | 1 | 37721 | 2 expected, 2 unexpected, 2 flaky, 2 skipped | 12 | 12 | 10 / 2 |
| R04-browser-list | list,json; chromium-desktop + chromium-small | 1 | 7509 | 2 failed; executable missing | 4 | 0 | 0 / 0 |
| R04-browser-line | line,json; chromium-desktop + chromium-small | 1 | 7626 | 2 failed; executable missing | 4 | 0 | 0 / 0 |
| R04-browser-json | json stdout; chromium-desktop + chromium-small | 1 | 20915 | 2 unexpected; executable missing | 4 | 0 | 0 / 0 |
| R04-custom-collision | original custom reporter,json; api-a + api-b | 0 | 1584 | custom claims 2 passed; JSON also records 2 flaky + 2 skipped | 8 | 8 | 6 / 2 |
| R04-browser-success-list | list,json; desktop + small | 0 | 1033 | 2 passed | 2 | 4 | 2 / 0 |
| R04-browser-success-line | line,json; desktop + small | 0 | 1286 | 2 passed | 2 | 4 | 2 / 0 |
| R04-browser-success-json | json stdout; desktop + small | 0 | 8145 | 2 expected | 2 | 4 | 2 / 0 |
| R04-browser-success-launch-debug | list,json + DEBUG=pw:browser; desktop + small | 0 | 6648 | 2 passed; private launch/profile/cleanup logs | 2 | 4 | 2 / 10 |

JSON stats `expected` means tests with expected outcomes, not attempts.
Each API project has pass, fail-then-pass flaky test, deliberate skip; optional
permanent failure fails attempts 0 and 1. Browser tests request actual `page`
and `browser` fixtures. Historical browser rows fail executable lookup on
attempts 0 and 1; appended success rows pass on attempt 0.
Desktop/small are Chromium viewport projects, not distinct browser engines.

## Evidence links

- `capture-receipt.json.evidence[ID].tests`: titles/project names, status,
  annotations (including skip reason/location), complete original results,
  retry indices, errors/snippets/stack locations, stdout/stderr and attachments.
- Passing API attempt writes `evidence.log`, attaches copied path and body;
  every flaky attempt attaches body `attempt=0\n` or `attempt=1\n`.
  Permanent failures write/attach `failure.log` on both attempts.
- API runs: 2 path + 6 body attachments. Failure runs: 6 path + 6 body
  attachments. Custom run: same 2 path + 6 body evidence in companion JSON.
- `capture-receipt.json.artifacts[ID]`: exact sidecar JSON where applicable and
  post-command test-results snapshot (original/copy attachment bytes, last-run
  metadata). JSON-only output is native input itself. Human reporters do not
  print all passing attachment paths or skip annotations; companion JSON
  establishes those details without claiming they existed in terminal text.
- `audit-receipt.json.cases[ID]`: all attachment paths and artifact filenames,
  native byte/exit/count evidence. Historical failures have no screenshots.
  Each successful row has two PNG path attachments and two JSON proof bodies.
- `browser-recovery-receipt.json`: exact lock replay, successful official
  download, browser version/revision/binary SHA-256, complete source/environment
  snapshot, new evidence/artifact records. Screenshots encode 800x600 desktop
  and 320x480 small viewport; both independently opened and show `雪 browser`
  button. Native assertions verify title and button text, not screenshot alone.
- Debug row retains actual private headless-shell launch argv, two disposable
  user-data paths under private TMPDIR and completed cleanup logs. Inspector
  saw only Node/Playwright transform caches remaining in that TMPDIR.
- `browser-recovery-operations.json` retains every recovery operation output,
  including first 45-second startup/teardown timeout. Its report/artifact
  snapshot lives in `browser-recovery-initial-failure.json`; not counted as
  successful browser proof. Final runs use 120-second native global timeout,
  45-second test timeout and 180-second process bound; all reach EOF/exit 0.
- `setup-receipt.json`: install/version/download argv, exact merged output,
  exits, bytes/hash, EOF and timestamps. Browser install attempted official
  headless shell only and failed `ENOSPC: no space left on device, write`.

## Preservation, candidates and framing

Custom reporter deliberately emits native-shaped `Running 2 tests using 1
worker` and `  2 passed (1ms)` while real suite includes flaky/skipped evidence.
User approved capturing this exact ambiguous output, not deleting it. No
producer identity can be inferred from those strings. Retain complete output.
All nonzero cases remain exact, including retries and missing-executable advice.
JSON layout could be future source-span candidate only after lead scopes argv,
full grammar and evidence retention; no approved reduction/golden here.

Wrong framing: API-only native reporter proof completes browser requirement;
two Chromium viewport projects prove cross-engine coverage; fake custom totals
can replace actual result counts; passthrough metadata proves runtime support.
Correct state: reporter evidence captured, actual private Chromium execution
and screenshot attachments established; public-filter/grammar policy pending.
Historical blocker retained as history, not current missing-browser waiver.

## Narrow inspection

```
python3 fixtures/profiles/playwright/audit.py
```

Artifact inspection verifies EOF/hash/bytes, path snapshot links, retry/status,
skip reason and attachment/log counts. In-memory probes remove raw final byte,
referenced path artifact, retry result, or successful screenshot artifact;
each rejected, original checked again. Browser proof bodies and PNG dimensions
checked against pinned binary/version/projects. Historical manifest and receipt
hashes verified unchanged; no historical native case rewritten.
No committed native mutations or runtime preservation test claims. Initial audit equality
assumed annotations had no location field; corrected to compare required fields.
First path-loss probe removed original unreferenced file, did not reject;
corrected to remove reporter-referenced copied attachment, then rejected.
No full checks, typecheck, smoke, benchmark, test suite or CI run requested.

## Independent-review audit repair (after `740cffb`)

Independent review approved actual artifacts but found auditor blind: replacing
API `body-evidence` with nonempty `CORRUPTED` passed. Reproduced that failure of
the prior instrument before editing. This change repairs/strengthens only
read-time artifact inspection; native captures and source recipes stay exact.

Current auditor re-extracts every captured test (title, project, status,
annotations and entire original results objects) from raw companion JSON or
native JSON stdout. Ordered equality with receipt evidence checks every result
field, error/snippet/location, log and attachment, not totals or selected keys.
Missing/empty extractions and partial result structures fail with case name.

API body/path bytes are compared against immutable tiny source literals,
substituting actual project and retry index. Source checks cover `body-evidence`,
`retry-evidence`, `path-evidence` and `failure-path`; source delimiter decoding
is deliberately restricted to these pinned fixtures, not a JavaScript parser.
Browser proof bodies compare complete expected objects; PNG dimensions and
referenced snapshot hashes remain checked. Earlier checks are retained.

`audit-receipt.json` records current read-time timestamp/recipe hash/input hashes
and twelve named in-memory negative controls. `audit-controls-receipt.json`
records separate process-level inspections of temporary JSON receipts: nonempty
body corruption, body loss, coordinated raw-report/evidence body corruption,
retry loss, partial results, path loss and screenshot-size corruption all exit
1 with affected case name. Original records then exit 0: all fourteen audited,
no inspection skips (native skip outcomes remain original evidence).

Prior auditor/receipt are archived verbatim in `audit-history-740cffb.json`,
including pinned commit/path/license/SHA-256 and modification record. Current
inspection is not backdated to capture time; old audit's weaker reach is explicit.
No native browser replay or lead-owned reader edits. Lead reader EOF strengthening
`2049eec` is separate work, not proof supplied by this fixture audit. Chromium-only
exact scope still has no cross-engine coverage; approved removable bytes **0**,
runtime grammar/disposition pending policy.

## Native field type repair (after `e73ce03`)

Independent recheck found six accepted counterexamples: evidence-only worker
index/retry `false`, coordinated duration `NOT_A_DURATION`, result errors or
annotations `{}`, and browser proof viewport width `800.0`. Prior auditor
reproduced acceptance of all six with temporary envelopes recomputed; original
fourteen records also passed. Python equality was not a native type oracle.

`audit_types.py` now validates both raw-report projection and receipt evidence
**before** structural equality, plus proof viewport before object equality.
Worker/parallel indices: exact Python int, not bool/float, JS-safe range from
-1; retry/count/location indices: exact int, JS-safe and nonnegative. Durations:
finite nonnegative JS numeric range, int or float but not bool. Viewport width
and height: positive JS-safe exact ints. Raw optional error/location/cause/steps
and list entries are checked against pinned native element shapes; unknown
fields in these closed structures fail. Valid empty errors, annotations,
stdout/stderr, attachments and optional steps lists remain valid. Native cases,
extracted tests and results must remain nonempty lists, not missing/replaced lists.

Captured worker indices are 0–5, parallel indices 0; initial recovery timeout
records skipped worker/parallel index 0, not -1. -1 lower bound is preserved
because pinned upstream `_appendTestResult` initializes both indices to -1;
this is source-backed native domain, not claimed captured -1 browser coverage.

`audit-type-controls-receipt.json` records named process failures for those six
reviewer examples plus parallel bool, boolean/NaN/negative durations, wrong
stdout/stderr/attachment types, malformed optional error/location fields,
empty results and non-list cases. Coordinated mutations repair sidecar hashes
and temporary historical envelope so semantic type guards, not stale hashes,
reject them. Final original control exits 0 with all fourteen cases inspected.
Prior body/path/retry/partial/screenshot controls remain protecting checks.

Immediate prior recipe/receipt/control receipt archived verbatim in
`audit-history-e73ce03.json`; original `740cffb` history remains intact. Current
audit receipt pins both auditor and type-helper hashes with read-time timestamp.
No producer/browser execution, raw/source/capture rewrites or broad checks.
Chromium-only scope, missing cross-engine reach and zero approved bytes unchanged.
