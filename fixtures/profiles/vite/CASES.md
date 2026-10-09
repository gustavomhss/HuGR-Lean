# B01: capture-only Vite 6.3.5 packet

Finite pipe-output observations; no parser, registry admission or public-filter execution.
`cases.json` stores full original strings, including final LF. Passthrough is the
required conservative disposition, not a measured runtime result. Independent
literal proposals in `proposed-goldens.json` were authored from captured evidence,
without running a reducer. Each keeps module counts, all artifact/chunk paths and
sizes, gzip/map metrics, exact warnings/advice/source locations and timings.

| Case | Original command / combination | Required evidence | Disposition | Conditional removable bytes | Future acceptance name (not run) |
| --- | --- | --- | --- | --- | --- |
| B01-fresh | `vite build`, initially absent dist | 7 modules, 5 reported artifacts, 2 JS chunks, SVG/CSS/HTML, gzip, 131ms | unsafe/ambiguous exact pending producer boundary | 59 | B01 authenticated fresh progress |
| B01-repeat | `vite build`, immediately repeated with prior dist | same artifacts, 117ms; no cache-hit marker | unsafe/ambiguous exact pending producer boundary | 59 | B01 repeated build evidence |
| B01-outdir | `vite build --outDir release/site` | nested output paths, all metrics, 111ms | unsafe/ambiguous exact pending producer boundary | 59 | B01 custom output paths |
| B01-warnings | `vite build --config warnings.config.mjs` | `lazy.js (3:0)`, eval warning, plugin sourcemap warning, map sizes, chunk-size advice, 130ms | unsafe/ambiguous exact pending producer boundary | 59 | B01 complete warnings retained |
| B01-plugin-collision | `vite build --config collision.config.mjs` | actual plugin stdout: fake 999-module summary, artifact/gzip row, 777ms plus three progress lines; real build follows | unsafe/ambiguous exact, no deletion | 0 | B01 native-shaped plugin output exact |

## Conditional grammar proposal

Only whole LF-terminated `transforming...`, `rendering chunks...` and
`computing gzip size...` lines could be omitted, once per authenticated native
phase, after validating the entire pinned envelope. Never remove module summaries,
version/mode header, rows, gzip/map numbers, completion timing or warning blocks.
Do not deduplicate repeated phase lines. Unknown text, duplicate/missing phases,
inconsistent summaries, missing boundaries, incomplete capture or nonzero exit
must retain original. Full grammar recognition alone cannot satisfy authentication.

The captured plugin logs duplicate native shapes inside Vite's real invocation.
Default auto-loaded config can also emit arbitrary stdio. `--config` is not the
only risky path; direct `vite build` does not establish reporter identity. Current
Observation metadata carries process completion, not per-line producer identity.
Thus all five observations remain exact; conditional goldens are design evidence,
not supported reductions. Mandatory reduction scope needs lead/human decision.

## Reach

Repeat demonstrates an existing-output rebuild, not an authenticated Vite cache
hit or an incremental compiler cache. No watch, SSR, library mode, alternate
version/platform, ANSI/TTY, failure or truncated execution was captured. No
framework build, runtime throughput claim or exhaustive plugin grammar claim.
