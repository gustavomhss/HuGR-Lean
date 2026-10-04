# Corrective benchmark integration

This is a review stack, not a merge or a new native benchmark run. Main remains the
0.2.0 release. The final branch combines previously reviewed corrective heads using
named cherry-picks, preserves their history, and adds cross-group regression controls.

## Pinned inputs

| Group | Reviewed head | Replacement-repository review entry |
| --- | --- | --- |
| Scaffold | `29379937a6f1e87d17c95e418d22332c52c3d750` | Imported original stack |
| A: retained workspaces | `247f96f2e36178413ff8acb88f04dd96b585ffd2` | PR #7 and predecessors |
| B: process lifetime/execution | `3b7d3bc1c4cfb572cbf94015cdaa999b7f970540` | PR #14 and predecessors |
| C: failure evidence | `84e93271c9c6149eb65320d4e8f0586629517734` | PR #9 and predecessor |
| D: integrity/replay | `9e1b260dbaf6c2e6468e112d7210ff71757aee13` | PR #3 |
| E: host evidence/raw streams | `f7814da93a20a86b7f1cfdbcc969d93eff61ff63` | PR #11 |
| Production C1 guard | `d203d3de4d209c042640b16fbade43d1ea240209` | Recovered original PR #125 review |
| CI routing | `bcdfa460556c71b206228ac2f91ad8fc0890e9da` | PR #10 |

New PR references belong to https://github.com/gusmhs/HuGR-Lean. Original PR #125
belonged to the blocked `gmhelmold` repository; it is not a same-number replacement PR.
The B head already contains the scaffold and CI routing. The E copies of CI-routing
commits were omitted as duplicates. No donor provenance or historical capture was rewritten.

## Linear review checkpoints

Each `integrate/stack-NN` branch is a cumulative immutable checkpoint. Its delta from
the preceding row fits the 400-physical-line review budget. These refs preserve review
boundaries; they are not assertions that every intermediate state has fresh CI.
The final verification PR is based on stack-14 and runs the entire integrated tree.
Only that PR's exact final head is the integration gate. Earlier component approvals
do not themselves approve this integration or authorize a merge.

| Checkpoint | Commit | Physical changed lines from prior checkpoint |
| --- | --- | ---: |
| Base B | `3b7d3bc1c4cfb572cbf94015cdaa999b7f970540` | — |
| stack-01 | `16275fc721645cd348e3826d1331a79bd46ff0a3` | 397 |
| stack-02 | `b4806d8e6ba384f877cec7012847ad8ec177dbc7` | 88 |
| stack-03 | `ba4b52dcc2b8f426082bd333df3e8b7bff340063` | 400 |
| stack-04 | `1cd8b2bddf618c743f8349520de49842ea0964d3` | 271 |
| stack-05 | `3ee2344e84495395b7bd6f601c8dea5bf2dd8016` | 400 |
| stack-06 | `95f67192985e7ecd6c49ac7ed2a86f1b25060872` | 333 |
| stack-07 | `3b849df3a4601d86deb9e8adc2136a5ac70c80b8` | 280 |
| stack-08 | `61430f20a30b92c5031707ba42e7802fdc927248` | 274 |
| stack-09 | `d03845cdc122db8721a6b017aebf9375edddbf9d` | 201 |
| stack-10 | `1fbb69dfd969322322a3e1115863a6c6c98c68fb` | 245 |
| stack-11 | `d0989999850eed5c798c48d8d15829f003a24ed0` | 322 |
| stack-12 | `3eba51c9c5ae0948f5f741f196d4f486592c73f1` | 174 |
| stack-13 | `7150ba95bc023f4bc28e7afc71c918dd6c19e3b5` | 313 |
| stack-14 | `c3463f93d2024704bffe908a2fae121912377c54` | 200 |

## Conflict decisions and proof

- `run.mjs`: retain A's workspace provenance/helper diagnostics, B's execution guard
  after raw archival and before measurement, D's native policy in planned/result rows,
  and one copy of the shared dependency seam.
- `real-workloads.test.ts`: combine A's source/index/retained-copy checks with B's
  bounded live-channel cleanup. Retire only the old direct-edit rollback test.
- Imports combine both groups' dependencies; all other group-exclusive tracked paths
  were compared by Git blob against their pinned input heads. CI routing matches its pin.
- `real-run-execution.test.ts` now expects A's additional capture/failure metadata.
  C's independent oracle rejects incomplete evidence too; B's execution-level rejection
  remains mandatory even when injected measurement would incorrectly claim success.

`real-integration.test.ts` exercises the actual runner, workspace preparation, measurement,
artifact verification, analysis and replay with synthetic captured output and an explicitly
injected passthrough filter. It proves cross-group wiring, not native Go execution or model
quality. POSIX uses the actual snapshot helper; Windows asserts its named unsupported path.
Complete marked nonzero execution is admitted; guardian-loss capture fails after archival.
Workspace provenance and source bytes survive; policy stays bound across result/replay.

Focused verification selected only integration/runner/integrity/reanalysis/replay/raw-host
stream tests. Removing workspace provenance from `capture.json` made the new integration
control fail; restoring it passed. Initial integration exposed one stale B test expectation
that incomplete evidence was accepted: C deliberately rejects it, so the assertion now
checks that named rejection while retaining B's separate caller guard. Typecheck and structure
checks passed locally. The existing full platform matrix, smoke and pack belong to final PR CI.

## Evidence limits

Historical corpus captures and failed reports remain immutable. The recorded native savings
remain 471 bytes out of 1,272,795 primary input bytes (0.037005%); integration is not new
performance evidence. The old release asset URL became inaccessible when the old account
was blocked. Original bundle SHA-256:
`ce98ba7e6f0a6f26d67c861184e93f3ed53a22072f4b0419697a0d7d0c5017b7`.

Recovering those exact bytes is still required for a new retained-corpus verification pass.
No missing capture was reconstructed, rerun, retimed or claimed verified here. Historical
timing/load limitations still apply. Package/release links targeting the old owner require a
separate migration follow-up; a new Git repository alone does not recreate release assets.
