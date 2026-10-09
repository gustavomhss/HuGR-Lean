# R04 cases: captured, browser execution blocked

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

JSON stats `expected` means tests with expected outcomes, not attempts.
Each API project has pass, fail-then-pass flaky test, deliberate skip; optional
permanent failure fails attempts 0 and 1. Browser tests request actual `page`
and `browser` fixtures, but executable lookup fails on attempts 0 and 1.
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
  native byte/exit/count evidence. No screenshot exists; browser failed before
  test body. Browser test source contains screenshot recipe for later retry.
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
Correct state: reporter evidence captured, native browser execution **BLOCKED**,
public-filter/grammar work pending, R04 completeness not achieved or waived.

## Narrow inspection

```
python3 fixtures/profiles/playwright/audit.py
```

Artifact inspection verifies EOF/hash/bytes, path snapshot links, retry/status,
skip reason and attachment/log counts. In-memory probes remove raw final byte,
referenced path artifact, or retry result; each rejected, original checked again.
No disk mutations or runtime preservation test claims. Initial audit equality
assumed annotations had no location field; corrected to compare required fields.
First path-loss probe removed original unreferenced file, did not reject;
corrected to remove reporter-referenced copied attachment, then rejected.
No full checks, typecheck, smoke, benchmark, test suite or CI run requested.
