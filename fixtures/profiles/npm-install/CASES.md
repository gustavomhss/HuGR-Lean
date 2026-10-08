# P01 native npm capture packet

State: CAPTURED investigation, awaiting lead decision. Baseline `07ffe15`; branch `campaign/native-v2/P01`.
Lead rejected implementing the low-value whitespace proposal. Existing 13 captures, metadata and
six historical goldens remain unchanged; their `reduced` statuses record the original proposal only,
NOT approved admission, material progress, implementation or completion. Eight new captures are
exact passthrough proposals. No parser/test/registry changes; mandatory progress remains unresolved.

## Capture contract and reproduction

- Native npm **10.9.2**, Node **v22.17.1**, darwin x64, macOS 15.3.2; captured 2026-10-08.
- Run `python3 fixtures/profiles/npm-install/capture.py` with those versions. The producer creates
  disposable projects, prints each observed command/output/hash/exit, and ends with `complete: true`.
  Package manifests, lifecycle script, setup commands and environment are authored in that file.
- Final completed producer root: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/p01-npm-tofqpbbi`.
  Per-case cwd is that root plus `provenance.project`. Cases appear in execution order.
- Original argv are executed directly as `['npm', ...args]`; no shell wrapping or runtime rewriting.
  `--ignore-scripts` belongs to the ORIGINAL candidate argv. Enabled-script cases remain enabled.
- stdout and stderr share one OS pipe **at spawn** (`stderr=STDOUT`), drained to EOF by
  `subprocess.run`; exit code observed. `.txt` contains those exact UTF-8 merged bytes, final LF
  included. This is not concatenation of independently collected streams, not a PTY, and no
  per-stream identity is claimed. Separate stderr/stdout presentation is outside this packet.
- npm fetch retry count 0, fetch timeout 10s; each command timeout 30s. Fresh HOME/cache and distinct
  empty user/global config prevent private credentials/config inheritance. Registry is public npm;
  dependencies are tiny authored local files/workspaces/tarballs, never globally installed.
- Local `npm pack --ignore-scripts --offline` is setup only, not installer evidence. No donor material.
- First attempt aborted on `Exit prior to config file resolving` / `cause` /
  `double-loading config "/dev/null" as "global", previously loaded as "user"`. Distinct empty global
  config fixed that producer error. Second attempt exceeded the outer 120s tool timeout before a
  flushed receipt; none of its outputs are admitted. Final attempt used a 300s outer bound and
  printed all completed receipts. Incomplete attempts are not labelled complete cases.

## Historical independent proposal and required evidence (not approved)

Expected files were manually authored after inspecting native captures, without any reducer.
Conservative admission candidate: remove only empty separator lines in the multi-record,
scripts-disabled grammar; keep every nonempty line byte-for-byte, in original order. This saves
very little; no substantive installer-progress reduction was observed in these non-TTY captures.
The single-record successes retain even their leading blank: no meaningful noise beyond formatting.
Do not claim broad npm reduction from this packet or delete funding help, elapsed summaries, audit
counts/verdicts, deprecation text, paths, dependency relations, advice or lifecycle output.

All table IDs have prefix `P01/`. Native file is `<ID>.txt`; proposed reduction golden is
`<ID>.expected.txt` only for reduced rows. Passthrough oracle is the native file itself.
Planned test names are `P01/<ID>: exact native evidence` (all **pending approval**, not executed).
UTF-8 removable bytes below are proposal deltas; source spans in a future parser must use UTF-16.

| ID | Required variant / crossing | Proposal | Removable bytes | Required source evidence / reason |
| --- | --- | --- | ---: | --- |
| install-disabled | fresh local file install, scripts disabled | reduced | 2 | added count/time, funding count and exact `npm fund` help |
| install-cached | same original install argv after lock/node_modules/cache populated | reduced | 2 | up-to-date time and funding/help; local state reuse, not proof of registry tarball cache hit |
| ci-offline | existing lock + local dependency + offline + disabled scripts | reduced | 2 | added count/time and funding/help; successful offline reification |
| lock-only | package-lock-only + offline + disabled scripts | reduced | 2 | up-to-date summary and funding/help |
| ci-audit | existing lock + audit enabled + disabled scripts | reduced | 3 | added/audited counts, time, funding/help, exact `found 0 vulnerabilities` |
| workspaces-install | two local workspaces + offline + disabled scripts | passthrough | 0 | NO_NOISE: one required added-count/time summary, no progress records |
| workspaces-ci | workspace selector + lock + offline + disabled scripts | passthrough | 0 | NO_NOISE: one required summary; dependency workspace included |
| lifecycle-install | ORIGINAL enabled postinstall + offline | passthrough | 0 | UNSAFE: entire envelope, emoji log, fake counts/audit/warning and final summary retained |
| lifecycle-ci | ORIGINAL enabled postinstall + lock + offline | passthrough | 0 | UNSAFE: same collision witness under ci; npm-looking lines cannot establish producer |
| lifecycle-disabled | same lifecycle manifest + ORIGINAL ignore-scripts ci | passthrough | 0 | NO_NOISE: only required up-to-date summary; positive contrast with enabled user logs |
| deprecated-install | local tarball + offline + disabled scripts | reduced | 1 | genuine npm deprecation warning/version/message plus added summary retained |
| peer-conflict | incompatible local peer + tarball + offline + disabled scripts | passthrough | 0 | FAILED: ERESOLVE code, packages/versions/relations, advice and report/log paths exact |
| ci-missing-lock | ci + missing lock + offline + disabled scripts | passthrough | 0 | FAILED: EUSAGE, lock requirement, full usage/options/help and log path exact |

Enabled lifecycle golden remains exact even where test producer knows which lines came from the
script: the observation does not carry an authenticated internal boundary. Blank lines, headings
and a last summary-looking line cannot prove it. Arbitrary backend/application scripts are not
installer grammars. Unknown/new lines, unsupported flags, nonzero exit, incomplete capture and
missing producer safety proof must refuse reduction in future work.

## Initial mandatory coverage and follow-up findings

Install, ci, workspace/selector, existing/missing lock, offline/local state reuse, peer failure,
audit-zero, genuine deprecation and lifecycle collisions are captured above. No silent waiver.

- **Audit-positive severity/remediation:** now captured by approved pinned lodash@4.17.20 install
  and auxiliary `npm audit --ignore-scripts`. All severity, count, advisory and fix evidence retained.
- **Registry cold/warm/offline/cache miss:** now captured by approved chalk@4.1.2 and its five tiny
  locked transitive MIT dependencies. Native debug evidence distinguishes cold fetch and warm hits.
- **Successful peer override warning:** still BLOCKED. The one minimal optional-local-peer attempt
  emitted ERESOLVE override warnings but exited 1 ENOTCACHED trying registry `p01-host`. npm sought
  a compatible ^2.0.0 peer despite a file-linked 1.0.0 root. Offline cache cannot supply that name.
  This failure is negative evidence, not successful-warning coverage; no unapproved peer package
  fetched and no alternate flags silently substituted. A separately approved reproducible successful
  graph or human scope decision is needed. `--legacy-peer-deps` is not a warning-proof substitute.
- **TTY/PTY progress:** outside current approved scope, not a missing capture to pursue. Presentation
  stays `unknown`; no CR-rendering expansion. Separate-stream adapter behavior is not inferred.
- **Lifecycle-enabled reduction:** UNSAFE, not NO_NOISE; requires authenticated producer boundaries
  or a human scope decision. Presence of matching npm-shaped text alone is insufficient.
- **Implementation/behavior tests:** NOT IMPLEMENTED by instruction. Pending lead approval, not an
  exact-only substitute for mandatory reduction. No red/green parser proof or runtime admission.

## Approved bounded public-registry follow-up

Run `python3 fixtures/profiles/npm-install/capture-registry.py` only for follow-up; original producer
and 13 captures were not rerun. Native pins/platform unchanged. Final root:
`/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/p01-registry-2gdswoac`.
Original argv, cwd/project, cache, exact merged pipe SHA-256, EOF, observed exit and completion facts
are in cases.json. Fresh isolated HOME/user/global configs; public registry only, no private creds.
Each native subprocess bounded at 40s, fetch timeout 10s/retries 0, outer producer bound 300s.
Every install/audit/pack argv contains original `--ignore-scripts`; downloaded package code never
executed. Audit fix advice is output only: no fix or recommended lodash@4.18.1 install was run.
Producer completed all commands. Peer pack is setup only, not an installer case.
Registry-source facts, exact versions, integrity, lock hashes and license pins are recorded in
REGISTRY-SOURCES.json. lodash/chalk/transitives are MIT; npm CLI itself is **Artistic-2.0**, not MIT.
Registry npm@10.9.2 has no gitHead; its immutable distribution integrity is recorded, not invented
commit provenance. lodash/chalk gitHead values came from their public pinned-version metadata.
No source-code donor copy; native output is unchanged. Live audit database can change later reports.
Future transitive resolution can drift; reproduce against the recorded versions/integrities before
claiming byte-identical regeneration. The four native lock hashes pin this capture's graph facts.

IDs below use the same native filename/passthrough oracle and pending test-name convention above.
Every new row proposes **0 materially removable bytes**, no whitespace parser and no new reduction
golden. Full original text remains required, including separators. This is bounded no-material
evidence, NOT a claim that all npm pipe variants lack progress or that P01 mandatory reduction is done.

| ID | Mandatory scope vs negative witness | Exact required evidence / observation |
| --- | --- | --- |
| registry-audit-install | mandatory audit-positive install, exited 0 | added/audited totals/time, one high-severity vulnerability, force-fix advice, audit-details help; only summaries/advice observed |
| registry-cold | mandatory fresh registry install/cache | six added packages/time, funding count/help; no progress sequence observed |
| registry-warm | mandatory fresh project + same warmed registry cache | six added packages/time, funding count/help; warm hits verified separately, not deduced from elapsed time |
| registry-offline | mandatory cache-populated offline install | six added packages/time, funding count/help; native offline argv and full graph installed |
| registry-offline-ci | mandatory existing lock + offline registry ci | six added packages/time, funding count/help; required summary only |
| registry-audit-detail | auxiliary diagnostic, not installer admission; exited 1 | lodash range, high severity, five complete advisory URLs/messages, package path, outside-range 4.18.1 fix, count/advice; exact failure |
| registry-offline-miss | negative failure witness, exited 1 | ENOTCACHED, registry URL, only-if-cached explanation and full log path |
| peer-override-attempt | negative failed-warning witness, exited 1 | force notice, both override warnings, peerOptional range/relations, undefined-version text, ENOTCACHED URL and log path; successful peer warning still blocked |

### Auxiliary cache proof, not model-visible progress

Native debug logs are under final root `chalk-cache/_logs`; hashes are in REGISTRY-SOURCES.json.
Exact excerpts below are selected source evidence, NOT bytes appended to any command capture:

| Native log basename / line | Exact source line |
| --- | --- |
| 2026-10-08T18_54_57_400Z-debug-0.log / 63 | `62 http fetch GET 200 https://registry.npmjs.org/chalk/-/chalk-4.1.2.tgz 2187ms (cache miss)` |
| 2026-10-08T18_55_17_936Z-debug-0.log / 51 | `50 http cache chalk@https://registry.npmjs.org/chalk/-/chalk-4.1.2.tgz 0ms (cache hit)` |
| 2026-10-08T18_55_36_597Z-debug-0.log / 17 | `16 http cache https://registry.npmjs.org/chalk 480ms (cache hit)` |
| 2026-10-08T18_55_54_408Z-debug-0.log / 19 | `18 http cache chalk@https://registry.npmjs.org/chalk/-/chalk-4.1.2.tgz 3ms (cache hit)` |

Cold log also contains early optimistic `http cache` records followed by six actual tarball fetch
misses; one cache-looking line alone is not proof. Warm/offline logs and source-pinned successful
installs provide the contrasting native controls. Logs are auxiliary; output has no fetch records.

### Lead decision still required

Observed safe complete variants contain necessary summaries/advice/warnings, no material progress
sequence. Historical whitespace savings are rejected as an implementation goal. Mandatory material
progress remains **not established**, successful peer-warning remains blocked, lifecycle reduction
remains unsafe-producer. Lead may approve further evidence or record a human scope decision later;
this investigation grants no waiver, broad coverage claim, parser admission or done status.

## Scoped verification

Repository checks permitted for this capture task: `npm ci --ignore-scripts --no-audit` and
`npm run typecheck` (completed). No full tests/check/build/smoke/benchmark/CI was run or dispatched.
Fixture byte/hash, schema/ID/file correspondence, expected ordering and destructive evidence
controls are checked separately against the capture receipts; they do not prove parser behavior.
The disposable verifier matched all 13 native SHA-256 receipts and six authored goldens; corruption,
lost required line and missing final LF controls were rejected without changing committed fixtures.
The six historical proposal deltas are 2, 2, 2, 2, 3 and 1 UTF-8 bytes; initial seven cases stay exact.
Follow-up verification matched all eight new receipt hashes, registry source facts against native
locks and cited debug-log hashes; original 13 records/files/goldens compared unchanged to `4f05bb7`.
All 21 native hashes matched; controls detected corruption, lost audit severity and injected CR.
New eight cases are exact; five advisory URLs and outside-range remediation were verified intact.
Repository typecheck need not rerun: only captures/docs/Python producer changed, no TypeScript/deps.
Final CI is lead-owned; inspect PR checks without dispatching a workflow. Stop for lead review;
do not merge or implement a parser until approval.
