# Public GitHub delivery candidate — utility update 2026-10-08

**Candidate pending human approval; not a new release or a completed gate.**
Local Git is canonical. Public source destination: [gustavomhss/HuGR-Lean](https://github.com/gustavomhss/HuGR-Lean).
This is the single operational status record; historical release/benchmark reports remain dated evidence.

## Identity and evidence boundary

Utility documentation base: `b2af5300567e6f4fc96c77a81f599fbdc665916b`.
All four native parser cold reviews are approved. The integrated source declares 10 profile IDs
(nine reducers plus inert `tsc`) and a 39-case combined/installed matrix. Current full-suite,
installed-package, host and latency verification remains pending; no passing outcome is inferred.
Earlier delivery baseline `56cd420190506e495b6446daf6ec6e4f95c94da2` has dated private proof below,
not a receipt for the utility candidate. [Utility evaluation](UTILITY_EVALUATION.md) defines the new corpus.

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
| 2. Pure core | [Engine](../src/core/engine.ts), [command identity](../src/core/command.ts), [lines](../src/core/lines.ts), [core tests](../tests/core.test.ts), [normalization tests](../tests/normalize.test.ts) | Bounded input, fail-open, UTF-16 spans and UTF-8 byte metrics. Earlier baseline mutation controls passed/restored; current candidate full-suite receipt pending. |
| 3. OpenCode | [Adapter](../src/opencode/index.ts), [plugin tests](../tests/plugin.test.ts), [host proof](OPENCODE.md) | Historical file/preinstalled package-name proof plus fresh installed model-bound proof at baseline: 1.18.17 legacy CLI, macOS x64. Final docs-artifact proof pending; V2/other routes unproved. |
| 4. Profiles | [Registry](../src/profiles/index.ts), [runner barrel](../src/profiles/runners.ts), [Node TAP](../src/profiles/node-test.ts), [formats](../src/profiles/formats.ts), [combined tests](../tests/combined.test.ts), [coverage](COVERAGE.md) | Cargo/Go/pytest expansion and Node TAP cold reviews approved. Closed diagnostic contexts are preserved; unsupported diagnostics/install progress pass through. Jest/Vitest utility strategy unchanged. Final integrated receipts pending. |
| 5. UX | [Options](../src/opencode/config.ts), [CLI](../src/cli/index.ts), [CLI tests](../tests/cli.test.ts), [README lifecycle](../README.md#lifecycle) | Baseline installed CLI/doctor and normal lifecycle installation passed. Upgrade/rollback/remove documented; final docs-artifact installation pending; no registry availability claim. |
| 6. Optional raw | [Store](../src/raw/index.ts), [raw tests](../tests/raw.test.ts), [TTL tests](../tests/raw-ttl.test.ts), [real-host raw script](../scripts/opencode-raw-smoke.mjs) | Raw off by default; exact captured boundary, byte/TTL limits and safe IDs implemented. Fresh baseline raw off/on host and exact CLI recovery passed. |
| 7. Proof/release | [Combined corpus tests](../tests/combined.test.ts), [installed smoke](../scripts/package-smoke.mjs), [smoke controls](../tests/package-smoke.test.ts), [historical benchmarks](BENCHMARK.md), [historical native evaluation](BENCHMARK_REAL.md), [utility evaluation](UTILITY_EVALUATION.md), [distribution](DISTRIBUTION.md) | Private composed branch reports five smoke passes. Final SHA/package/host/full-suite/latency receipt, three-OS CI, historical replay and human publication/usefulness decisions remain pending. |

## Dated baseline proof; utility candidate receipt pending

The earlier independently verified private receipt covers exactly `56cd420190506e495b6446daf6ec6e4f95c94da2` on Darwin
24.3.0 x64, Node 22.17.1/npm 10.9.2. Structure/typecheck/build, the full suite at file concurrency 2,
installed smoke and pack inspection passed: **688 passes, 0 failures, 0 skips**. Four structure
LOC warnings remain recorded. Existing mutation controls rejected altered temporary compiled
copies and restored them; no tracked source was mutated. Default npm test/check scheduling is unchanged.

Installed actual OpenCode 1.18.17 with isolated config/local model mock reduced Cargo
**1058 → 248 UTF-8 bytes**; native exit 101 and unknown output remained exact. Raw off/on
reduced **1843 → 233 bytes**, with exact retained-original CLI recovery. Normal prepack and
isolated lifecycle-enabled installation also passed; no global installation was tested.

Fresh mechanical p95 core/raw-off adapter: **4.326/3.849 ms at 256 KiB** (limits 5/10 ms),
**18.091/19.541 ms at 1 MiB** (limits 25/35 ms); all budgets met. One run, 20 warmups/100
samples, fixture/control/synthetic workloads, no upstream recapture. Start load averages:
3.457/3.437/3.343. These local measurements do not certify another OS or practical usefulness.

The earlier receipt is private, not a public downloadable bundle or current utility result.
Private composed-branch smoke is partial evidence only. Final repacking, installation, host/model-bound
checks, full suite, latency and document inspection must bind the integrated public head and tarball.
Record the full SHA, package SHA-256, environment, outcomes and retained failures/logs in the external
PR receipt to avoid a self-hash cycle. The final code SHA is supplied by the lead, not guessed here.

Installed package proof, actual host/model-bound proof and raw off/on recovery are separate
checks. Smoke without `--opencode` can prove package paths but reports incomplete release proof;
it is not real-host compatibility. Latency acceptance must retain declared budgets, environment,
load and failures; historic timing is not a measurement of this head. This documentation lane
runs static checks only; it does not supply product-test, installation, native-run or latency receipts.

The new native corpus contains 25 original local fixture cases (12 noise, 13 exact), with deliberate
long names/many tests; it is not representative real-agent-session evidence. Its frozen inventory is
439 files / 1,193,627 bytes. Cargo's deliberate 61-second build delay and native `2m 01s` are outside
filter latency. Recorded Node/tsx runtime fingerprints do not vendor binaries or revalidate them locally.

The historical corpus tarball is missing for fresh replay verification. Do not fabricate captures,
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
