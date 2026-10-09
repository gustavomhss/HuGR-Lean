# B01 original capture provenance

Owner: campaign/native-v2/B01; baseline 07ffe15e2263c2925778022194c5385807216603.
Original tiny project and plugin authored for this packet; repository MIT license
applies. No donor source or fixture copied. `project/` records exact authored
HTML/modules/configs. Its package.json records the isolated prefix dependency;
capture installed dependencies one directory above the source project.

Public producer: Vite 6.3.5, MIT, https://github.com/vitejs/vite, npm tarball
https://registry.npmjs.org/vite/-/vite-6.3.5.tgz . Metadata query:
`npm view vite@6.3.5 version gitHead license dist --json --registry=https://registry.npmjs.org`.
Registry returned no gitHead. No invented upstream commit/source-authentication claim.
Tarball SHA-1: fec73879013c9c0128c8d284504c6d19410d12a3.
Integrity: sha512-cZn6NDFE7wdTpINgs++ZJ4N49W2vRp8LCKrn3Ob1kYNtOo21vfDoaV5GzBfLU4MovSAB8uNRm4jgzVQZ+mBzPQ==.
Only Vite version pinned; transitive dependencies are the public npm resolution,
not a hermetic reproduction claim. No donor material copied or modified.

## Actual acquisition boundary

Disposable prefix: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/b01-vite-native`.
Install: `npm install --registry=https://registry.npmjs.org --ignore-scripts --no-audit --no-fund --save-exact vite@6.3.5`.
Actual cwd resolved to `/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/b01-vite-native/project`.
PATH prepended prefix/node_modules/.bin; NO_COLOR=1; FORCE_COLOR removed.
Python subprocess.run invoked each manifest argv directly with executable `vite`.
Resolved executable: `/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/b01-vite-native/node_modules/.bin/vite`.
No `node <cli>` command relabeled. Vite's own shebang executes Node.
stdout PIPE, stderr STDOUT at spawn: one OS-level merged stream, byte-unmodified,
not separately concatenated streams. Waited for exit and EOF; 30-second timeout
per build; no output truncation limit. All captured exits 0, complete, presentation
unknown. This authenticates invocation/completion, not individual output producers.
Platform darwin-x64, Node v22.17.1. `vite --version` returned
`vite/6.3.5 darwin-x64 node-v22.17.1` (native final LF retained only in that probe,
not a separate corpus case). Build start/end timestamps are recorded per case.

## Local raw-byte receipt

SHA-256 over UTF-8 decoded full `output` strings, including native terminal LF:

| Case | Bytes | SHA-256 |
| --- | ---: | --- |
| B01-fresh | 434 | d638bba210dca9da9c52f099c04b9ef9a61e01c789ae4a0149f6ddc136473cf8 |
| B01-repeat | 434 | 858d8e3959725541f07b7b46331ed0fb08489c1c81c43f5ac3776f02cabdd367 |
| B01-outdir | 474 | 111c3e0abe0103f19f602b9da2d78019dd213684a76cd8a070ccb2de72acf195 |
| B01-warnings | 1151 | 814b0ad1daff43fde51215d2c7cb9caca6819730e71e426c3d0cfedd9131bbc1 |
| B01-plugin-collision | 599 | 65a693ef28479e92adf56059e801e0c6ec1c8041f32c20d9f93746cfc9c64595 |

Evidence scope is raw-output-only. The historical claim that fresh/repeat/custom-outDir
shared identical artifact content hashes is withdrawn: per-build artifact hashes and
the original artifact receipt are not retained in this pinned fixture snapshot.
Recorded sizes remain SVG 92 bytes, CSS 36, lazy JS 48, entry JS 2095,
HTML 243. Warning build additionally recorded two map sizes (97 and 639 bytes).
Artifact paths remain verbatim in each case's raw output, including custom outDir
`release/site`; these recorded paths/sizes do not prove historical artifact bytes.
The fake plugin-evidence.js row was emitted by console.log, not an artifact.
Native printed kB metrics are rounded; recorded file sizes are separate historical
observations, not retained artifact-byte authentication.

## Reproduce narrowly

Create fresh isolated prefix, install pinned public Vite as above, place project
sources in prefix/project, then invoke listed native commands in manifest order
with the same PATH/color/capture boundary. Do not reuse an existing dist for the
fresh case. Later variants reuse this tiny project; each command runs once.
Repeat is a warm existing-output run: no native cache marker was observed.
Warning config injects eval into lazy.js without a transform sourcemap and lowers
warning threshold to 1 kB; this generates native Rollup/Vite diagnostics without
large input. Collision config really prints native-shaped stdout from buildStart.
Paths, artifact bytes and native timings may differ on replay; preserve new raw
evidence rather than normalize it into this receipt.

## Verification boundary

Disposable integrity check validates declared case names, full-string UTF-8
byte lengths and SHA-256, source copies, and independent conditional goldens.
Appended-LF corruption control failed against the same raw-integrity predicate;
original strings rechecked. Control is in memory; raw fixtures remain intact.
Initial conditional byte estimates of 57 and 58 failed the verifier; corrected to
59 (16 + 20 + 23 native UTF-8 bytes, including each LF).
No repository tests/typecheck/build/smoke/benchmark/CI or public filter execution.
Checks authenticate transcription only, not safety of deleting native-shaped text.
