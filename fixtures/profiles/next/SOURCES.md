# B02 capture provenance and resume recipe

## Producer pins

Next 15.5.9 registry gitHead: `c5de33e93ccccaf3bee60cf50603e2152f9886e1`.
Source repository: `https://github.com/vercel/next.js`; license: MIT.
Pinned source license: `license.md` at that commit, copied without modifications to
`LICENSE.next-upstream.txt`; exact raw SHA-256 in `capture-receipt.json`.

React and React DOM 19.1.0 registry gitHead: `1825990c5608f0ab0c1475b4292218a508a171c9`.
TypeScript 5.9.3 registry gitHead: `c63de15a992d37f0d6cec03ac7631872838602cb`.
@types/react 19.1.0 and @types/node 22.15.30 have no gitHead in observed npm metadata.
Do not infer their source commits. Each exact registry JSON and its byte hash are archived.
No runtime donor code copied. Tiny project and capture collector are authored here.

Declared registry SRI is recorded, but no tarball was downloaded or SRI verified.
No actual npm-generated lock exists at this blocked checkpoint. Metadata is not a lock.
The exact pins are intended for a separate temporary project, not this package's dependencies.

## Capture boundary

Python `Popen` receives argv directly with cwd in an isolated temporary directory.
stderr redirects to stdout before exec; one binary pipe, no PTY, no decoding/reformatting,
no stream concatenation. `communicate()` reads through EOF and waits. Raw bytes are written
to a file; receipt records SHA-256, UTF-8 byte length, final LF, last-byte hex, timestamps,
platform, argv, command, cwd, process status, and environment overrides.
Timeout kills the isolated process group, drains its pipe, and records `timed_out` plus
`completeness: truncated` even if the killed process subsequently closes the pipe.
Build timeout: 90 seconds. Install timeout: 180 seconds. A collector/storage failure is
not a complete process capture, and the initial failure's lost registry bytes are explicit.

## Resume in this worktree

After freeing storage through the responsible owner, run:

```sh
python3 fixtures/profiles/next/capture.py install
python3 fixtures/profiles/next/capture.py build routes
python3 fixtures/profiles/next/capture.py build css-warning
python3 fixtures/profiles/next/capture.py build config-warning
python3 fixtures/profiles/next/capture.py build typecheck-failure
python3 fixtures/profiles/next/capture.py build build-failure
python3 fixtures/profiles/next/capture.py build config-collision
python3 fixtures/profiles/next/capture.py build plugin-collision
python3 fixtures/profiles/next/capture.py index
```

`install` resumes the recorded second workspace; it never overwrites an existing install
receipt. First bootstrap workspace remains preserved separately. New captures refuse
duplicate names. The collector copies actual npm lock and installed direct-package licenses
only after a successful installation. It compares installed direct-package versions to pins.
Native inputs use `node node_modules/next/dist/bin/next build`, not npm lifecycle wrappers.
No app is served; no remote fonts or application network dependencies exist. Config uses
`experimental.cpus: 1`, `workerThreads: false`, and fixed build ID `B02-tiny`.
Every build starts with a fresh `.next` and tiny authored pages; dependencies remain installed.

The artifact archive inventories paths, byte sizes and hashes for every emitted `.next` file,
and retains raw UTF-8 BUILD_ID/routes/build/prerender/pages manifest contents. Build failure
archives may contain partial artifacts; their termination accompanies the archive.
Hashing files does not prove successful output or producer identity. Inspect every real output
before updating coverage, candidates, or blockers. After changing documents, regenerate the
explicit archive index using `index` before named staging.
