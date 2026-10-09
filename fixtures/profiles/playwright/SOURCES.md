# R04 Playwright capture provenance

Base: `248c303`; owned scope: `fixtures/profiles/playwright/**` only.
Original tiny projects, config and custom reporter are embedded verbatim in
`capture.py` and snapshotted with UTF-8 byte lengths/SHA-256 in `capture-receipt.json`.
No donor implementation copied or modified. Project sources use this repository's MIT license.

## Pins and source paths

- `@playwright/test`, `playwright`, `playwright-core`: **1.56.1**, Apache-2.0.
- Upstream tag `v1.56.1` resolves to commit
  `54c711571a37de525377e6f3d3608c3e029b1829`; npm `gitHead` agrees.
- Immutable upstream reporter sources:
  `https://github.com/microsoft/playwright/tree/54c711571a37de525377e6f3d3608c3e029b1829/packages/playwright/src/reporters`
  (`list.ts`, `line.ts`, `json.ts`, `base.ts`).
- Reporter documentation source:
  `https://github.com/microsoft/playwright/blob/54c711571a37de525377e6f3d3608c3e029b1829/docs/src/test-reporters.md`.
- Browser manifest source:
  `https://github.com/microsoft/playwright/blob/54c711571a37de525377e6f3d3608c3e029b1829/packages/playwright-core/browsers.json`.
- Installed npm lock snapshot records exact tarball URLs, SHA-512 SRI, versions,
  licenses and dependencies; installed Apache-2.0 license text retained in receipt.
  Optional `fsevents@2.3.2` is MIT, SRI pinned; install scripts disabled.
- Chromium/headless-shell revision **1194**, browser version **141.0.7390.37**.
  Intended official macOS x64 archive:
  `https://cdn.playwright.dev/dbazure/download/playwright/builds/chromium/1194/chromium-headless-shell-mac.zip`.
  Initial download failed with `ENOSPC`; mirror attempts and exact errors retained
  in `setup-receipt.json`. Recovery used that same official archive successfully.
  Installed headless-shell SHA-256:
  `92203af80c72d2e352871e289bdfcf9ca9719dad9ccd7180b4d91c4ae5ff97e5`.
  Binary hash is locally measured, not upstream browser SRI or source/build attestation.
  Full npm browser registry retained; Firefox/WebKit were not installed or tested.
- Chromium version-tag `141.0.7390.37` resolves to source commit
  `9f043f63b0e5b728c8d09f3e3ddfc1681a4bd58e` (Googlesource tag lookup).
  Chromium BSD-3-Clause license reference:
  `https://chromium.googlesource.com/chromium/src/+/9f043f63b0e5b728c8d09f3e3ddfc1681a4bd58e/LICENSE`.
  Bundled third-party code has separate licenses. No Chromium code/binary copied
  into repository; source tag is version reference, not attested build identity.

## Recipe and boundary

Fresh scratch project/private HOME, TMPDIR, npm cache and browser cache under
approved temporary root. Environment allowlist recorded; PATH inherited for
tool lookup, Node/npm selected by absolute path. No global install, person's
browser, browser profile, persistent context, registry auth or network page.

```
python3 fixtures/profiles/playwright/capture.py
```

Bootstrap: exact package pin, `npm install --ignore-scripts --no-audit --no-fund
--save-exact`, then official `playwright install --only-shell chromium` with
30-second connection timeout and 180-second process bound. npm install bound
120 seconds. Failed setup can be resumed without re-downloading:

```
python3 fixtures/profiles/playwright/capture.py --resume /absolute/R04-playwright-scratch
```

CLI argv is actual absolute Node plus isolated CLI path, not rewritten to
`playwright`/`npx`. Test commands use `--global-timeout=45000`, one worker,
one retry, 10-second per-test timeout and 90-second process bound. stderr joins
stdout into one pipe before exec; read through EOF then wait. No normalization,
ANSI stripping, PTY or truncation. Native worker NO_COLOR/FORCE_COLOR warnings
and line-reporter escape bytes preserved. Every observation includes platform,
argv, cwd, exit, EOF tail, UTF-8 bytes, SHA-256 and completion timestamp.

Human reporters use documented multi-reporter `list,json` / `line,json`;
`PLAYWRIGHT_JSON_OUTPUT_NAME` sends companion JSON to an isolated sidecar.
JSON-only reporter emits JSON directly to captured stdout. Sidecar raw bytes,
parsed retry/log/annotation/attachment evidence, and all post-run test-results
files are snapshotted before next run. Binary artifacts use base64 plus byte
length and SHA-256. There are no duplicate file/inline native inputs or `.txt`
archives: native inputs exist only as inline `cases.json` output strings.

## Browser recovery recipe

Original isolated node_modules were removed by authorized campaign cleanup;
original npm lock was preserved. `browser-recovery.py` restores that exact lock
into a fresh private scratch project using `npm ci --ignore-scripts --no-audit
--no-fund`. Installed package versions and unchanged lock/browser registry are
asserted before official `install --only-shell chromium` (240-second bound).
Installer also fetches its pinned ffmpeg helper; complete native download log
records versions/URLs. No global cache, browser or person profile used.

```
python3 -B fixtures/profiles/playwright/browser-recovery.py
```

First browser command exceeded original native 45-second startup bound. Raw
operation/report/artifacts preserved. Resume reuses installed pins and browser,
does not download again:

```
python3 -B fixtures/profiles/playwright/browser-recovery.py --resume /absolute/R04-playwright-recovery-scratch
```

Source changes from original recipe: explicit `launchOptions.executablePath`
points to private revision-1194 headless-shell; body proof records project,
version, executable/hash, viewport and asserted page title; test timeout raised
to 45 seconds. Final native global/process bounds are 120/180 seconds.
Two Chromium projects each load in-memory HTML, assert title/button, capture PNG
and attach it by path. Four native captures cover list, line, JSON stdout and
separate `DEBUG=pw:browser` launch evidence. Debug logs include exact disposable
user-data paths beneath private TMPDIR and completed cleanup; no persistent
context. Screenshots, copied attachments, proof bodies and sidecars snapshotted.
No modifications to historical sources/receipt/setup/cases; appended observations
reference `browser-recovery-receipt.json` and recovery recipe hash separately.

## Reach and historical blockers

API-only tests prove reporter behavior; they do not request browser fixtures.
Historical browser tests request `page`/`browser` and fail missing-executable
lookup. Their retry diagnostics prove failure preservation only. Recovery
captures now prove actual private Chromium 141.0.7390.37 execution with two
viewport projects and real screenshots; browser blocker cleared. Runtime
grammar/policy still pending, approved removable bytes **0**.

Initial resume invocation hit harness 240-second timeout before committing
artifacts; its test output is not claimed as complete evidence. Final recipe
adds process-group timeout cleanup and native global bound; final ten captures
all exited and reached EOF. No runtime/shared/test-suite edits, full checks,
typecheck, smoke, benchmark or CI execution. Public-filter disposition is
pending lead review, represented as passthrough with unchanged bytes.
