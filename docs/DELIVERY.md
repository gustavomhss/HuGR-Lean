# Public GitHub delivery candidate — native documentation close, 2026-10-09

**Candidate pending human approval; not a new release or a completed gate.**
Local Git is canonical. Public source destination: [gustavomhss/HuGR-Lean](https://github.com/gustavomhss/HuGR-Lean).
This is the single operational status record; historical release/benchmark reports remain dated evidence.

## Identity and evidence boundary

Current documentation baseline: `20ce6cd` on `campaign/native-integration`. Default registry
has 20 IDs; promoted native index has 41 bounded families, 25 explicitly exact-only.
[Coverage](COVERAGE.md) maps runtime/exact evidence; [campaign](NATIVE-COVERAGE-CAMPAIGN.md)
retains independent integration/probe receipts and missing/unimplemented decisions.
Final artifact proof, current benchmark and single exact-SHA three-OS package CI are pending
lead freeze. No new release, publication, token savings or wider host support is claimed.

Historical pre-campaign code baseline: `56cd420190506e495b6446daf6ec6e4f95c94da2`.
It contains the independently reviewed format C1 fix, manual exact-SHA Actions guard,
new-owner package/module contact identity and retirement of previous-provider execution configs.
The earlier documentation delivery was based on that tree. Its local macOS proof was
independently verified. Historical aggregate blob comparison to its first documentation
commit found only the four owned docs changed: source/scripts/tests/package/workflow are identical.
This proves code identity, not identity of the final documentation-bearing tarball or release approval.

The delivery PR and candidate evidence receipt must record the exact full 40-character head
after documentation integration. Use that approved head as `FULL_REVIEWED_DELIVERY_SHA` in
installation/dispatch commands. The frozen baseline is provenance, not a self-referential pin
for this document or automatic installation approval. Moving refs are not reviewed snapshots.

## PLAN delivery ledger

The [plan](../PLAN.md) remains the acceptance source. Links identify implemented surfaces
and existing witnesses, not fresh executions by this documentation change. Baseline pass
statements below refer to the historical pre-campaign receipt, not current-head checks.

| PLAN item | Actual implementation / witnesses | Current evidence and remaining decision |
| --- | --- | --- |
| 1. Foundation | [Manifest](../package.json), [types](../src/core/types.ts), [LICENSE](../LICENSE), [build](../scripts/build.mjs), [structure tests](../tests/structure.test.ts) | One MIT TypeScript package, Node 22+, five modules. Baseline local structure/typecheck/build passed. |
| 2. Pure core | [Engine](../src/core/engine.ts), [command identity](../src/core/command.ts), [lines](../src/core/lines.ts), [core tests](../tests/core.test.ts), [normalization tests](../tests/normalize.test.ts) | Bounded input, fail-open, UTF-16 spans and UTF-8 byte metrics implemented. Baseline full suite and temporary compiled-copy mutation controls passed/restored. |
| 3. OpenCode | [Adapter](../src/opencode/index.ts), [plugin tests](../tests/plugin.test.ts), [host proof](OPENCODE.md) | Historical file/preinstalled package-name proof plus fresh installed model-bound proof at baseline: 1.18.17 legacy CLI, macOS x64. Final docs-artifact proof pending; V2/other routes unproved. |
| 4. Profiles | [Registry](../src/profiles/index.ts), [manual](../src/profiles/MANUAL.md), [combined tests](../tests/combined.test.ts), [coverage](COVERAGE.md) | Current bounded reducers include diagnostics/layout/install progress; Cargo/Go extension and Node TAP reuse. Jest/Vitest plaintext reductions withdrawn, legacy validators retained. Exact ledger adds captures without stubs; final installed replay pending. |
| 5. UX | [Options](../src/opencode/config.ts), [CLI](../src/cli/index.ts), [CLI tests](../tests/cli.test.ts), [README lifecycle](../README.md#lifecycle) | Baseline installed CLI/doctor and normal lifecycle installation passed. Upgrade/rollback/remove documented; final docs-artifact installation pending; no registry availability claim. |
| 6. Optional raw | [Store](../src/raw/index.ts), [raw tests](../tests/raw.test.ts), [TTL tests](../tests/raw-ttl.test.ts), [real-host raw script](../scripts/opencode-raw-smoke.mjs) | Raw off by default; exact captured boundary, byte/TTL limits and safe IDs implemented. Fresh baseline raw off/on host and exact CLI recovery passed. |
| 7. Proof/release | [Combined corpus tests](../tests/combined.test.ts), [installed smoke](../scripts/package-smoke.mjs), [smoke controls](../tests/package-smoke.test.ts), [benchmarks](BENCHMARK.md), [native evaluation](BENCHMARK_REAL.md), [NOTICE](../NOTICE), [distribution](DISTRIBUTION.md) | Baseline local mechanical/installed/host proof passed. Final docs-artifact proof, three-OS CI, retained corpus verification and human publication/usefulness decisions remain pending. |

## Historical pre-campaign local proof; current artifact receipt pending

The independently verified private receipt covers exactly the frozen baseline above on Darwin
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

The receipt is private, not a public downloadable bundle. Final documentation changes affect
packed bytes: final repacking, installation, document inspection and exact-head evidence are
forthcoming. Record that receipt outside the candidate commit to avoid a self-hash cycle, with
the full integrated SHA, artifact checksum, outcomes and retained logs. CI and human review
remain pending; the baseline artifact is not the final docs artifact.

Installed package proof, actual host/model-bound proof and raw off/on recovery are separate
checks. Smoke without `--opencode` can prove package paths but reports incomplete release proof;
it is not real-host compatibility. Latency acceptance must retain declared budgets, environment,
load and failures; historic timing is not a measurement of this head. This documentation lane
runs read-only scoped link/pin-path audits only; it provides no fresh product-test,
installation, benchmark or remote-CI execution evidence.

The historical native corpus is not recovered for a fresh pass. Do not fabricate captures,
rerun upstream commands as replacement historical evidence or erase failed reports.
Recorded primary savings remain **471 / 1,272,795 UTF-8 bytes = 0.037005%**, with zero material
primary cases: **the practical noise-reduction criterion failed on that corpus**.
Historical sampled preservation and engineering latency results do not establish general
utility, token/cost savings or wider host support. No new utility goal or waiver is inferred.

## Focused capture Actions; final package CI pending

Two capture runs are recorded: [Rust builtin bench](https://github.com/gustavomhss/HuGR-Lean/actions/runs/37979866069)
at candidate/workflow/checkout `da4c7601ad37cd1305c1ecd52733a84ee8dcc769`, and
[rustdoc](https://github.com/gustavomhss/HuGR-Lean/actions/runs/37989424550) at
`6b40ec97e78ed233e2373928854fd9dac02dd802`. They prove dated-nightly Rust/native
cases only, including rustdoc Checking/nonhost/config artifact controls; neither is final
package CI. Capture-only workflows were excluded from integration. Current Linux/macOS/
Windows package matrix remains **pending**; old macOS proof cannot replace it.

After all capture/agent work stops, lead freezes and pushes the final integrated candidate,
records its full SHA and artifact evidence, opens final PR, then dispatches ONE full workflow.
Confirm dispatch ref resolves to the reviewed full SHA; replace both placeholders below.
If that sole run fails, campaign remains incomplete; another full attempt needs human authorization.

```sh
gh workflow run ci.yml --repo gustavomhss/HuGR-Lean --ref FROZEN_CANDIDATE_REF -f candidate_sha=FULL_REVIEWED_DELIVERY_SHA
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

Candidate approval/completion, missing variants and unimplemented safe-format dispositions,
current performance/practical usefulness, release
version/tag/GitHub publication and npm authorization remain explicit lead decisions. Missing
evidence is not silently waived by source publication or future CI. The public repository is
source-only at this handoff; the original local tarball remains retained separately. Agents stop
for review, never merge. Historical [0.2.0 release notes](RELEASE.md) are not this candidate's receipt.
