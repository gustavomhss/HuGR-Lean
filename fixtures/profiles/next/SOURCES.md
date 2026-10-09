# B02 producer provenance and capture recipes

## Pins and copied material

| Producer | Version | Registry gitHead | License |
| --- | --- | --- | --- |
| Next | 15.5.9 | c5de33e93ccccaf3bee60cf50603e2152f9886e1 | MIT |
| React / React DOM | 19.1.0 | 1825990c5608f0ab0c1475b4292218a508a171c9 | MIT |
| TypeScript | 5.9.3 | c63de15a992d37f0d6cec03ac7631872838602cb | Apache-2.0 |
| @types/react | 19.1.0 | absent in observed registry metadata | MIT |
| @types/node | 22.15.30 | absent in observed registry metadata | MIT |

Exact registry JSON, metadata URLs/hashes and declared tarball SRI are archived. Actual
`npm-lock.json` came from the successful private installation; its hash lives in the resumed
receipt. `sri-verification.json` records separately downloaded direct-package tarball hashes
against registry declarations and actual lock integrities. No source commit is invented for
type packages: those installed license copies are pinned by exact package/version/SRI/path.
This establishes observed package identity, not a source-to-binary build attestation.

`LICENSE.next-upstream.txt` is an unchanged copy of `license.md` from the immutable Next
commit at `https://github.com/vercel/next.js`. Installed `LICENSE.<package>.txt` archives
are exact package license bytes. Every copied file's package path, immutable producer pin,
license metadata, raw hash and `modifications: none` record live in the receipts.
No runtime donor code copied. Capture collector and tiny source project are authored MIT.
Installed Next CLI and native SWC file paths/sizes/hashes are recorded separately; transitive
dependencies, resolved versions, licenses, URLs and integrities remain in the actual npm lock.

## Isolation and process boundary

Temporary workspace: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/B02-next-h1_k8tge`.
Dependencies and npm cache reside there, outside the TypeScript package. No global install,
shared cache cleanup or app serving. Storage was checked before installation and build waves.
Native command: `node node_modules/next/dist/bin/next build`, without npm lifecycle wrapper.
Config sets `experimental.cpus: 1`, `workerThreads: false`, fixed build ID `B02-tiny`.
Environment sets NEXT_TELEMETRY_DISABLED=1, CI=1, NO_COLOR=1, TZ=UTC,
RAYON_NUM_THREADS=1, UV_THREADPOOL_SIZE=1; FORCE_COLOR removed. Worker caps are not
an OS CPU-affinity assertion. Project uses three tiny pages and no remote fonts/network data.

`Popen` receives argv directly with isolated cwd, stderr redirected to stdout before exec,
one binary pipe, no PTY or output normalization. `communicate()` reads through EOF and waits.
Receipts preserve argv/command/cwd, native version/platform, environment overrides,
timestamps, termination, completeness, raw bytes/hash, final LF and last-byte hex.
ANSI remains in the typecheck failure even with NO_COLOR. Source span conventions remain
UTF-16; recorded sizes and hashes refer to raw UTF-8 bytes.

Install timeout: 180 seconds. First routes timeout: 90 seconds. Remaining native builds:
300 seconds each, strict maximum. Timeout kills the isolated process group, drains the pipe,
then records `timed_out` / `truncated`; subsequent EOF never upgrades it to complete.
Historical ENOSPC receipt and failure bytes remain unchanged. The resumed collector writes
`resume-receipt.json`, never the original `capture-receipt.json`.

## Executed native recipe

```sh
python3 fixtures/profiles/next/capture.py resume
python3 fixtures/profiles/next/capture.py install
python3 fixtures/profiles/next/capture.py build routes
python3 fixtures/profiles/next/capture.py sri
python3 fixtures/profiles/next/capture.py build routes --attempt retry --timeout 300
python3 fixtures/profiles/next/capture.py build css-warning --timeout 300
python3 fixtures/profiles/next/capture.py build config-warning --timeout 300
python3 fixtures/profiles/next/capture.py build typecheck-failure --timeout 300
python3 fixtures/profiles/next/capture.py build build-failure --timeout 300
python3 fixtures/profiles/next/capture.py build config-collision --timeout 300
python3 fixtures/profiles/next/capture.py build plugin-collision --timeout 300
python3 fixtures/profiles/next/capture.py evidence
python3 fixtures/profiles/next/capture.py index
```

Commands above document history; duplicate case names are rejected instead of overwriting
captures. `resume-source-recipes.json` is the executed base/overlay source recipe. Each build
rewrites tiny authored pages and clears only its own `.next`/incremental artifacts; installed
dependencies remain fixed. Pre/post source hashes record Next's generated next-env changes.

Artifact recipe: inspect `.next` recursively after termination, hash every emitted file and
preserve selected manifests verbatim. Partial artifacts from failed/timed-out processes stay
separate. Random preview credentials in retained manifests belong only to this unserved
temporary build; they are native ephemeral bytes, not production credentials.
`evidence-inventory.json` recomputes raw input, source recipe, retained manifest and historical
checkpoint byte correspondence. It does not execute the parser or replace independent corpus
verification. Public-filter disposition remains pending-policy; no deletion/golden generated.
