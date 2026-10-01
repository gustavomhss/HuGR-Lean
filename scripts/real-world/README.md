# Real-world benchmark contract

The benchmark executes original commands in isolated, pinned open-source projects.
It does not change production filtering or choose inputs because a reducer accepts them.

## Workload contract
`provision(root, { repoRoot })` returns `{ projects, cases, env, versions }`.
Projects identify repository, exact commit, license and isolated path. Cases contain:
`id`, `project`, `category` (`primary` or `control`), `command`, `cwd`, `expectExit`
(`zero` or `nonzero`), `oracle`, optional `marker`, `allowEmpty`, `prepare`/`restore` functions.
Preparation is outside capture/timing; every executed command and project modification is recorded.
Cold/warm commands are distinct chronological cases. Missing tools/setup or unexpected exits are
named failures, never skipped cases or empty-success substitutes. Network setup is not filter overhead.

## Capture and measurement
Capture stdout/stderr arrival order, actual exit/signal, complete-versus-timeout facts and command
wall time. Preserve exact captured bytes and UTF-8 roundtrip; archive original/filtered output.
One native execution per case measures capture duration, not command-runtime p95.
Replay that same observation through compiled 0.2.0 core and raw-off adapter: 20 warmups, 100
samples, p50/p95/mean. Verification and disk writes stay outside timed filter work.
Actual-host scenarios separately verify model-visible results and upstream truncation.

## Oracles and verdict
`checkEvidence(case, capture, result)` checks nonexpansion, metadata truth, exact passthrough for
failures/unknown/exact surfaces, and independently identified native summaries/evidence.
It returns named violations. Never assume a case reduces; report status/reason and all zero savings.
Required failure markers prove an intended failure actually ran. Whole failure text stays exact.
Report primary-project coverage and weighted byte reduction separately from positive controls,
synthetic data, setup and host startup. A fast core does not establish useful real-world coverage.
No tokenizer is used; byte/line counts are not exact token or model-quality claims.

Interrupted runs remain immutable. Start a fresh output directory and fresh isolated provisioning;
automatic resume/prepared-project reuse is deliberately unsupported to avoid restoring edited state
or overwriting failed attempts. `analyze.mjs` and `replay.mjs` only inspect verified existing captures.

## Files and ownership
Lead owns capture/measurement/runner/results. Catalog agent owns `workloads.mjs` and setup tests.
Oracle agent owns `evidence.mjs` and its teeth tests. Host proof receives a separate disjoint file.
All code files target 400 LOC, allow 600, tolerate 750; above 750 split. One package remains.
