# G05 native module cases

All IDs below have prefix `G05/`, native input `<id>.txt`, and exact argv,
source snapshots, boundary and raw hash in `cases.json`. Original 16 captures
remain passthrough; only the three default-get captures below admit deletion.
Test: `tests/profile-go-mod.test.ts`, explicit `familyProfiles` injection.

| ID | Native variant / required evidence | Prospective material policy |
| --- | --- | --- |
| download-cold | Fresh public cache; silent success; go.sum creation | Exact; no output to remove |
| download-cached | Same cache; silent success; unchanged files | Exact; no output to remove |
| download-json-cached | Requested JSON; package/version/paths/checksums/origin | Retain all requested data |
| download-x-cold | Requested HTTP/checksum diagnostics, statuses and timings | Retain all requested diagnostics |
| download-v-unsupported | Native exit 2; flag error, usage, help advice | Exact failure |
| tidy-v-cold | Cold downloading plus requested unused-module name; mod/sum changes | Exact; requested -v never reduced |
| tidy-v-cached | Silent tidy after previous native changes | Exact; no output to remove |
| tidy-v-progress-only | Cold downloading only; go.sum creation | Exact; no invented replacement summary |
| get-v-public-cold | Cold download plus added package/version; mod/sum changes | Exact; requested -v never reduced |
| get-v-upgrade | Local replacement; v1.0.0 => v1.1.0, native mod change | Retain full upgrade evidence |
| get-v-cached | Same requested local version; silent and unchanged | Exact; no output to remove |
| tidy-v-missing-package | Offline replacement lacks package; imports/context/version | Exact failure |
| get-v-missing-package | Offline replacement lacks requested package; version | Exact failure |
| get-v-missing-module | Absent module, offline lookup diagnostic | Exact failure; not registry-404 coverage |
| download-offline-failure | Cold offline public module; native diagnostic | Exact failure |
| tidy-v-offline-failure | Downloading prefix followed by import/lookup failure | Exact failure, including progress prefix |
| get-default-added | Default get; pinned local proxy public module addition | Delete paired download; retain added row; 42 bytes removed |
| get-default-upgraded | Default get; authored proxy module version upgrade | Delete paired download; retain upgraded row; 43 bytes removed |
| get-default-multiple | Default get; two authored proxy modules, two final added rows | Delete both uniquely paired downloads; 88 bytes removed |

Lead-approved policy: only native default `go get` downloading rows whose exact
module/version has a unique later retained added/upgraded row in the same complete
successful stream may be deleted. Entire stream must contain only known module
downloading/added/upgraded rows; duplicate downloads/changes, unmatched versions,
unknown module/version forms, advice and toolchain changes refuse reduction.
Required source spans retain every change row in original order including final LF.
Requested -v/-x/-json data and all mod commands remain exact. No progress-only empty
result, no summary invention, no command rewrite. Explicit @ selectors remain
outside the shared tokenizer and therefore exact.

Three `.expected.txt` files were independently transcribed from native final
change rows, not computed by the parser. Initial empty profile produced baseline
red at `G05/get-default-added`. Local baseline/source ref for added captures:
`bc5e12fc78aa190a9ec9863ca41cd96e4e3a0ea0`.

Checks: focused named test plus npm run typecheck. Existing disposable capture
integrity checks compare raw bytes/hash, sequential snapshots, source invariance,
and native on-disk state; in-memory output/source mutations were rejected.
Parser pairing-guard and required-change deletion mutations must fail focused tests,
then restore and rerun. Registry integration remains lead-owned.
