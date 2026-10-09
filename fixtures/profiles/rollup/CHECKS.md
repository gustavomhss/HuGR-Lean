# B04 capture receipt

Completed native operations:

1. Read baseline PLAN, types and native campaign; confirmed branch/base/scope.
2. Queried real public npm metadata for exact Rollup 4.52.4 pin/SRI/gitHead/license.
3. Ran `capture.py`: isolated npm install, native version query, fourteen real
   CLI captures, merged EOF receipts, complete source snapshots, output/map hashes.
4. Inspected multi-output progress, warning/importer, circular chain and both real
   plugin collision captures. Native quiet output is empty; plugin quiet output
   is nonempty and has no final LF. This paired native control demonstrates that
   native-shaped plugin rows can survive native reporter suppression.

Native recipe asserts real version/pin and expected child exits; observed four
exit-1 cases preserve complete error bytes. Other captures exit zero. Assertions
are recipe sanity only, not production behavior or preservation test claims.

User prohibited fixture-only suites, typechecks, full checks, HuGR-Lean builds,
smoke, benchmarks and CI. None were invoked. No runtime/test/core/shared changes.
No mutation probe of a runtime preservation test exists in capture-only scope.
No parser was added, so no compiling TypeScript closure changed; this is a
fixture checkpoint after successful native capture, not a typecheck-green claim.

Independent review, corpus promotion and any runtime reduction remain lead work.
Stop after pushed checkpoint and PR targeting `campaign/native-integration`.
