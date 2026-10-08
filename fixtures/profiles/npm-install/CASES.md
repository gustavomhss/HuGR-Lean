# P01 native npm capture packet

State: CAPTURED, awaiting lead approval. Baseline `07ffe15`; branch `campaign/native-v2/P01`.
Only fixtures are proposed. `status` is the proposed future public-filter disposition, not a claim
that a parser exists or that the baseline reduces these cases. No parser/test/registry changes.

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

## Independent proposal and required evidence

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

## Mandatory coverage and explicit blockers

Install, ci, workspace/selector, existing/missing lock, offline/local state reuse, peer failure,
audit-zero, genuine deprecation and lifecycle collisions are captured above. No silent waiver.

- **Audit-positive severity/remediation:** BLOCKED capture. Authored local graph has no registry
  vulnerability evidence. No vulnerable registry package was fetched; this packet cannot prove
  preserving nonzero vulnerability counts, severity, advisory URLs or fix advice. Needs approved
  tiny public pinned dependency or externally authenticated native capture before admission.
- **Successful peer override warning:** BLOCKED capture. Incompatible peer deterministically
  produced ERESOLVE offline. No `--force`/`--legacy-peer-deps` success-warning grammar is admitted.
- **Registry tarball cold/warm cache and offline cache miss:** BLOCKED capture. Local file/workspace
  reuse is captured, not a registry cache hit/miss proof. Those argv/output combinations remain
  unsupported until separately captured under approved bounded public dependencies.
- **Live TTY progress / separate-stream adapter:** BLOCKED capture. Only complete pipe output was
  captured. Do not infer carriage-return progress or an adapter's merge order from these fixtures.
- **Lifecycle-enabled reduction:** UNSAFE, not NO_NOISE; requires authenticated producer boundaries
  or a human scope decision. Presence of matching npm-shaped text alone is insufficient.
- **Implementation/behavior tests:** NOT IMPLEMENTED by instruction. Pending lead approval, not an
  exact-only substitute for mandatory reduction. No red/green parser proof or runtime admission.

## Scoped verification

Repository checks permitted for this capture task: `npm ci --ignore-scripts --no-audit` and
`npm run typecheck` (completed). No full tests/check/build/smoke/benchmark/CI was run or dispatched.
Fixture byte/hash, schema/ID/file correspondence, expected ordering and destructive evidence
controls are checked separately against the capture receipts; they do not prove parser behavior.
The disposable verifier matched all 13 native SHA-256 receipts and six authored goldens; corruption,
lost required line and missing final LF controls were rejected without changing committed fixtures.
The six proposal deltas are 2, 2, 2, 2, 3 and 1 UTF-8 bytes. Seven cases remain exact.
Final CI is lead-owned; inspect PR checks without dispatching a workflow. Stop for lead review;
do not merge or implement a parser until approval.
