# P02 pnpm install: capture packet

State: REVIEW after lead approval. pnpm 10.18.3 / Node v22.17.1.
Admission requires original direct `pnpm install` with both `--ignore-scripts`
and `--ignore-pnpmfile`. Earlier Node-launcher cases are negative witnesses;
their command metadata now matches actual argv, and raw files remain unchanged.
Native input: `<case>.txt`; stable ID: `P02/<case>`. Exact bytes/hash/argv/exit in
`cases.json`. Direct safe expected files are independently transcribed retained
source lines. Tests use only injected `familyProfiles`; shared registry is lead-owned.

| New direct case | Disposition / source evidence |
| --- | --- |
| safe-cold | reduced; remove L1,L4 only; retain package/version/completion |
| safe-cache | reduced; remove L1,L4 only; retain reused-store result evidence |
| safe-offline | reduced; remove L1,L4 only; original offline flag |
| safe-frozen | exact, no progress to remove |
| safe-frozen-fresh | reduced; fresh project with native cold lock/store, frozen/offline; remove L2,L5 only; retain lock/versions/completion |
| safe-workspace | reduced; remove L2,L5 only; retain scope/member path/version |
| safe-workspace-frozen | exact, no progress to remove |
| safe-peer | reduced; remove L1,L4 only; retain warning/tree/range/found version |
| safe-deprecated | reduced; remove L1,L5 only; retain deprecation plus peer warning |
| hook-enabled | exact; original argv lacks ignore-pnpmfile, real hook emits progress/log collisions |

Earlier table documents historical byte candidates only. All earlier indexed
commands remain exact negative launcher/producer-safety witnesses.

## Mandatory variants and crossing combinations

| Case | Required variant | Candidate removable UTF-8 bytes | Required source evidence |
| --- | --- | ---: | --- |
| local-install | tiny file dependency, scripts disabled | 114 (L1,L4) | L2-3 package count/art; L5-18 update notice, package/version, completion |
| local-cached | same project/store repeat | 114 (L2,L5) | L1 lockfile message; L3-4 count/art; L6-7 completion |
| local-frozen | frozen + offline + scripts disabled | 114 (L2,L5) | lockfile message, package count/art, completion |
| frozen-mismatch | frozen + offline + changed manifest | 0 | Entire failure, added chalk version, repair advice |
| frozen-missing | frozen + offline + missing lockfile | 0 | Entire failure and help |
| workspace-peer | all three workspace projects, workspace links | 0 | Scope, linked package versions/paths, completion; this linked peer does not emit warning |
| workspace-frozen | workspace + frozen + offline | 0 | Scope, lockfile/up-to-date messages, completion |
| peer-warning | original file packages, unmet peer, scripts disabled/offline | 114 (L1,L4) | L2-3 count/art; L5-8 warning/tree/range/found version; L9-14 versions/completion |
| peer-strict | same conflict, fresh project, strict peers | 0 | Entire exit-1 failure, warning tree, YAML help; progress stays |
| deprecated-local | original deprecated file package, offline/scripts disabled | 114 (L2,L5) | L1 exact warning; L3-4 count/art; L6-10 version/deprecation/completion |
| lifecycle-enabled | root postinstall enabled, offline, native-looking collisions | 0 | Entire transcript incl. script header, progress/count/summary lookalikes and opaque Unicode log |
| lifecycle-disabled | same project, original `--ignore-scripts` safety flag | 0 | Up-to-date and completion; paired source establishes logs were script-produced |
| chalk-cold | public chalk 4.1.2, fresh project/fresh store | 114 (L1,L4) | L2-3 count/art; L5-9 installed/latest versions and completion; native downloaded=6 |
| chalk-warm | public chalk 4.1.2, fresh project/reused store | 114 (L1,L4) | Same evidence; native reused=6/downloaded=0 |
| chalk-offline | fresh project, cached resolution/tarballs, offline | 114 (L1,L4) | Same evidence; native reused=6/downloaded=0 |
| chalk-offline-miss | fresh project/empty store/offline | 0 | Entire failure incl. progress, registry URL/package context and help |
| chalk-frozen | existing chalk project/lock/store, frozen/offline | 0 | Lockfile/up-to-date/completion lines; no removable progress |

`P02/install-help` indexes `install-help.txt` as exact-only native help with original
Node argv, observed exit and hash from capture.py/SOURCES.md. Preserve all 238 lines.
No npm captures included.

## Approved grammar and limits

Observed non-TTY pipe progress line, including LF:
`Progress: resolved R, reused U, downloaded D, added A` optionally `, done`.
Only ASCII decimal counters and exact labels/order/punctuation are supported
grammar; native captures exercise counters 0..6. Parser validates
entire supported transcript, finite argv, integer bounds/counter consistency,
terminal progress/completion, and exit 0 before admitting any deletion. Native
goldens delete only both progress lines: 114 bytes per eligible
transcript. Package artwork/counts, installed/latest versions, summaries, timings,
lock/workspace association, warnings/help and all logs remain exact source spans.

Direct safe chalk cold/cache/offline: 219 -> 105 bytes (52.1%) by scoped filter.
Unknown/new lines, unsupported argv, incomplete boundary, failures or inconsistency
require original. Enabled scripts cannot be admitted from grammar alone: root
postinstall and pnpmfile hooks emit exact native-looking lines without prefixes.
Both original disabling flags are mandatory; scripts-only commands stay exact.
No PTY/watch/CR rendering inference.

Closed argv: direct `pnpm install`; both required bare disabling flags exactly
once; optional bare `--offline`/`--frozen-lockfile`, and one `--store-dir PATH`.
No aliases, wrappers, selectors, argv packages, reporter/config flags, `=false`,
duplicate flags or extra operands. Store path is generic, not fixture-specific.
Complete exited shell output with presentation `unknown` only. LF rows required;
controls/CR/formatting characters and incomplete final LF refuse. Bounds:
1,048,576 UTF-16 code units, 10,000 rows/packages, counters <=1,000,000; UTF-8 economy.
Progress counters are monotone; reused+downloaded <= resolved, added <= their sum;
no added work before package count/art. Exactly one terminal `, done` after
count/art, final added=count and resolved=reused+downloaded. Entire finish phase
validates: optional captured one-parent/one-child peer tree with matching retained
package versions; optional dependencies section, generic scoped names/semver/paths;
exact pnpm v10.18.3 completion at final row. Native deprecation rows keep full
message and matching installed identity. More peer contexts, summary sections,
update notices/advice or new formats refuse whole output rather than lose evidence.
All nonprogress rows, including blanks and warning trees, are required UTF-16
source spans; no whitespace deduplication or generated dynamic text.

Frozen fresh: 249 -> 135 bytes (45.8%); workspace: 289 -> 175 (39.4%);
peer warning: 352 -> 238 (32.4%); deprecation+peer: 445 -> 331 (25.6%).
These scoped-filter results include every required source token.

## Checks and next gate

Capture integrity: JSON parse, unique IDs, raw SHA-256 match, complete process exit,
native download/reuse/peer/deprecation controls, script-enabled/disabled pairing.
Changing bytes in memory makes hash comparison fail; originals never mutated.
Typecheck instrument exercised with intentional external TypeScript error, then
repository `npm run typecheck`. Empty-profile baseline failed six initial native
golden assertions; later fresh-frozen baseline independently went red.
`node --import tsx --test tests/profile-pnpm-install.test.ts`: 14 scoped tests.
Mutation probes in owned parser, each targeted named test failed:

- Drop WARN rows from retained spans -> warning-context golden mismatch.
- Omit final required span from pieces -> cold golden `failed_open`, not reduced.
- Remove final-row exhaustion check -> malformed/unknown admission test reduced.
- Remove ignore-pnpmfile requirement -> producer-safety negative test reduced.

All probes restored to compiling checkpoint parser; scoped suite 14/14 and
typecheck pass after restoration. Owned parser diff against checkpoint is empty.
Native index tests verify original argv equals command tokens, raw SHA-256,
changed-byte positive control, unique IDs, dispositions and golden correspondence.
Manifest walk covers every native text input/golden; deleting help entry in memory
makes correspondence fail. Original help bytes and approved parser remain unchanged.
Lead review required before registry integration or merge.
