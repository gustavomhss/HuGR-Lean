# C05 bounded cargo-doc verification receipt

Base: `07ffe15e2263c2925778022194c5385807216603`; branch `campaign/native-v2/C05`;
PR https://github.com/gustavomhss/HuGR-Lean/pull/92 targets campaign/native-integration.
Lead approved bounded grammar and exclusive src/profiles/cargo-doc.ts,
tests/profile-cargo-doc.test.ts, fixtures/profiles/cargo-doc/** ownership.

Public filter is exercised with custom `familyProfiles`; no default registry or installed-route claim.
Empty familyProfiles baseline: named `C05 default independent native golden positive` failed,
actual passthrough versus expected reduced. The same independent literal golden passed after implementation.
First compiling implementation checkpoint `c5d5508` was pushed after owned positive and typecheck.

Native witnesses: 15 completed original commands, pinned versions/source/recipes in SOURCES.md.
Every raw SHA, byte length, recipe hash, explicit case ID, literal expected proposal and artifact count
is inspected by the owned suite. An in-memory appended-byte corruption differs from each pinned SHA.
Measured corpus economy: 11,215 UTF-8 input bytes, 8,554 output bytes; 2,661 removed (23.73%),
including zero savings for cache, opaque log, failed syntax and filename-collision cases.
No runtime/benchmark or universal reduction claim. Source spans are JavaScript UTF-16 offsets;
astral project-path and source-snippet test checks independent expected text and UTF-8 byte metrics.

Destructive probes, applied separately to owned production file only:

| Mutation | Focused test | Observed result |
| --- | --- | --- |
| Delete requested-target consistency guard | C05 artifact path target/profile and generated counters guard | red: reduced instead of passthrough |
| Delete warning-summary/frame count equality | C05 diagnostic frames source context and warning counters guard | red: reduced instead of passthrough |
| Drop all post-diagnostic progress from both pieces and required spans | C05 three-warning independent public custom-filter golden | red: literal golden missing beta/gamma Documenting rows |

All three mutations restored via apply_patch. Full owned test file and npm run typecheck rerun afterward.
No core, registry, shared helper, global docs, CI or existing Cargo corpus edits. No full repository
tests/build/check/smoke/benchmark or CI dispatch. Shared integration and cold lead review remain pending.
Checking remains exact, not positive support; unobserved warning formats/profile optimization/minute
timings/flags and unsafe producer collisions remain exact. Stop for lead review; never merge.
