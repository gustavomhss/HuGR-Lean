# B02 Next.js: native capture-only packet

Baseline `248c303`; branch `campaign/native-v2/B02`; exclusive scope `fixtures/profiles/next/**`.
Pinned Next 15.5.9, React/React DOM 19.1.0, TypeScript 5.9.3, @types/react 19.1.0,
@types/node 22.15.30. Node v22.17.1 / npm 10.9.2; macOS 15.3.2 x86_64.
Seven planned native variants have complete merged-pipe captures. Capture completeness is
not parser support, public-filter verification, corpus promotion, or final campaign completion.

## Native case coverage

| Case / raw input | Native evidence observed | Exit / completeness | Public disposition |
| --- | --- | --- | --- |
| B02-routes-retry.txt | Successful type validation/compile; `/` static, `/blog/[slug]` SSG with `/blog/one`, `/dynamic` SSR; route sizes, shared chunks, rendering legend | 0 / complete | passthrough, pending-policy |
| B02-css-warning.txt | Actual `(1:23) autoprefixer: end value has mixed support, consider using flex-end instead`; loader path/import trace; webpack cache serialization warnings; successful routes and artifacts | 0 / complete | passthrough, pending-policy |
| B02-config-warning.txt | Invalid next.config.js options; exact unknown key `b02UnknownOption`, help URL; successful routes and artifacts | 0 / complete | passthrough, pending-policy |
| B02-typecheck-failure.txt | `./pages/index.tsx:1:7`; string-to-number diagnostic, ANSI code frame and build-worker exit | 1 / complete | passthrough, pending-policy |
| B02-build-failure.txt | Type validation reaches webpack; unresolved `./b02-does-not-exist`, module-not-found URL, webpack failure summary | 1 / complete | passthrough, pending-policy |
| B02-config-collision.txt | Executed next.config.js logs native-identical build progress/table header repeatedly; real successful build table follows | 0 / complete | passthrough, pending-policy |
| B02-plugin-collision.txt | Real webpack beforeCompile hook logs native-identical build progress plus native-looking success lines across compilers; real build succeeds | 0 / complete | passthrough, pending-policy |

Each case has a corresponding `.artifacts.json`: paths, byte sizes, raw hashes for every
emitted `.next` file; verbatim BUILD_ID/build/routes/prerender/pages manifests when present.
Successful builds retain the fixed `B02-tiny` build ID without final LF, static HTML and
SSG JSON paths, SSR server-page paths and named shared chunks. Rendering modes come from
native stdout and authored lifecycle exports, not the routing manifest's `staticRoutes` name.
Nonzero builds have partial artifact inventories, not successful-build artifact claims.

`source-recipes.json` preserves the original planned recipes. `resume-source-recipes.json`
records the executed recipes: build-failure changed typed import to require so webpack,
rather than TypeScript, owns the missing-module failure. Per-case pre/post source hashes
bind recipes and generated changes. The final generated next-env.d.ts is archived separately;
its hash correspondence to each case is recorded, never assumed.

## Setup and failure witnesses

- B02-node-version / B02-npm-version: original complete version probes, bytes unchanged.
- B02-install: private-cache `npm install --ignore-scripts --no-audit --no-fund`, exit 0.
- B02-next-version: installed `Next.js v15.5.9`, exit 0.
- B02-routes: first tiny build timed out at 90 seconds while compiling. Raw 299 bytes and
  partial artifacts retained; `timed_out` / `truncated`, despite pipe EOF after process kill.
  This row is excluded from active complete cases; `B02-routes.txt` is a string-path archive.
  Its original row remains unchanged in `resume-receipt.json`, including timeout/truncation facts.
  B02-routes-retry is a distinct successful capture, with a strict 300-second timeout.
- bootstrap-failure.json: original ENOSPC collector failure. Lost registry output remains
  explicitly unavailable. Disk cleanup did not reconstruct those bytes or erase that failure.
- `capture-receipt.json`, bootstrap logs/failure, original recipes and `ENOSPC-cases.json`
  preserve the blocked checkpoint; all resumed process evidence uses `resume-receipt.json`.

## Preservation policy, candidates and review

User authorized exact preservation for ambiguous config/plugin/reporter stdout. Both collision
sources executed and produced real mixed output; grammar alone cannot authenticate producer.
All cases remain file-only inputs under `hugr-lean/native-cases/1`, with `status: passthrough`
and `disposition: pending-policy`; all noninput artifacts are explicit string-path archives.

No reduction candidate proposed; zero claimed removable bytes. Native progress exists, but
the collision witnesses rule out deleting it by appearance alone. Warnings, diagnostics,
sizes, routes, chunk paths, logs and EOF remain raw. Failed/incomplete cases require exact
preservation regardless of whether other cases permit progress reduction.
Native static-page progress includes trailing spaces/CR; successful outputs end with an
extra blank LF. Git whitespace diagnostics on those raw `.txt` inputs are expected evidence,
not defects to trim. Documentation/collector/JSON whitespace is checked separately.

Capture blockers: none for the seven named variants. Historical ENOSPC and timeout remain
failures, not completed captures. Independent review, exact corpus goldens/default-filter
identity verification and promotion remain lead-owned. No fixture-only tests, full tests,
standalone typecheck, CI, smoke, benchmark, served app, or application suite ran. Next's
own type validation inside the authorized tiny builds is native capture evidence.
