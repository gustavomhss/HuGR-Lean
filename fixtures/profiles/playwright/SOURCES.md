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
  Download failed with `ENOSPC`; mirror attempts and exact errors retained in
  `setup-receipt.json`. No completed browser archive/executable hash or browser
  SRI claimed. Full npm browser registry retained, including other revisions;
  Firefox/WebKit were not installed or tested.

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

## Reach and blockers

API-only tests prove reporter behavior; they do not request browser fixtures.
Browser tests actually request `page`/`browser` and fail to launch missing
private executable. Their retry diagnostics prove failure preservation only.
**Browser execution remains blocked; R04 is incomplete, not waived.**

Initial resume invocation hit harness 240-second timeout before committing
artifacts; its test output is not claimed as complete evidence. Final recipe
adds process-group timeout cleanup and native global bound; final ten captures
all exited and reached EOF. No runtime/shared/test-suite edits, full checks,
typecheck, smoke, benchmark or CI execution. Public-filter disposition is
pending lead review, represented as passthrough with unchanged bytes.
