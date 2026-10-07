# Public GitHub delivery candidate — 2026-10-07

**Candidate pending human approval; not a new release or a completed gate.**
Local Git is canonical. Public source destination: [gustavomhss/HuGR-Lean](https://github.com/gustavomhss/HuGR-Lean).
This is the single operational status record; historical release/benchmark reports remain dated evidence.

## Identity and evidence boundary

Frozen code baseline: `56cd420190506e495b6446daf6ec6e4f95c94da2`.
It contains the independently reviewed format C1 fix, manual exact-SHA Actions guard,
new-owner package/module contact identity and retirement of previous-provider execution configs.
Documentation changes are based on that tree. Full local proof is ongoing; no outcome is known
at this handoff. Earlier component review and historical successes do not certify this candidate.

The delivery PR and candidate evidence receipt must record the exact full 40-character head
after documentation integration. Use that approved head as `FULL_REVIEWED_DELIVERY_SHA` in
installation/dispatch commands. The frozen baseline is provenance, not a self-referential pin
for this document or automatic installation approval. Moving refs are not reviewed snapshots.

## PLAN delivery ledger

The [plan](../PLAN.md) remains the acceptance source. Links identify implemented surfaces
and existing witnesses, not fresh executions by this documentation change.

| PLAN item | Actual implementation / witnesses | Current evidence and remaining decision |
| --- | --- | --- |
| 1. Foundation | [Manifest](../package.json), [types](../src/core/types.ts), [LICENSE](../LICENSE), [build](../scripts/build.mjs), [structure tests](../tests/structure.test.ts) | One MIT TypeScript package, Node 22+, five modules. Frozen-head structure/typecheck/build results pending. |
| 2. Pure core | [Engine](../src/core/engine.ts), [command identity](../src/core/command.ts), [lines](../src/core/lines.ts), [core tests](../tests/core.test.ts), [normalization tests](../tests/normalize.test.ts) | Bounded input, fail-open, UTF-16 spans and UTF-8 byte metrics implemented. Current full preservation/mutation receipts pending. |
| 3. OpenCode | [Adapter](../src/opencode/index.ts), [plugin tests](../tests/plugin.test.ts), [host proof](OPENCODE.md) | Existing real-host/model-request proof: 1.18.17 legacy CLI, macOS x64, file and preinstalled package-name loading. Candidate installed-host receipt pending; V2/other routes unproved. |
| 4. Profiles | [Registry](../src/profiles/index.ts), [runners](../src/profiles/runners.ts), [formats](../src/profiles/formats.ts), [runner tests](../tests/runners.test.ts), [format tests](../tests/formats.test.ts), [combined tests](../tests/combined.test.ts), [coverage](COVERAGE.md) | Native admitted grammars only; diagnostics/install progress remain passthrough without full grammar/evidence. Final C1 fix is in this baseline; historical `ae4c3b5` lacks it. Current full replay pending. |
| 5. UX | [Options](../src/opencode/config.ts), [CLI](../src/cli/index.ts), [CLI tests](../tests/cli.test.ts), [README lifecycle](../README.md#lifecycle) | Installed doctor/file URL, disable/upgrade/rollback/remove paths documented. Candidate package smoke/installation receipt pending; no registry availability claim. |
| 6. Optional raw | [Store](../src/raw/index.ts), [raw tests](../tests/raw.test.ts), [TTL tests](../tests/raw-ttl.test.ts), [real-host raw script](../scripts/opencode-raw-smoke.mjs) | Raw off by default; exact captured boundary, bounded bytes/lazy TTL, safe IDs, unavailable recovery implemented. Historical host proof exists; current installed/raw-host receipt pending. |
| 7. Proof/release | [Combined corpus tests](../tests/combined.test.ts), [installed smoke](../scripts/package-smoke.mjs), [smoke controls](../tests/package-smoke.test.ts), [benchmarks](BENCHMARK.md), [native evaluation](BENCHMARK_REAL.md), [NOTICE](../NOTICE), [distribution](DISTRIBUTION.md) | Existing mechanical evidence is head/date-specific. Complete candidate local proof, three-OS CI, retained corpus verification and human publication/usefulness decisions remain pending. |

## Local completion receipt required before CI

Record the integrated full SHA, OS/architecture, Node/npm versions, command outcomes,
test totals/failures/skips, retained logs, artifact path/checksum and destructive probes with
restoration. Run serially, using the README's explicit Node test command with file concurrency 2:
structure, typecheck, complete tests, build, installed smoke and pack inspection. Do not substitute
focused subsets for the full suite. The default npm test/check scheduling is unchanged.

Installed package proof, actual host/model-bound proof and raw off/on recovery are separate
checks. Smoke without `--opencode` can prove package paths but reports incomplete release proof;
it is not real-host compatibility. Latency acceptance must retain declared budgets, environment,
load and failures; historic timing is not a measurement of this head. This documentation lane
runs static checks only, not tests, npm installation, benchmarks or remote CI.

The historical native corpus is not recovered for a fresh pass. Do not fabricate captures,
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
