# P03 — Yarn capture-only packet

Baseline `07ffe15e2263c2925778022194c5385807216603`; branch `campaign/native-v2/P03`.
All `cases.json` observations have `status: passthrough`: exact raw output is the expected
evidence. No parser, public-filter test, native index promotion or reduction is claimed.
`capture-attempts.json` preserves failed setup attempts separately, including original argv,
exit, environment, raw output and SHA. Both files use flat `hugr-lean/native-cases/1`.

## Case map

Names below are prefixed `P03/`; `{classic,berry}` means both concrete names exist.
Raw input is `<name>.txt` (or inline `output` when EOF lacks LF), bound by `provenance.sha256`.
Required evidence is the entire capture; removable bytes currently zero; test name is N/A
(capture-only). The recipe's original command/argv and observed exits are authoritative.

| Case suffix | Variant and evidence | Disposition reason |
| --- | --- | --- |
| `{classic,berry}-fresh-peer` | Fresh local file dependency; version, progress, unmet peer, lock/save and time | NOT_IMPLEMENTED; Berry also unsafe plugins |
| `{classic,berry}-cached` | Same installed project/cache; Classic already-up-to-date; Berry full steps | NOT_IMPLEMENTED / unsafe |
| `{classic,berry}-offline` | Classic original `--offline`; Berry network disabled in recorded environment | NOT_IMPLEMENTED / unsafe; do not invent Berry `--offline` argv |
| `{classic,berry}-frozen` | Cached matching lock; Classic `--frozen-lockfile`; Berry `--immutable --immutable-cache` | NOT_IMPLEMENTED / unsafe |
| `{classic,berry}-frozen-mismatch` | Add chalk without changing lock; original frozen/immutable offline argv | Nonzero, exact; preserve error |
| `classic-frozen-missing` | Original frozen flag with no lock; **exit 0**, no invented rejection | NOT_IMPLEMENTED |
| `berry-frozen-missing` | Empty lock establishes independent project; immutable resolution refuses modification | Nonzero, exact; empty lock, not absent-lock claim |
| `{classic,berry}-workspace` | One tiny workspace child and local missing peer | NOT_IMPLEMENTED / unsafe; preserve package association and peer hash/advice |
| `{classic,berry}-workspace-frozen` | Same workspace with matching frozen/immutable lock and offline cache | NOT_IMPLEMENTED / unsafe |
| `{classic,berry}-lifecycle-collision` | Enabled authored root postinstall emits native-looking steps and summary | Unsafe, exact; raw Classic steps and Berry STDOUT-wrapped lines must survive |
| `{classic,berry}-lifecycle-disabled` | Same authored hook, original `--ignore-scripts` / `--mode=skip-build` | NOT_IMPLEMENTED / unsafe; Classic ignored-script warning retained |
| `{classic,berry}-chalk-fresh` | Public chalk 4.1.2 graph, cold fetch | NOT_IMPLEMENTED / unsafe; Berry packages-added and KiB metric retained |
| `{classic,berry}-chalk-offline-frozen` | Delete owned node_modules, retain lock/cache; offline frozen relink | NOT_IMPLEMENTED / unsafe; preserve time and all summaries |
| `berry-plugin-hook-skip-builds` | Despite legacy case suffix, actual mode is `--mode=skip-build`; plugin afterAllInstalled emits exact native-shaped steps | Unsafe, exact; original mode does not suppress arbitrary hooks |
| `classic-deprecated-flag` | Original `--dev` attempt; no deprecation warning emitted | Exact attempt; no deprecation support claim |
| `berry-deprecated-flag` | Original `--frozen-lockfile`; native YN0050 deprecation and replacement advice | Unsafe, exact; warning/code/advice retained |

## Progress hypothesis, not implementation

Classic alone could delete the four exact `[1/4] Resolving packages...`, `[2/4] Fetching
packages...`, `[3/4] Linking dependencies...`, `[4/4] Building fresh packages...` lines
after recognizing **the entire pinned grammar**, only for successful complete observations
whose original argv contains both `--ignore-scripts` and `--no-default-rc`. No substring
search, warnings removal, summary/time deletion, arbitrary log deduplication or failed-output
reduction. A future grammar must validate sequence, optional no-lock/save/up-to-date branches,
all warning layouts, version header, terminal boundary and final summary, refusing new lines.
This packet supplies examples, not proof of that grammar or authority to admit reductions.
Enabled lifecycle collision remains exact even when its repeated steps look removable.

Berry has **no deletion proposal**: skip-build does not disable plugins. Captured plugin
output duplicates ordinary step-open/close lines without a distinguishing producer boundary.
Preserve version, YN codes, package resolutions, peer details/hash/advice, deprecation advice,
fetch package/size counts, lock diffs, completed durations and final summary metrics.

## Recipe and boundaries

`python3 fixtures/profiles/yarn-install/capture.py` creates a fresh temp root and installs
only pinned public Yarn tools locally with npm `--ignore-scripts`. Bare `yarn` resolves
through that flavor's `node_modules/.bin` on PATH; no node alias or rewritten argv.
The script uses one shared stdout/stderr pipe, reads through EOF, observes process exit,
does not strip ANSI or alter LF, and records `presentation: unknown`, `completeness: complete`.
Timeout/setup failures stop the recipe rather than becoming successful observations.
Classic original flags select cache/public registry and disable rc; Berry has recorded
isolated cache and network settings. `CI=1` normally makes Berry immutable: fresh captures
record `YARN_ENABLE_IMMUTABLE_INSTALLS=0`, while original `--immutable` still enforces it.

Historical recovery: initial unsupported plural `skip-builds` and parent-project boundary
errors were preserved; corrected mode then exposed CI-default immutable failures, also
preserved. Resume `capture.py <capture-root>` archives prior Berry observations and captures
Berry again; `capture.py <capture-root> --extras` captures deprecation flag attempts only.
Saved `projects/` contains final tiny source manifests/configs/locks, not per-case snapshots;
recipe order describes initial dependency set and subsequent mismatch mutation.

## Limits / lead blockers

Dependency-deprecation **warning coverage remains unproven**: authored local manifests have
`deprecated`, but native file resolvers emitted no such warning. Berry flag deprecation is
real evidence, not a substitute for registry dependency-deprecation support. No additional
public package or private registry was introduced. Berry's no-LF lifecycle tail was not
emitted by its native inline reporter; preserve actual capture, do not reconstruct child text.
Offline success is evidenced; cold offline-cache-miss behavior and PTY presentation remain
outside this packet. Lead must decide grammar/scope before any implementation/promotion.

Focused integrity check: every native and archived raw SHA checked, deliberately corrupted
raw hash rejected, bytes restored and same check passed. No suite/typecheck/CI dispatched.
