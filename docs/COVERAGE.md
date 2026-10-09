# Coverage and admission inventory

Post-implementation inventory of the 0.2.0 rebuild, read from code and named witnesses. Native conformance, fixture replay, installed-artifact proof and host compatibility have distinct evidence.
One MIT TypeScript package: root default plugin only, library `hugr-lean/core`, storage `hugr-lean/raw`, bin `hugr-lean` at `dist/cli/index.js`; [package manifest](../package.json), [plan](../PLAN.md), and [shared types](../src/core/types.ts) define the boundary.

## Profile coverage
The [registry](../src/profiles/index.ts) contains eight reducers plus identity-only `tsc` stub (nine IDs). Complete shell exit 0, supported identity, full admitted grammar, intact required evidence, and smaller UTF-8 bytes are all necessary.
| ID | Admitted scope | Witness |
| --- | --- | --- |
| `cargo-test` | One modern unoptimized native libtest suite; optional never-color flags; retain finish/executable, native summary and ignored identities/reasons | [runner tests](../tests/runners.test.ts) |
| `cargo-build` | Compilation followed by one modern unoptimized dev finish; retain native finish | [runner tests](../tests/runners.test.ts) |
| `pytest` | pytest 9.0.3/pluggy 1.6.0, plugin-free default human session, unwrapped file dot/skip rows and consistent totals; retain skipped-file evidence | [runner tests](../tests/runners.test.ts) |
| `go-test-verbose` | `go test -v [.]`, one flat sequential package, RUN/result pairs, native PASS/timed summary; no logs/subtests/parallel/cached grammar | [runner tests](../tests/runners.test.ts) |
| `jest` | Plain successful human suites/describe/tests and consistent summaries; preserve bodies/timings, shorten fixed success prefixes | [format tests](../tests/formats.test.ts) |
| `vitest` | Exact fixture preservation; no timing removal approved. Runtime/source golden alignment pending PR117 | [format tests](../tests/formats.test.ts) |
| `git-status` | English human long status, known ordered sections/state/advice, restricted unquoted paths; exact conflicts/renames/submodules, native footer where required | [format tests](../tests/formats.test.ts) |
| `rg` | Explicit `-n`/`--line-number`, known options, unambiguous filename/positive-line/content records; consecutive path grouping only | [format tests](../tests/formats.test.ts) |
| `tsc` | Identity stub, always `undefined`; multiline/pretty diagnostics remain exact | [format tests](../tests/formats.test.ts) |
Exact argv, retained/deletable evidence, native capture versions, and pinned donor commit/path/license/modifications: [profile manual](../src/profiles/MANUAL.md), [runner SOURCES](../fixtures/runners/SOURCES.md), [format SOURCES](../fixtures/formats/SOURCES.md). Runtime binary-version detection is not implied, except pytest's admitted banner pair.

## Optional-v1 assessment: passthrough
These are admission decisions, not completed native captures or support promises; [formats.ts](../src/profiles/formats.ts) admits no lint/install grammar.
| Candidate | Admission evidence still required |
| --- | --- |
| Native ESLint | Full formatter/diagnostic grammar, preservation of multiline evidence, and demonstrated removable material noise |
| Native Biome | Full diagnostic/rendering grammar, source-context/summary preservation, and demonstrated removable material noise |
| Native Ruff | Full diagnostic/fix-context grammar, evidence preservation, and demonstrated removable material noise |
| Native Clippy | Full mixed Cargo/diagnostic grammar, warning/error/context preservation, and demonstrated removable material noise |
| Install progress | Full launcher/lifecycle/error/advice grammar and proof that deleting progress retains all evidence and saves material noise |

## Cross-module evidence and remaining reach
- [Core tests](../tests/core.test.ts), [command](../tests/command.test.ts), [lines](../tests/lines.test.ts), and [normalization](../tests/normalize.test.ts): UTF-16 spans, UTF-8 limits, evidence/refusal/exception controls. SGR normalization requires declared rendered presentation plus admitted grammar; any CR disables it because geometry is unavailable.
- [Plugin tests](../tests/plugin.test.ts): native metadata mapping, model-text-only replacement, raw off by default, saves only at `>=1024` bytes and `>=10%`, required-save errors preserving original; OpenCode presentation stays `unknown`.
- [Raw tests](../tests/raw.test.ts) and [expiry tests](../tests/raw-ttl.test.ts): exact-string records, persisted writer expiry, default 64 MiB aggregate serialized bytes plus bounded separate lock metadata, seven-day lazy TTL, reject-full/unexpired retention, cooperative dead-PID-only recovery. Caller restricts ACLs on every OS; POSIX UID/modes do not prove extended-ACL isolation, and Windows permissions have distinct/skippable evidence.
- [OpenCode proof](OPENCODE.md): recorded 1.18.17 legacy CLI/macOS x86_64 hook-to-next-model-request experiment; [CI harness teeth](../tests/opencode-boundary.test.ts) use a fake host. V2 and other installed routes require separate real-host proof.
- [CLI manual](../src/cli/MANUAL.md), `src/cli/index.ts`, and `tests/cli.test.ts`: implemented required `--command`, optional `--exit-code`/`--complete`/`--terminal-rendered`, raw-only `--directory`, stdin byte preservation, exact replacement/get stdout, list/doctor JSON plus LF, version plus LF, and statuses 0/1/2. Compiled-entry tests include malformed UTF-8, oversize streaming, raw errors, and package-fact reporting; doctor uses the registry, not OpenCode proof.
- [Installed-artifact smoke](../scripts/package-smoke.mjs) packs and installs an external consumer, checks independent fixture goldens, root/server/core/raw exports, actual CLI shim/version/doctor, notices and exact recovery. `--opencode` separately proves the installed plugin's actual model-bound result. Public registry availability requires successful publication.
- Local checks and [CI workflow](../.github/workflows/ci.yml) validate structure, code/tests/build and installed-artifact smoke. Real-host proof and measured latency use explicit separate scripts; CI green alone does not establish native recapture, doc quality, registry publication or latency budgets.

## Maintenance contract
Target 400 LOC/file, allow 600, tolerate 750; above 750 split responsibilities within this single package. Follow each module's maintenance guide: focused tests and typecheck/build, destructive preservation probe must fail, restore then rerun. Compatibility/coverage claims never exceed their witnesses.
