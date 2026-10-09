# B02 Next.js: blocked capture-only checkpoint

Baseline `248c303`; branch `campaign/native-v2/B02`; owner scope `fixtures/profiles/next/**`.
This is not a completed B02 packet. No Next build has run. No reduction, native warning,
route-table, typecheck, artifact, or collision coverage is claimed.

## Completed evidence

- `B02-node-version`: real `node --version`, exit 0, `v22.17.1` and final LF retained.
- `B02-npm-version`: real `npm --version`, exit 0, `10.9.2` and final LF retained.
- Exact-version npm registry metadata: Next 15.5.9, React/React DOM 19.1.0,
  TypeScript 5.9.3, @types/react 19.1.0, @types/node 22.15.30.
  Metadata records tarball URLs, declared SRI, licenses, and available gitHead values.
  These are registry declarations, not installed-package/SRI verification.
- Next upstream MIT license copied unchanged from the recorded immutable commit/path.
- First collector's ENOSPC failure is recorded in `bootstrap-failure.json`.
  Its registry command output could not be written and is unavailable, not complete.

`cases.json` uses `hugr-lean/native-cases/1`: file-only input references,
`status: passthrough`, `disposition: pending-policy`. Every other fixture artifact,
including this document and the license `.txt`, is a string path in `archives`.
The two version probes are setup evidence, not B02 acceptance variants.

## Mandatory variants awaiting real captures

| Intended native case | Recipe / required evidence | Current status |
| --- | --- | --- |
| B02-routes | `/` static, `/dynamic` getServerSideProps, `/blog/[slug]` SSG and `/blog/one`; route modes, sizes, shared chunks, artifact paths, successful lint/typecheck | BLOCKED: install unavailable |
| B02-css-warning | Pages CSS `justify-content: end`; actual autoprefixer message/context; if producer does not warn, warning requirement stays open | BLOCKED: warning unobserved |
| B02-config-warning | Unknown config option; exact native warning and successful/failed termination | BLOCKED: warning unobserved |
| B02-typecheck-failure | String assigned to number in TSX; real Next diagnostic/snippet and exit | BLOCKED: diagnostic unobserved |
| B02-build-failure | Missing import; real module error/import trace and exit | BLOCKED: failure unobserved |
| B02-config-collision | Config executes two native-looking progress/table lines before export | BLOCKED: collision unobserved |
| B02-plugin-collision | Real webpack beforeCompile hook emits native-looking build/success rows | BLOCKED: collision unobserved |

Source recipes are authored MIT material, not native output. Their existence cannot satisfy
any row above. Artifact recipes hash every `.next` file and preserve selected manifest contents
after process termination; no artifact archive exists until a real build finishes or fails.

## Policy and checks

User approved exact preservation for ambiguous config/plugin/reporter output. That approval
does not waive missing captures or authorize deletion of native-looking progress.
Candidate deletion: none proposed. Removable-byte measurement: unavailable.
Independent goldens and default-filter identity closure: pending lead promotion after captures.
No parser, source, test, registry, or shared changes; no fixture-only tests, typecheck,
full checks, smoke, benchmark, or CI executed. Native capture commands alone are authorized.

## Blocker

Initial raw-file write failed with `OSError: [Errno 28] No space left on device`.
Subsequent exact-version metadata collection succeeded. Install preflight recorded
113,541,120 free bytes against a 1 GiB minimum and stopped before npm install.
No actual npm lock, installed license set, verified package SRI, Next version probe,
or build exists. B02 remains incomplete. Resume only after storage is available;
do not remove unrelated agents' files or disguise this as completed exact-only coverage.
