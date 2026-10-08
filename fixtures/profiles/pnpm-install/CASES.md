# P02 pnpm install: capture packet

State: CAPTURED. pnpm 10.18.3 / Node v22.17.1. Every indexed case currently
`passthrough` (implementation pending lead approval), not an admitted reduction.
Native input: `<case>.txt`; stable ID: `P02/<case>`. Exact bytes/hash/argv/exit in
`cases.json`. No expectedFile yet: retained source lines below are independent
candidate evidence, not public-filter goldens. Future test names follow case IDs.

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

`install-help.txt` is auxiliary exact help, not an installer admission. Preserve all
238 lines; provenance in SOURCES.md. No npm captures included.

## Candidate grammar and limits for lead decision

Observed non-TTY pipe progress line, including LF:
`Progress: resolved R, reused U, downloaded D, added A` optionally `, done`.
Only ASCII decimal counters and exact labels/order/punctuation are candidate
grammar; captured positive examples bound counters to 0..6. A future parser must
validate entire supported transcript, finite argv, integer bounds/counter consistency,
terminal progress/completion, and exit 0 before admitting any deletion. Candidate
deletion here is only both known native progress lines: 114 bytes per eligible
transcript. Package artwork/counts, installed/latest versions, summaries, timings,
lock/workspace association, warnings/help and all logs remain exact source spans.

Chalk cold potential: 218 -> 104 bytes (52.3%); warm/offline: 219 -> 105 (52.1%).
These are byte subtraction from captured lines, not filter or benchmark results.
Unknown/new lines, unsupported argv, incomplete boundary, failures or inconsistency
require original. Enabled scripts cannot be admitted from grammar alone: root
postinstall emits exact native-looking lines without prefixes. Ignore-scripts is
only candidate safety constraint; pnpm hooks/config remain a separate identity
question for parser approval. No PTY/watch/CR rendering inference.

## Checks and next gate

Capture integrity: JSON parse, unique IDs, raw SHA-256 match, complete process exit,
native download/reuse/peer/deprecation controls, script-enabled/disabled pairing.
Changing bytes in memory makes hash comparison fail; originals never mutated.
Typecheck instrument exercised with intentional external TypeScript error, then
repository `npm run typecheck`. Parser admission/preservation mutation tests await
approved implementation. Lead must review packet and command/config constraints
before any parser/golden/test/registry work. Capture stop.
