# P06 — uv install capture packet

State: **CAPTURED**, not implemented or integrated. Native pin: uv 0.11.18,
CPython 3.14.5, macOS x86_64. Baseline: `07ffe15`.

All case IDs below map directly to `cases.json` names. Native input is each inline
`output`; actual `command`/`argv`, cwd/environment and raw hash are per case. Independent
expected source evidence is the entire original output, byte-for-byte: every count,
timing, environment/interpreter path, package/version/source URL, install/uninstall
change, diagnostic, traceback and advice is required. **Proposed removable bytes: 0**.
`status: passthrough` is expected disposition, not a measured public-filter result.
No runtime test name exists in this capture-only packet. Native hash check/probe is
recorded in `INTEGRITY.json`; no parser acceptance or baseline-red claim is made.

| Case ID | Variant / combination | Required evidence / capture disposition |
| --- | --- | --- |
| P06-pip-fresh-no-build | pip install, fresh cache/env, wheel + public package, original --no-build | Python env, resolve/prepare/install counts and times, both package identities and local source; NO_NOISE |
| P06-pip-cache-satisfied | same original install, already satisfied | env plus Checked count/time; NO_NOISE |
| P06-pip-version-change | pip install, local 1.0.0 -> 2.0.0 | prepare, uninstall/install counts/times, old/new source and version; NO_NOISE |
| P06-pip-cache-fresh-env | warm cache, fresh environment | env, resolve/install, both packages/source; NO_NOISE |
| P06-pip-offline-cache | offline + no-build, warm cache, fresh env | env, resolve/install counts/times, sources; NO_NOISE |
| P06-pip-offline-miss | offline + no-build, unavailable 0.4.5 | exit 1, unsatisfiable cause and network/cache advice, exact no-LF EOF; FAILED_EXACT |
| P06-pip-resolver-error | incompatible explicit colorama pins | exit 1, both versions and resolver explanation; FAILED_EXACT |
| P06-pip-sync-fresh | pip sync requirements, fresh env | env, resolve/install counts/times, package source; NO_NOISE |
| P06-pip-sync-cache | pip sync unchanged requirements | env, resolve/Checked counts/times; NO_NOISE |
| P06-pip-sync-version-uninstall | pip sync changed requirements, offline | uninstall colorama and local old version; install new version; all counts/times/source; NO_NOISE |
| P06-lock-fresh | virtual pyproject lock, original --no-build | interpreter/path, resolved total/time; lock snapshot independently records versions/hashes; NO_NOISE |
| P06-sync-fresh | project sync from lock, fresh .venv | interpreter/path, env creation, resolve/prepare/install, versions/source; NO_NOISE |
| P06-sync-cache | project sync, satisfied cache/env | Resolved 3 (includes virtual project), Checked 2 counts/times; NO_NOISE |
| P06-sync-locked | current lock + --locked | resolve/Checked counts/times; NO_NOISE |
| P06-sync-frozen-stale-lock | changed manifest, original --frozen --offline --no-build | native Checked count/time; old lock intentionally retained, no invented version-change output; NO_NOISE |
| P06-sync-locked-stale-error | changed manifest, original --locked | exit 1, resolve count/time, uv.lock path, exact `uv lock` advice; FAILED_EXACT |
| P06-sync-version-change | changed manifest, sync offline + no-build | old/new local versions/source, uninstall/install counts/times; NO_NOISE |
| P06-sync-offline-fresh-env | updated lock, frozen/offline, new UV_PROJECT_ENVIRONMENT | interpreter/path, full environment creation path, installed counts/times, versions/source; NO_NOISE |
| P06-pip-backend-collision | build-enabled pip install, local backend | exit 1, build path, backend error/traceback, stdout forged progress/package, stderr warning, advice, exact no-LF EOF; FAILED_UNSAFE_EXACT |
| P06-pip-no-build-backend-refusal | same local backend with original --no-build | exit **2**, env, resolve count/time, source-building refusal; FAILED_EXACT |

## Blockers / decisions

- **P06-NO-NOISE:** successful captured pipe output contains required evidence only.
  No progress deletion is proposed. Lead must review this bounded no-noise disposition;
  it is not universal uv coverage or a waiver for uncaptured argv/TTY variants.
- **P06-NOT-IMPLEMENTED:** uv profile/routing/runtime preservation tests are not implemented
  by this capture-only packet. No fake profile or reduction support is claimed. If campaign
  requires uv reduction, human scope decision or separate proved-noise work is still needed.
- **P06-BACKEND-BOUNDARY:** native-looking backend stdout is untrusted. Captured failure
  requires exact output. Source identity cannot be inferred from progress spelling.

## Capture execution record

Final capture root: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/P06-uv-8hugt6er`.
Twenty commands are captured, plus four setup venv commands in `SOURCES.json`. Initial
collector attempt expected no-build refusal exit 1; native exit was 2. Collector aborted
before serializing its packet; earlier raw outputs from that attempt were not retained,
so it is not admitted as complete corpus. Exact failure excerpt is in `CAPTURE-FAILURE.md`.
Expectation corrected to 2; full native packet recaptured with fresh isolation and per-case
checkpointing. No repository check, suite, build, smoke, benchmark or CI was run.
One native integrity negative control ran after final capture: in-memory append rejected,
original hashes still matched. No second mutation probe or native recapture is needed.
