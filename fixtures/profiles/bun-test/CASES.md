# R05 Bun test capture-only packet

Base `248c303`; branch `campaign/native-v2/R05`; PR base `campaign/native-integration`.
Existing Bun 1.3.14, macOS x86_64. Tiny original MIT programs only.

All cases declare `passthrough`, baseline replay **pending**. No public-filter
execution, reduction golden, approved deletion, or runtime completion claimed.
Independent expected evidence is the complete hash-bound native input, including
EOF, timing, duplicate logs, diagnostic paths and coverage whitespace.
Removable bytes: zero approved. Package test name: none (CAPTUREONLY).

| Case | Native evidence / required preservation |
| --- | --- |
| R05-version | Exact existing binary version |
| R05-help | Native flag documentation; `--retry` and `--rerun-each` are distinct |
| R05-suite | Outer/nested suite names, pass names, skip reason encoded in name, todo name, totals |
| R05-multifile | Two file identities, nested suite associations, combined counts |
| R05-logs | Duplicate stdout logs and stderr log; merged stream order |
| R05-coverage | Multifile suites, complete function/line metrics, file names, uncovered-line column, counts |
| R05-failure | Nonzero assertion diff, test identity, counts |
| R05-retry-success | Exit zero despite first-attempt failure; source/caret/path, both attempt logs, `(attempt 2)` |
| R05-retry-exhausted | Exit one; both attempts, complete diagnostics and final failed totals |
| R05-rerun | Repeated file runs, native separators/counts and repeated skips/todos |
| R05-dots | Alternate reporter bytes and counts |
| R05-unknown-flag | Original unknown argv retained; Bun ignores this flag and exits zero, not a flag-error witness |
| R05-no-match | Missing file/no tests, exit one |
| R05-collision | Real user stdout emits entire byte-exact R05-suite capture; genuine outer reporter wraps it |

## Candidates and boundaries

No reduction candidate proposed. Suite identities, native totals and coverage
metrics remain evidence. Grammar cannot distinguish the copied native banner,
pass/skip/todo rows and totals from native reporter production. Human-approved
exact handling resolves log ambiguity for this packet; it does not authenticate
the producer. Collision is captured, not a missing-capture blocker.

Skip reasons here are literal test names; no claim of a separate Bun reason API.
Coverage exercises all subject branches and reports 100%; partial/uncovered
branch metrics and lcov files were not captured. No concurrent/parallel/shard,
JUnit artifact, custom config, timeout, Windows or Linux coverage claimed.
Runtime admission and baseline replay remain lead work, not capture blockers.

## Capture and artifact checks

`python3 fixtures/profiles/bun-test/capture.py` executed only the named tiny Bun
commands. Native help supports retry; success/exhaustion captures prove behavior.
`verify.py` checks receipt/file/source/recipe hashes, EOF and exact collision bytes;
its in-memory corrupted-byte and missing-archive controls must fail. This is an
artifact audit, not a package test or parser preservation mutation.

All non-input artifacts are string paths in `cases.json.archives`; each case has
one `file`, never duplicated inline `output`. Source programs are archived, not
native observations. Shared index enrollment remains lead-owned.
