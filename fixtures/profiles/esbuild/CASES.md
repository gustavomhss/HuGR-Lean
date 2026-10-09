# B03 esbuild — capture only

Baseline `07ffe15e2263c2925778022194c5385807216603`; public native CLI `0.25.11`.
All cases are CAPTURED, not implementation acceptance or public-filter runtime proof.
Expected disposition is passthrough; exact golden is the independently captured raw
output, authenticated by SHA-256 in SOURCES.md and capture-receipt.json. No filter
was called to derive metadata or goldens. Lead must verify routing independently.

| Case ID | Native combination / required evidence | Exact-only reason | Removable bytes / acceptance name |
| --- | --- | --- | --- |
| B03-file-bundle | Source path, bundle, CSS, SVG file-loader assets, every size, 27ms clock | Not implemented; complete known-format whitespace may be considered only after review | 0 approved / deferred |
| B03-multiple-assets-splitting | Two entries, dynamic import, ESM splitting, shared chunk, CSS/SVG, four source maps, nine sizes, 12ms | Not implemented; preserve every artifact association | 0 approved / deferred |
| B03-warning-full-context | duplicate-object-key and equals-nan codes, both key positions/snippets, NaN advice, warning count, asset size, 10ms | Not implemented; all diagnostic/context/summary evidence required | 0 approved / deferred |
| B03-failure-full-context | Exit 1, missing import path, exact source path/position/snippet/caret, error count | Failed command must remain exact | 0 / deferred preservation |
| B03-stdout-bundle | Entire generated JavaScript, source comment, escaped Unicode, final LF | Bundle content is opaque required material; byte-exact | 0 / deferred preservation |
| B03-silent-file | Empty output, real generated file independently measured as 85 UTF-8 bytes | No output material; silent success gives no reduction profit | 0 / deferred preservation |

Native CLI has no JS plugin interface. API-worker custom plugin output cannot be
claimed as native executable evidence; no wrapper or plugin collision fabricated.
Generated bundles are not executed. Their apparent native-looking source comments
remain content, not detachable boilerplate. Raw strings are inline, so no-LF EOF
can be represented without synthesis; these nonempty native outputs ended in LF.
Only whole known formatting could later shrink; no material reduction established.

Capture verification: one local integrity check compares all raw hashes/UTF-8 sizes,
receipt identities/exits and asset hashes/sizes against actual temporary files.
One in-memory dropped-warning-code negative control failed at B03-warning-full-context;
original then passed. No fixture mutation persisted. No repository tests, typecheck,
build, smoke, benchmark or CI dispatched.
