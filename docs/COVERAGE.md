# Coverage and admission inventory

Post-implementation inventory of the utility candidate, still version 0.2.0, read from code and named witnesses. Native conformance, fixture replay, installed-artifact proof and host compatibility have distinct evidence; current full-suite/host/latency verification is pending.
One MIT TypeScript package: root default plugin only, library `hugr-lean/core`, storage `hugr-lean/raw`, bin `hugr-lean` at `dist/cli/index.js`; [package manifest](../package.json), [plan](../PLAN.md), and [shared types](../src/core/types.ts) define the boundary.

## Profile coverage
The [registry](../src/profiles/index.ts) contains nine reducers plus identity-only `tsc` stub (10 IDs). Complete shell exit 0, supported identity, full admitted grammar, intact required evidence, and smaller UTF-8 bytes are all necessary.
| ID | Admitted scope | Witness |
| --- | --- | --- |
| `cargo-test` | Unoptimized sequential libtest/integration/doctest contexts; optional `--lib` and never-color flags; seconds/minutes finish; retain every context, summary and ignored identity/reason | [Cargo utility tests](../tests/utility-cargo.test.ts) |
| `cargo-build` | Compilation followed by one unoptimized dev finish, seconds/minutes; retain native finish | [runner tests](../tests/runners.test.ts), [Cargo controls](../tests/utility-cargo.test.ts) |
| `pytest` | Default/quiet, wrapped progress, literal paths/doctests; default banner pytest 9.0.3/pluggy 1.6.0; closed UserWarning/skip and quiet built-in-subtest variants | [pytest utility tests](../tests/utility-pytest.test.ts) |
| `go-test-verbose` | `go test -v`, optionally `.` or `./...`; sequential flat packages, timed/cached summaries and no-test rows; preserve skips and source-bound diagnostic envelopes | [Go utility tests](../tests/utility-go.test.ts) |
| `node-test` | Direct Node/tsx TAP 13, flat/nested tests through depth 32, YAML `type: 'test'`, suites 0; preserve plans/footer, skips/TODO/diagnostics and ancestors | [Node utility tests](../tests/utility-node.test.ts) |
| `jest` | Plain successful human suites/describe/tests and consistent summaries; preserve bodies/timings, shorten fixed success prefixes | [format tests](../tests/formats.test.ts) |
| `vitest` | Plain successful human file/count/clock/duration grammar; preserve evidence, omit only delimited per-file timings | [format tests](../tests/formats.test.ts) |
| `git-status` | English human long status, known ordered sections/state/advice, restricted unquoted paths; exact conflicts/renames/submodules, native footer where required | [format tests](../tests/formats.test.ts) |
| `rg` | Explicit `-n`/`--line-number`, known options, unambiguous filename/positive-line/content records; consecutive path grouping only | [format tests](../tests/formats.test.ts) |
| `tsc` | Identity stub, always `undefined`; multiline/pretty diagnostics remain exact | [format tests](../tests/formats.test.ts) |
Exact argv and evidence: [profile manual](../src/profiles/MANUAL.md). Existing donor pins remain in [runner SOURCES](../fixtures/runners/SOURCES.md)/[format SOURCES](../fixtures/formats/SOURCES.md); new original local captures are described in [utility evaluation](UTILITY_EVALUATION.md). Runtime binary-version detection is not implied, except pytest's admitted default banner pair.

The [combined tests](../tests/combined.test.ts) and [installed inspector](../scripts/package-smoke.mjs) declare 39 cases across all 10 IDs, including 25 native utility cases (12 noise, 13 exact). Four parser cold reviews were approved; this is not a final full-suite, package, host or latency outcome. Jest/Vitest coverage and utility strategy remain unchanged.

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
- [Installed-artifact smoke](../scripts/package-smoke.mjs) packs and installs an external consumer, checks independent fixture goldens and required source pieces, root/server/core/raw exports, CLI/version/doctor, notices and exact recovery. `--opencode` separately checks actual model-bound output. Final utility-candidate receipts and registry publication remain pending.
- Local checks and [CI workflow](../.github/workflows/ci.yml) validate structure, code/tests/build and installed-artifact smoke. Real-host proof and measured latency use explicit separate scripts; CI green alone does not establish native recapture, doc quality, registry publication or latency budgets.

## Maintenance contract
Target 400 LOC/file, allow 600, tolerate 750; above 750 split responsibilities within this single package. Follow each module's maintenance guide: focused tests and typecheck/build, destructive preservation probe must fail, restore then rerun. Compatibility/coverage claims never exceed their witnesses.
