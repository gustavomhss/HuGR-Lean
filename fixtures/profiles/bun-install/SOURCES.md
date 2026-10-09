# P04 original native capture provenance

State: **CAPTURED ONLY**, not implementation/completeness acceptance.
Assigned worktree: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-native-v2-P04`.
Branch: `campaign/native-v2/P04`; baseline `07ffe15e2263c2925778022194c5385807216603`.
Lead plan read from absolute integration worktree
`/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-native-integration/docs/NATIVE-COVERAGE-CAMPAIGN.md`.
Capture date: 2026-10-09. Platform: macOS 15.3.2, darwin x86_64.

## Installed tool pin and boundary

- Installed executable resolved by `command -v bun`:
  `/Users/gustavoschneiter/.bun/bin/bun`.
- Actual version command `bun --version` returned `1.3.14\n`, exit 0.
  Capture helper independently checks exact version before each install.
- Executable SHA-256:
  `ea2f223e94bb2f4bf3050895113c3cf346438f6fa0501c8532284e063f72f7a0`.
  Native header additionally reports revision `0d9b296a`.
- Existing installed executable used; no bootstrap, global install, private registry
  or copied tool/package source. Original tiny project sources/collector are repo MIT.
- Disposable root `R`:
  `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/p04-bun-native`.
- Every actual original argv/command, cwd, version, platform, exit, boundary and raw
  SHA-256 is case-local in `cases.json`; commands remain bare `bun install ...`.
  No Node launcher alias, fabricated version field or post-capture command rewrite.
- `capture.py` runs subprocess with merged stdout/stderr OS pipe, consumes through
  EOF, observes actual exit, 60-second deadline, no PTY. All indexed cases exited.
  `completeness: complete`; `presentation: unknown`. No terminal-rendering claim.
- Inherited environment except removed CI/FORCE_COLOR/NO_COLOR/NODE_OPTIONS/BUN_OPTIONS;
  isolated `HOME=R/home`, `XDG_CONFIG_HOME=R/home/config`; native default reporter.
  Each project has explicit relative cache directory in original argv; registry
  cases explicitly select `https://registry.npmjs.org`.
- All outputs are inline JSON strings with SHA-256 over decoded UTF-8 bytes.
  JSON transport adds no LF to decoded output, including any no-LF EOF. This capture
  happened to end each output with LF; no synthetic native no-LF case claimed.
  Bytes preserved without edits, trimming, substitutions, ANSI normalization or dedup.

## Local source and sequence

`projects.json` records original manifest objects, exact JS strings and final
confirmed edits. Sources created with apply_patch; disposable node_modules/cache
never staged. Initial local dependency version 1.2.3; workspace versions 2.3.4/3.4.5.
Registry manifest pins chalk 4.1.2. Generated unmodified `chalk.lock` pins chalk
4.1.2, ansi-styles 4.3.0, color-convert 2.0.1, color-name 1.1.4, has-flag 4.0.0,
supports-color 7.2.0 with registry integrities. These packages declare MIT licenses;
only generated lock metadata retained, no donor implementation or fixture copied.

Capture order is `cases.json` order, except independent local/workspace/chalk/script
project batches ran concurrently. Within each project, installs are sequential.
Native first installs create locks/cache; repeat and frozen calls reuse them.
Warm chalk project starts fresh with same manifest and shared chalk cache.
Empty-cache chalk project starts fresh with its own cache.
Missing-lock projects start fresh; native frozen installs exit 0 without saving
locks. This is observed behavior, not proof that missing locks always succeed.

Three first edit attempts omitted patch hunk marker and did not alter manifests.
Follow-up reads confirmed original local/chalk/blocked manifest bytes still applied.
`frozen-mismatch`, `chalk-frozen-mismatch`, `trusted-dependency-enabled` retain
their original capture IDs/output but are **ineffective attempts**, not evidence
of intended mismatch/trust coverage. Corrected edits added hunk markers.
Before `chalk-frozen-mismatch-confirmed`, read confirmed chalk manifest 4.1.1;
existing 4.1.2 lock remained unchanged. Native exit 1 error/advice captured intact.
Before `trusted-dependency-confirmed`, trustedDependencies added for p04-script-dep;
native install saved lock but did not emit dependency script logs. No such claim.
Root `lifecycle-enabled` did emit native-shaped progress/package/summary/version
and Unicode warning logs. Same root with original `--ignore-scripts` suppresses them.
Enabled transcripts have no authenticated intra-output producer boundary and stay exact.

## Flag limits and independent proposal

Captured installed help advertises frozen-lockfile/cache-dir/ignore-scripts and
backend choices. It does not advertise offline. Actual --offline invocations
are retained, including fresh empty-cache success reporting resolve/download/extract.
No network-isolation oracle used: **enforced offline behavior unproven**, flag
must not be silently admitted by future grammar. No build-backend producer safety
claim from native-looking output; require original flags and full safety review.

`proposals.json` is independent literal transcription, never obtained from SUT.
Only `chalk-cold` proposes deleting its two known resolve-progress rows: 176 -> 113
UTF-8 bytes, potential 63 bytes. Header/version, saved-lock event, package/version
update advice, timing and summary count remain exact. No grammar implementation,
public-filter measurement or reduction acceptance. All other outputs required intact.
Future tests must refuse enabled scripts, failures, unknown/unsupported variants,
incomplete boundaries and inconsistent summaries. Case ledger: `CASES.md`.

## Hashes and one capture check

| Local artifact | SHA-256 |
| --- | --- |
| capture.py | `3c692223b20c6711c4f9f7319d9e5d94923ac229a133e43958d979ab5808579d` |
| cases.json | `eb6d9db2c831076f41f777086e5801208586772343cd3b50bb4cfbcb977fc797` |
| projects.json | `5c40db2d5d580ad807902386b7529e61278e3990a2ee197625d46387a276139f` |
| chalk.lock | `de8f22f1c293b2714f0c3a0b30fa8d29d397265bf0147e0710e8dfff658e11a6` |
| literal proposed output | `2434915e3022f82160d1832775bc39a0a4bfa7fab7bf66d194b6168d0391060b` |

Fixture lock hash equals actual disposable chalk/bun.lock hash after frozen failure.
Raw output hashes are stored individually in cases.json, not inferred from JSON hash.
One check run: `python3 fixtures/profiles/bun-install/verify-capture.py`.
Observed: all 24 raw hashes matched; one changed-byte in-memory corruption rejected;
original checked intact afterward. No fixture mutation persisted. Proposal byte
counts/hash printed from independent literal. No TS changes, repo tests, typecheck,
build, check, smoke, benchmark or CI executed under capture-only policy.

Replay individual captures after materializing original sources under R:
`python3 fixtures/profiles/bun-install/capture.py <suffix> <project> -- <original flags>`.
Native lock/cache state and confirmed edits must follow sequence above. Timings and
registry update advice can change; replay is not promised byte-identical. Stop at
capture PR for lead review; parser/safe grammar/offline policy remain later work.
