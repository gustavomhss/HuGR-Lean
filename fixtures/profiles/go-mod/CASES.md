# G05 capture-only cases

All IDs below have prefix `G05/`, native input `<id>.txt`, and exact argv,
source snapshots, boundary and raw hash in `cases.json`. All currently declare
passthrough. Independent goldens and parser tests are prospective, not executed.

| ID | Native variant / required evidence | Prospective material policy |
| --- | --- | --- |
| download-cold | Fresh public cache; silent success; go.sum creation | Exact; no output to remove |
| download-cached | Same cache; silent success; unchanged files | Exact; no output to remove |
| download-json-cached | Requested JSON; package/version/paths/checksums/origin | Retain all requested data |
| download-x-cold | Requested HTTP/checksum diagnostics, statuses and timings | Retain all requested diagnostics |
| download-v-unsupported | Native exit 2; flag error, usage, help advice | Exact failure |
| tidy-v-cold | Cold downloading plus requested unused-module name; mod/sum changes | Only downloading line potentially removable |
| tidy-v-cached | Silent tidy after previous native changes | Exact; no output to remove |
| tidy-v-progress-only | Cold downloading only; go.sum creation | Exact; no invented replacement summary |
| get-v-public-cold | Cold download plus added package/version; mod/sum changes | Only downloading line potentially removable |
| get-v-upgrade | Local replacement; v1.0.0 => v1.1.0, native mod change | Retain full upgrade evidence |
| get-v-cached | Same requested local version; silent and unchanged | Exact; no output to remove |
| tidy-v-missing-package | Offline replacement lacks package; imports/context/version | Exact failure |
| get-v-missing-package | Offline replacement lacks requested package; version | Exact failure |
| get-v-missing-module | Absent module, offline lookup diagnostic | Exact failure; not registry-404 coverage |
| download-offline-failure | Cold offline public module; native diagnostic | Exact failure |
| tidy-v-offline-failure | Downloading prefix followed by import/lookup failure | Exact failure, including progress prefix |

Potential removal in each mixed successful case is exactly the 42 UTF-8 bytes
of `go: downloading golang.org/x/text v0.29.0\n`. This is not an admitted grammar
or reduction result. Removal requires complete finite grammar, supported argv,
known original module-command boundary, remaining source-backed required evidence,
and independent lead goldens/tests. Requested -v unused-module evidence,
package/version changes, requested -x/-json data, diagnostic/advice text, and all
nonzero outputs remain intact. Never replace progress-only output with a made-up
success summary. Unknown/incomplete/ambiguous output remains exact.

Checks: npm ci and npm run typecheck; disposable capture-integrity checks compare
raw bytes/hash, sequential snapshots, source invariance, and final on-disk state.
In-memory mutations deleting output or changing source must fail those checks.
No production preservation test exists in this capture-only packet.
