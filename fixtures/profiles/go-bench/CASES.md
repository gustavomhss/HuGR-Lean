# G03 CAPTUREONLY

Status: CAPTURED, parser policy pending. Fixture-local flat `cases.json` uses
`hugr-lean/native-cases/1`. All outputs have original raw SHA-256 and independent
literal exact goldens. Source/recipe: SOURCES.md and source/. Reproduce each original
argv in source/ with Go 1.27.1; run cache-first then cache-repeat consecutively.
Benchmark bounds are 1x or 100x; do not replace them with timed long runs.

| Case ID | Variant / native input | Golden / evidence | Public disposition | Removable bytes | Test name |
| --- | --- | --- | --- | --- | --- |
| G03-benchmem | benchmem.txt; 100x, custom units, throughput | cases.json expectedOutput; every metric/header/time | exact: no progress to remove | 0 | pending lead corpus binding |
| G03-all-packages | all-packages.txt; ./..., nested, no-test package, log collision | cases.json expectedOutput; package scopes and BENCH log block | exact: ambiguous user output | 0 | pending lead corpus binding |
| G03-nested-skip | nested-skip.txt; verbose nested and skipped benchmark | cases.json expectedOutput; skip reason, source location and metric | exact: policy not implemented | 0 accepted; 38 proposed | pending lead corpus binding |
| G03-logs | logs.txt; fmt-native-shaped rows, headers and PASS | cases.json expectedOutput; all forged lines and genuine metric | exact: ambiguous user output | 0 | pending lead corpus binding |
| G03-cover | cover.txt; benchmem plus coverage | cases.json expectedOutput; 100.0% coverage, metrics and time | exact: no progress to remove | 0 | pending lead corpus binding |
| G03-race | race.txt; tiny race-instrumented benchmem | cases.json expectedOutput; original race argv and metrics | exact: no progress to remove | 0 | pending lead corpus binding |
| G03-cache-first | cache-first.txt; absent benchmark selector, package list | cases.json expectedOutput; summaries, no-test package, time | exact: no progress to remove | 0 | pending lead corpus binding |
| G03-cache-repeat | cache-repeat.txt; identical warm repeat | cases.json expectedOutput; new timings, no cached annotation | exact: no progress to remove | 0 | pending lead corpus binding |

Mandatory retention: complete names (including child path and CPU suffix), iterations,
ns/op, MB/s, widgets/op, B/op, allocs/op, OS/architecture/CPU, package headers and
associations, PASS/package summaries and seconds, coverage, skip source/reason,
BENCH source locations and logs. `fmt.Println` rows that look native remain logs;
never classify or delete them because of their spelling. No timestamped log was
emitted; the actual source locations and summary times remain exact.

Only proposed reduction: the two bare nested progress lines `BenchmarkNested\n`
and `BenchmarkNested/child\n` in G03-nested-skip, 38 UTF-8 bytes total. Metric row
already carries the complete child name. This is a bounded source-observed candidate,
not an admitted grammar: arbitrary application output can imitate those lines.
Keep skip progress/marker/reason, all metric lines, all system/package lines and logs.
Full-parser collision policy remains lead work. Current accepted savings: zero;
no meaningful benchmark-output reduction demonstrated. Exact-only dispositions do
not complete mandatory reduction scope without lead/human review.

Cache observation: `-bench` repeats did not emit `(cached)`; second capture has
independent timings. Existing text-test cached corpus belongs to G01; do not
manufacture cached benchmark output. JSON+bench remains exclusively G02-owned.
Frozen goMode routes every recorded test argv to bench; original literal selectors
remain unchanged. No profile/core/registry changes or reduction tests added.
Repository checks limited to npm ci and npm run typecheck per capture-only brief;
preservation/admission mutation probes await parser implementation.
