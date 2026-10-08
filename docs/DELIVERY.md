# Public GitHub delivery candidate — utility update 2026-10-08

**Candidate pending human approval; not a new release or a completed gate.**
Local Git is canonical. Public source destination: [gustavomhss/HuGR-Lean](https://github.com/gustavomhss/HuGR-Lean).
This is the single operational status record; historical release/benchmark reports remain dated evidence.

## Identity and evidence boundary

Frozen code baseline: `f9d2f6c8540b9bc3479de59cbd301074f1ff80df`, locally proved on **2026-10-08 UTC**.
All four native parser cold reviews are approved. The integrated source declares 10 profile IDs
(nine reducers plus inert `tsc`); full-suite, normal installed-package, host and latency receipts
for that code baseline are recorded below. This new docs head is **not yet packed**; final scoped
package binding is pending. [Utility evaluation](UTILITY_EVALUATION.md) defines the corpus and limits.

The delivery PR and candidate evidence receipt must record the exact full 40-character head
after documentation integration. Use that approved head as `FULL_REVIEWED_DELIVERY_SHA` in
installation/dispatch commands. The frozen baseline is provenance, not a self-referential pin
for this document or automatic installation approval. Moving refs are not reviewed snapshots.

## PLAN delivery ledger

The [plan](../PLAN.md) remains the acceptance source. Links identify implemented surfaces
and existing witnesses, not fresh executions by this documentation change.

| PLAN item | Actual implementation / witnesses | Current evidence and remaining decision |
| --- | --- | --- |
| 1. Foundation | [Manifest](../package.json), [types](../src/core/types.ts), [LICENSE](../LICENSE), [build](../scripts/build.mjs), [structure tests](../tests/structure.test.ts) | One MIT TypeScript package, Node 22+, five modules. Baseline local structure/typecheck/build passed. |
| 2. Pure core | [Engine](../src/core/engine.ts), [command identity](../src/core/command.ts), [lines](../src/core/lines.ts), [core tests](../tests/core.test.ts), [normalization tests](../tests/normalize.test.ts) | Bounded input, fail-open, UTF-16 spans and UTF-8 byte metrics. Dated f9d2 full suite passed with observed controls; earlier mutation controls retained/restored. Final docs-artifact binding pending. |
| 3. OpenCode | [Adapter](../src/opencode/index.ts), [plugin tests](../tests/plugin.test.ts), [host proof](OPENCODE.md) | Dated f9d2 installed model-bound proof: 1.18.17 legacy CLI, macOS x64, 23 scenarios. Final docs-artifact binding pending; V2/other routes unproved. |
| 4. Profiles | [Registry](../src/profiles/index.ts), [runner barrel](../src/profiles/runners.ts), [Node TAP](../src/profiles/node-test.ts), [formats](../src/profiles/formats.ts), [combined tests](../tests/combined.test.ts), [coverage](COVERAGE.md) | Cargo/Go/pytest expansion and Node TAP cold reviews approved. Closed diagnostic contexts preserved; unsupported diagnostics/install progress pass through. Dated utility 25/25 passed; Jest/Vitest utility strategy unchanged. |
| 5. UX | [Options](../src/opencode/config.ts), [CLI](../src/cli/index.ts), [CLI tests](../tests/cli.test.ts), [README lifecycle](../README.md#lifecycle) | Baseline installed CLI/doctor and normal lifecycle installation passed. Upgrade/rollback/remove documented; final docs-artifact installation pending; no registry availability claim. |
| 6. Optional raw | [Store](../src/raw/index.ts), [raw tests](../tests/raw.test.ts), [TTL tests](../tests/raw-ttl.test.ts), [real-host raw script](../scripts/opencode-raw-smoke.mjs) | Raw off by default; exact captured boundary, byte/TTL limits and safe IDs implemented. Fresh baseline raw off/on host and exact CLI recovery passed. |
| 7. Proof/release | [Combined corpus tests](../tests/combined.test.ts), [installed smoke](../scripts/package-smoke.mjs), [smoke controls](../tests/package-smoke.test.ts), [historical benchmarks](BENCHMARK.md), [historical native evaluation](BENCHMARK_REAL.md), [utility evaluation](UTILITY_EVALUATION.md), [distribution](DISTRIBUTION.md) | Dated f9d2 local receipts below. Final docs-head scoped package/runtime binding, three-OS CI, missing historical replay and human publication/usefulness decisions remain pending. Docs alone do not complete PLAN delivery. |

## Dated code-baseline proof; final docs-artifact binding pending

Private local evidence in the proof worktree: `.closure-proof/final-f9d2/summary.json`, `SUMMARY.md`,
`next-host.json`, and `.closure-proof/host-f9d2-sdk/summary.json`, `SUMMARY.md`, `receipt.json`.
These are private receipt identifiers, **not public download links**. The final-phase handoff precedes
host execution; the later host receipt records its outcome. Source/tree/compiled/package/fixture
hash bindings and logs are recorded externally; final docs-head binding belongs in the external final receipt,
avoiding a self-hash cycle.

At the frozen code baseline on Darwin 24.3.0 x64, Node 22.17.1, structure/typecheck/build passed.
Full suite at file concurrency 2: **1,026 passes; 0 failures, cancellations, skips or todo**.
Observed preservation/refusal/process controls are recorded; typecheck was not separately mutation-probed.
Utility: **25/25 cases passed; 12 reduced, 11 material, 13 exact**. Normal lifecycle-enabled pack/install
and installed core/after-hook inspection passed **39 cases / 10 IDs**, plus physical CLI/doctor/notices.
This normal consumer proof is distinct from the separately repacked prebuilt snapshot smoke.

The same normal `hugr-lean-0.2.0.tgz` supplied installed and host proof: **109,233 bytes**,
SHA-256 `f8acf94bd9d71f32eef554b0ab7a68c0deaec06875126af01b341fdb53dac1c4`.
Actual **OpenCode 1.18.17, macOS x64, legacy `opencode run`**, isolated config/loopback model mock:
**23 scenarios = 7 file + 5 package-name + 8 baseline/on across four native families + 3 raw**.
File/package-name routes preinstalled/cached this artifact; this is not npm registry availability.
Native fixture text replay uses authenticated original/golden bytes and test-only PATH shims,
not upstream recapture or model-quality evidence. Raw off/on/disabled and installed CLI recovery were exact.

Mechanical p95 core: **3.856962 / 18.593448 ms** at **256 KiB / 1 MiB** (limits **5 / 25 ms**);
raw-off adapter: **3.818268 / 20.067017 ms** (limits **10 / 35 ms**). All declared budgets met in
one run, 20 warmups/100 samples, fixture/control/synthetic workloads; start load averages
**3.958496 / 4.750488 / 16.826172**. This does not certify another OS or practical usefulness.
Prior 52dee1 latency failure, 3f92 `LIVE_LOG_DELAY_CONTROL_MISSING`, blocked host attempt and all
other failure records remain retained. Default npm test/check scheduling is unchanged.

This docs head is not yet packed. The lead next binds the final full docs SHA and scoped package receipt,
comparing runtime blobs with the proved artifact **before claiming equivalence**. Dated code-baseline
proof is not automatic final docs-artifact proof, candidate approval or PLAN completion.

Installed package proof, actual host/model-bound proof and raw off/on recovery are separate
checks. Smoke without `--opencode` can prove package paths but reports incomplete release proof;
it is not real-host compatibility. Latency acceptance must retain declared budgets, environment,
load and failures; dated baseline timing is not a fresh measurement of this docs head. This documentation lane
runs static checks only; it does not supply product-test, installation, native-run or latency receipts.

The native corpus contains 25 original local fixture cases (12 reduced, 11 material, 13 exact), with deliberate
long names/many tests; it is not representative real-agent-session evidence. Its frozen inventory is
439 files / 1,193,627 bytes. Cargo's deliberate 61-second build delay and native `2m 01s` are outside
filter latency. Recorded Node/tsx runtime fingerprints do not vendor binaries or revalidate them locally.

The historical `ce98` corpus tarball is missing for fresh replay verification. Do not fabricate captures,
rerun upstream commands as replacement historical evidence or erase failed reports.
Recorded primary savings remain **471 / 1,272,795 UTF-8 bytes = 0.037005%**, with zero material
primary cases: **the practical noise-reduction criterion failed on that corpus**.
Historical sampled preservation and engineering latency results do not establish general
utility, token/cost savings or wider host support. No new utility goal or waiver is inferred.

## Deferred GitHub Actions

Actions must stay disabled until complete candidate local verification is recorded and the
lead explicitly declares completion. No AppVeyor or GitLab execution route remains active.
The candidate Linux/macOS/Windows matrix is **pending**, not green or replaced by local macOS.

After that completion decision, publish the exact candidate to `delivery/github-ready` and
make that branch the new repository default so manual dispatch is available. This setup does
not merge into `main`. Enable Actions only then. Confirm the default/dispatch branch resolves
to the approved full SHA and replace the placeholder before issuing the single dispatch:

```sh
gh workflow run ci.yml --repo gustavomhss/HuGR-Lean --ref delivery/github-ready -f candidate_sha=FULL_REVIEWED_DELIVERY_SHA
```

The [workflow](../.github/workflows/ci.yml) uses `workflow_dispatch` only and checks out the input.
The [identity guard](../scripts/ci-candidate.mjs) requires full lowercase SHA equality across input,
event `github.sha`, workflow `github.workflow_sha` and checkout HEAD, plus the expected repository/event.
If the dispatched branch head differs from the candidate input, identity validation rejects it.
Each OS runs Node 22.17.1, structure/typecheck, full tests at file concurrency 2, build, smoke
and pack dry-run. Require all three actual completed lanes; retain failures, cancellations and
skips explicitly. Uploaded provenance records identity only, not later gate success. CI does
not execute OpenCode, native recapture or latency acceptance.

## Human decisions still open

Candidate approval and completion, missing-corpus disposition, practical usefulness, release
version/tag/GitHub publication and npm authorization remain explicit lead decisions. Missing
evidence is not silently waived by source publication or future CI. The public repository is
source-only at this handoff; the original local tarball remains retained separately. Agents stop
for review, never merge. Historical [0.2.0 release notes](RELEASE.md) are not this candidate's receipt.
