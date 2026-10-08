# T01: native TypeScript capture packet

State: REVIEW, body and root-binding production probes restored. The latest
root-binding receipt supersedes the earlier cross-form admission and economy below.
Base `07ffe15`, branch `campaign/native-v2/T01`. The original capture-only checkpoint
is `81b6c78`; its historical receipts below are preserved and superseded by the
implementation receipt at the end. `formats.ts` retains its diagnostic-only stub.
`tsc.ts` now provides the scoped family profile; registry integration is lead-owned.
Manifest reduction statuses now correspond to genuine direct/npx native commands;
all original Node argv remain unmodified and are exact-only witnesses.

## Capture boundary

- Date: 2026-10-08. Host: Darwin 24.3.0, `darwin-x64`, Node v22.17.1.
- Compiler: TypeScript 5.9.3, installed locally with `npm ci` from the unchanged
  `package-lock.json` at base `07ffe15`. Native `--version` returned `Version 5.9.3`.
- Package: `https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz`;
  integrity `sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==`.
  TypeScript is Apache-2.0. No compiler/library source is copied into this packet.
- CWD for every capture:
  `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/t01-tsc`.
- Executable: `/usr/local/bin/node`. Script:
  `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/lean-native-v2-T01/node_modules/typescript/bin/tsc`.
  `cases.json.command` records the actual complete argv, without rewriting it into
  a direct `tsc` command. The compiler canonicalizes some output paths to
  `/private/var/...`; those strings remain unchanged in the fixtures.
- Boundary: `spawnSync` child stdout Buffer, pipe/non-TTY, stderr captured
  separately and empty for every case. No shell, merged-stream approximation,
  host envelope, ANSI stripping, path substitution, newline conversion or truncation.
  All children exited; codes are in the manifest. Files contain complete stdout
  decoded losslessly as UTF-8. `presentation: unknown` remains unknown even when
  `--pretty true` explicitly produces ANSI. Mixed CRLF/LF in build headers is native.
- Manifest `file` and `expectedFile` resolve relative to this directory; provenance
  `record` resolves here too. Each case has a unique path, including zero-byte
  silent captures. An absent `expectedFile` means byte-for-byte identity with `file`,
  not an empty invented summary or a missing reduction golden.
- Native input is newly authored for this packet; no donor material is copied.
  Existing `../../formats/lint_tsc_errors.txt` is the unchanged regression anchor,
  not a native recapture, and is intentionally not assigned fabricated native
  version/termination metadata or duplicated in `cases.json`.

## Disposable project and replay

All files below have a final LF. They are the entire project input. Generated
`out`, `bad-out` and `.tsbuildinfo` files are disposable and excluded from the PR.

| Path | Initial content |
| --- | --- |
| `tsconfig.json` | `{"compilerOptions":{"strict":true,"lib":["es5"],"types":[],"outDir":"out"},"files":["ok.ts"]}` |
| `ok.ts` | `export const answer: number = 42;` |
| `error.json` | `{"compilerOptions":{"strict":true,"lib":["es5"],"types":[],"outDir":"bad-out"},"files":["bad.ts"]}` |
| `bad.ts` | `export const answer: number = "wrong";` then `missingName();` on line 2 |
| `refs/tsconfig.json` | `{"files":[],"references":[{"path":"./lib"},{"path":"./app"}]}` |
| `refs/lib/tsconfig.json` | `{"compilerOptions":{"composite":true,"strict":true,"lib":["es5"],"types":[],"outDir":"out"},"files":["index.ts"]}` |
| `refs/lib/index.ts` | `export const answer: number = 42;` |
| `refs/app/tsconfig.json` | `{"compilerOptions":{"composite":true,"strict":true,"lib":["es5"],"types":[],"outDir":"out"},"files":["index.ts"],"references":[{"path":"../lib"}]}` |
| `refs/app/index.ts` | `import { answer } from "../lib";` then `export const result: number = answer;` on line 2 |

From the assigned worktree, with a fresh disposable project at the recorded CWD:

```sh
T01_PROJECT=/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/t01-tsc node fixtures/profiles/tsc/capture.mjs initial
```

This executes sequence 1–13. Initial reference outputs do not exist for sequence 5;
sequence 6 immediately reuses them. Next change only `refs/lib/index.ts` from
`42` to `43`, after its previous build timestamp. Its declaration signature remains
`number`, so the app needs only timestamp updates, not compilation. Run:

```sh
T01_PROJECT=/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/t01-tsc node fixtures/profiles/tsc/capture.mjs incremental
```

This executes sequence 14–15, including a forced rebuild with all requested
metrics/list options. Next replace `43` with `"wrong"` in that same source and run:

```sh
T01_PROJECT=/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/t01-tsc node fixtures/profiles/tsc/capture.mjs failure
```

This executes sequence 16–18. Sequence 17 creates the root project's incremental
cache, sequence 18 reuses it. Sequence 14–18 were originally captured with the
same `spawnSync` boundary in inline Node invocations; the helper now also exposes
those argv as replay stages. Replay will change wall clocks, timings, memory,
filesystem timestamps and possibly absolute paths. The committed fixtures are
original observations, not replay output edited to resemble them.

## Historical finite variants and dispositions (capture checkpoint)

Each row corresponds to `T01/<name>` in `cases.json`. Native path is
`<name>/native.txt`; reduction goldens are `<name>/independent.expected.txt`.
Expected goldens were hand-selected from captured source text, without a parser.
All metrics/list/diagnostic content is required evidence; no generic log dedup is
permitted. Table bytes are UTF-8 measurements, not token estimates.

| Name | Variant / required evidence | Proposed disposition / reason | Native → expected bytes | Removable |
| --- | --- | --- | ---: | ---: |
| success | explicit `-p`; successful emit, silent | passthrough: no removable material | 0 → 0 | 0 |
| no-emit | explicit `-p --noEmit`, silent | passthrough: no removable material | 0 → 0 | 0 |
| plain-error | `--noEmit --pretty false`; two messages, codes, positions, exit 2 | passthrough: failed command, exact | 137 → 137 | 0 |
| pretty-error | `--noEmit --pretty true`; ANSI, snippets, carets, total, exit 2 | passthrough: failed command, exact | 441 → 441 | 0 |
| build-initial | `-b --verbose`; ordered reference list, both missing-cache reasons and builds | reduced proposal: repeated identical time prefixes | 657 → 618 | 39 |
| build-up-to-date | `-b --verbose`; both input/output associations and cache reasons | reduced proposal: repeated identical time prefixes | 443 → 417 | 26 |
| diagnostics | every metric, unit and value including I/O and total | passthrough: no removable material | 322 → 322 | 0 |
| extended-diagnostics | all line categories, caches, memory, phase times | passthrough: no removable material | 952 → 952 | 0 |
| list-files | all four exact source/library paths, order | passthrough: no removable material | 479 → 479 | 0 |
| list-emitted-files | `TSFILE:` and exact JS artifact path | passthrough: no removable material | 92 → 92 | 0 |
| explain-files | all source paths and their inclusion reasons | passthrough: no removable material | 543 → 543 | 0 |
| metrics-lists | extended metrics + all three listing options; native explain output subsumes listFiles | passthrough: no removable material | 1587 → 1587 | 0 |
| error-metrics-lists | pretty diagnostics + diagnostics + listings + noEmit; native has no emitted list | passthrough: failed command, exact | 1307 → 1307 | 0 |
| build-incremental | unchanged declaration; changed-input reason, rebuild, dependency status, timestamp update | reduced proposal: repeated identical time prefixes | 665 → 626 | 39 |
| build-metrics-lists | force + verbose + extended metrics + all listing flags; both projects and aggregates | passthrough: unsafe/ambiguous policy scope, approval blocker below | 5832 → 5832 | 0 |
| build-error | pretty verbose refs; snippet/code, downstream timestamp update despite exit 2 | passthrough: failed command, exact | 951 → 951 | 0 |
| project-incremental-initial | explicit `--incremental` creates root cache, silent | passthrough: no removable material | 0 → 0 | 0 |
| project-incremental-cached | explicit `--incremental` reuses root cache, silent | passthrough: no removable material | 0 → 0 | 0 |

Native aggregate: 14,408 bytes. Proposed golden aggregate: 14,304 bytes.
Potential saving: 104 bytes; current public-filter saving: 0 bytes.
This is a corpus-specific measurement, not a performance or broad reduction claim.

## Historical proposed evidence policy and blockers (capture checkpoint)

1. For successful, complete, plain verbose reference builds only, retain the first
   timestamp prefix in each consecutive timestamp group. Later identical prefixes
   in that group are redundant; omit only those exact 13-byte source spans.
   Timestamp changes restart groups. Keep every body, blank line and native line
   ending. Do not drop project headings, project identifiers, paths, ordering,
   out-of-date/up-to-date reasons, rebuild events or output timestamp updates.
   Expected files contain only ordered source material; they add no headings,
   summaries, status totals, abbreviations or fake success output.
2. This needs a lead-approved inherited-timestamp interpretation. If every event
   must retain its own explicit timestamp, all three proposals must be passthrough.
   No human scope decision is recorded yet. This is a policy blocker, not evidence
   of an implemented reducer.
3. Requested metrics/list evidence stays exact. The forced-build combination also
   stays exact pending a decision about whether repeated wall-clock prefixes can
   be removed alongside requested timing metrics. It has real repetition but its
   disposition is **unsafe/ambiguous**, not **no removable material**. It cannot
   complete mandatory reduction coverage through lead review alone without the
   campaign's recorded human scope decision.
4. Failed commands stay entirely exact, including useful-looking verbose progress.
   ANSI under unknown presentation stays byte-for-byte exact. Unsupported argv,
   new text, truncation, timeout, missing producer boundary or ambiguous lifecycle
   collisions require refusal. Captures authenticate this binary's stdout only;
   recognizable text cannot establish producer identity in arbitrary host output.
5. Actual capture launcher is Node plus a pinned local compiler script. Existing
   matching admits `tsc`/`npx tsc`/`npx --no-install tsc`, not this Node argv. Lead
   must decide how to obtain direct-launcher admission witnesses without rewriting
   these commands or broadening launchers by inference. Node captures are native
   compiler-output evidence, not baseline command-recognition acceptance proof.
6. Parser, registry, fixture-reader integration, reduction/preservation acceptance
   tests and mutation probes remain a later work packet. Test name for every row:
   **not assigned (capture-only)**. Existing donor anchor is BASELINE_PRESERVED by
   unchanged files, not newly executed legacy tests. Unknown-text collision
   witnesses and cross-platform captures remain explicit parser-scope work.

## Historical checks recorded (capture checkpoint)

`npm run typecheck` exited 0. Native compiler positive controls produced exit 2
with real TS2322/TS2304 diagnostics; silent success cases exited 0 with zero bytes.
Fixture inspection measured native ANSI and mixed line endings without stripping:
pretty-error and error-metrics-lists each contain 34 ESC bytes; build-error contains
26 ESC bytes; each verbose-build fixture contains three CR bytes in its header.
Repo-wide tests, build, benchmark and CI were not run for this capture-only packet.
Independent lead review and later exact-candidate CI remain pending.

Seven deterministic variants were recaptured and their stdout Buffers compared
byte-for-byte with the fixtures: success, no-emit, plain-error, pretty-error,
list-files, list-emitted-files and explain-files. All seven matched their recorded
exit code, complete stdout and empty stderr. In-memory corruptions (remove the
first byte; add text to silent output) were detected for each comparison. The
initial readback failed with `Error: Native capture mismatch: T01/pretty-error`:
patch insertion had removed its terminal blank line. That real failure exposed
the boundary loss; native and expected verbose-build terminal blank lines were
also restored. The restored seven-case readback passed. These are capture-byte
controls, not parser tests or a claimed parser mutation probe.

`git diff --cached --check` reports native CRLF headers as trailing whitespace and
native terminal blank lines as new blank lines at EOF. Those reported bytes are
intentional capture evidence and remain exact; the whitespace check is not claimed
green. No Git whitespace policy or hook was changed to suppress the findings.

## Direct launcher captures

Compiler/package/platform pin is unchanged: TypeScript 5.9.3 from the local lock.
`capture-direct.mjs` runs the genuine command `tsc`, not a rewritten Node argv.
Its isolated PATH is the assigned worktree's `node_modules/.bin`, followed by
`/usr/local/bin:/usr/bin:/bin`. A real `tsc --version` returned `Version 5.9.3`
before each capture stage. `npm_config_offline=true` and `npm_config_yes=false`
prevent package acquisition for the npx stages. stdout is a complete pipe Buffer,
stderr is separately captured and empty for every successful compiler case. All
six compiler cases exited 0; presentation stays unknown. No path/newline/ANSI
normalization is performed. Original argv and each CWD are in `cases.json`.

The fresh disposable project is
`/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/t01-tsc-direct`.
It contains only the five `refs/**` inputs from the original project table, with
identical initial contents. Stage `initial` captures initial and immediately
up-to-date reference builds. Change only lib's value from `42` to `43`; stage
`incremental` captures the unchanged-declaration incremental build. Stage `npx`
then invokes `npx tsc` and `npx --no-install tsc` from the assigned worktree, using
the actual absolute project argument to the disposable refs. Stage `force` captures
`tsc -b refs --verbose --pretty false --force` in the disposable project's CWD.

Replay from the assigned worktree:

```sh
T01_PROJECT=/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/t01-tsc-direct node fixtures/profiles/tsc/capture-direct.mjs initial
# Change refs/lib/index.ts from 42 to 43 after the initial build.
T01_PROJECT=/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/t01-tsc-direct node fixtures/profiles/tsc/capture-direct.mjs incremental
T01_PROJECT=/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/t01-tsc-direct node fixtures/profiles/tsc/capture-direct.mjs npx
T01_PROJECT=/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/t01-tsc-direct node fixtures/profiles/tsc/capture-direct.mjs force
```

The first npx attempt from the isolated project failed before executing the
compiler. The recorder surfaced stderr and stopped instead of inventing a native
compiler capture:

```text
npm error code ENOTCACHED
npm error request to https://registry.npmjs.org/tsc failed: cache mode is 'only-if-cached' but no cached response is available.
npm error A complete log of this run can be found in: /Users/gustavoschneiter/.npm/_logs/2026-10-08T18_55_28_092Z-debug-0.log
```

The subsequent genuine worktree-local npx invocations succeeded using the installed
package, as recorded. No failed argv was relabeled as a successful direct command.

## Approved implementation receipt

Lead instruction (2026-10-08): "APPROVE repeated identical timestamp-prefix removal
for COMPLETE success plain verbose referencebuild: firsttimestamp retained,
identical subsequentgroup timestamps omitted; body/projectpath/statusreason/metrics/order
newline stayexact." Also explicitly authorized exact refusal of build-metrics-lists
until that combined grammar is fully bound. The earlier policy/launcher blockers
are superseded by this approval and the genuine launcher captures above.

| Native case | Test name suffix | Native → independent expected bytes | Actual saving |
| --- | --- | ---: | ---: |
| direct-build-initial | direct-build-initial | 671 → 645 | 26 |
| direct-build-up-to-date | direct-build-up-to-date | 443 → 417 | 26 |
| direct-build-incremental | direct-build-incremental | 679 → 653 | 26 |
| npx-build-up-to-date | npx-build-up-to-date | 1307 → 1294 | 13 |
| npx-no-install-build-up-to-date | npx-no-install-build-up-to-date | 1307 → 1281 | 26 |
| direct-build-force | direct-build-force | 551 → 512 | 39 |

Every positive runs `T01 public-filter native golden: <suffix>` in
`tests/profile-tsc.test.ts`, through the real core `filter` with `familyProfiles`.
The independently hand-authored source-only goldens retain all event bodies,
explicit timestamp changes, ordered list paths, reasons and original line endings.
Independent assertions also bind literal required project paths, all original
event bodies/newlines and first timestamps of each group to required source spans.
The original 18 Node cases retain their exact argv and passthrough status; their
public-filter test names are `T01 original Node capture stays exact: <name>`.
Historical proposal goldens remain separate artifacts, not executable expectations
for unsupported Node commands. Original metrics/list/error/silent content is also
tested against the admitted direct build command with a forged exit 0, so argv
refusal alone cannot conceal missing grammar preservation.

Closed argv: direct `tsc`, `npx tsc`, `npx --no-install tsc`; first build flag
`-b` or `--build`; exactly one project argument; exactly one `--verbose` and one
`--pretty false`; optional single `--force`. No watch, project compilation,
incremental flags, clean, dry, shorthand verbose, extra projects, metric/list flags,
unknown switches or added launchers are admitted. Plain successful reference
solutions only: unique ordered default `tsconfig.json` paths, final listed solution
root bound to the requested project, every earlier project ending in one recognized
state. States cover missing build-info, changed input, up-to-date, forced rebuild,
dependency declarations unchanged and corresponding output timestamp update.
Rebuild/update actions must agree with the immediately preceding state and project;
absolute action origins must agree across the report. Missing events, unexpected
lines/contexts, inconsistent paths, unknown version text, duplicates, reordered
statuses or missing/extra terminal blank lines refuse the entire output.

Scope limits: a solution root with its own compile event, non-default config names,
other out-of-date reasons, metrics/list combinations and diagnostic output remain
exact. `Observation` has no producer-version field; the fixture pin is 5.9.3 and
unknown version/banner/cache-version grammars are refused, but another binary
emitting identical admitted text cannot be distinguished. No core/type/renderer
change or producer-authentication claim is made. Unknown presentation with ANSI
and nonzero failures stays exact; dynamic text is emitted only as source spans.
Only the captured `presentation: unknown` boundary is admitted. A terminal-rendered
observation is refused too, so the existing core normalizer cannot turn original
ANSI into a reduction through this profile. Project-list aliases are checked for
canonical duplicate identities; emitted evidence remains original source text.

Baseline red: the new focused suite against the original delegated stub had all
six positive native golden assertions fail (30 tests, 10 failures including other
new admission assertions). Each positive continues to assert that unchanged legacy
`formatProfiles` cannot satisfy the same reduction golden. Implementation checkpoint:
30 focused tests passed, no skips; `npm run typecheck` exited 0. Initial implementation
checks exposed a no-op missing-header test mutation and a CRLF terminal refusal;
the mutation was made non-vacuous and CRLF terminal recognition was corrected.
The first compiling implementation checkpoint `13494a0` was pushed before the
production mutation probe; its source is the restored reference for the receipt below.

Actual family-local corpus economy: six reductions total 4,958 → 4,802 UTF-8 bytes
(156 bytes saved). Including the 18 exact-only original Node cases: 19,366 → 19,210
bytes. These measurements use the six direct-launcher goldens, not the historical
104-byte proposal subtotal. Default registry is unchanged, so no default-registry
reduction or installed-package integration claim is made.

## Production mutation and restored checks

Probe changed only `src/profiles/tsc.ts`: the repeated-time branch emitted and
declared only `[row.span[1] - 1, row.span[1]]` instead of the complete source-backed
body `[row.span[0] + prefix.length, row.span[1]]`. This deliberately erased native
project bodies while retaining newlines. The existing public core accepted the
mutant's smaller output, making the independent tests the necessary oracle.

```sh
node --import tsx --test --test-name-pattern='public-filter native golden|independent project-list' tests/profile-tsc.test.ts
```

Result: exit 1, all seven selected tests failed, no skipped selected tests. Every
native positive failed exact golden equality. The independent evidence assertion
failed with `Event body not required: Building project '/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/t01-tsc-direct/refs/lib/tsconfig.json'...`.
The original source branch was restored with apply_patch; `git diff --exit-code --
src/profiles/tsc.ts` confirmed equality with the pushed compiling checkpoint.

Restored focused check:

```sh
node --import tsx --test tests/profile-tsc.test.ts
npm run typecheck
```

Result: all 30 tests passed, zero failures/skips, typecheck exited 0. An earlier
typecheck attempt was terminated by the shell tool's 120,000 ms timeout; retry
with a 300,000 ms deadline exited 0. The post-restoration typecheck also exited 0.
The timeout is preserved here, not relabeled as a compiler failure or ignored green.
No full tests/check/build/smoke/benchmark/CI were run. Production profile is 113
physical lines; focused test file is 206 physical lines, both below the 400-LOC
target. Native fixture whitespace findings remain intentional and unmodified.
Lead review, registry integration and campaign-wide final verification remain
lead-owned; this branch is not merged.

## Binding fix captures

Cold review reproduced a false binding: the old `canonical()` erased leading
parents and absolute roots, so the `refs/tsconfig.json` report reduced for argv
`../refs` and `/refs`. Three public-filter refusal/property tests were added before
the fix; all three failed on that implementation, after proving the matching
`refs` positive still reduced. The properties rename projects to `renamed`,
`Project Refs` and `REFS`, preserving quoted-argument, whitespace and case binding.

`sameDots()` now removes only complete `.` path components. It preserves every
`..`, leading absolute slash and letter case; repeated separators and interior
parent components are unsupported. The requested root and reported root must have
the same path form after this limited dot normalization. No filesystem, CWD,
environment, realpath or case-folding inference occurs in production. Absolute
project displays require exact absolute action paths. Parent-relative displays
with absolute rebuild/update actions refuse because their relationship needs CWD.

Original direct and npx native/golden files remain byte-for-byte unchanged. The two
original npx argv are absolute while their reports are parent-relative; runtime
`Observation` has no CWD. Preserving those two *reductions* would contradict the
required refusal of unproven relations. Their manifest dispositions therefore now
say passthrough, with original argv and goldens retained as historical evidence.
The own-profile tests explicitly verify binding refusal, not launcher rejection.

Two additional genuine npx executions restore finite launcher reduction witnesses
using relative argv that match the reported path forms exactly. Compiler remains
locally lock-pinned 5.9.3; real `tsc --version` returned `Version 5.9.3`. Same
isolated PATH/offline settings, host, complete stdout/empty stderr boundary and
unknown presentation as before. Both exited 0. Each new native argv/CWD is recorded
unchanged in `cases.json`; no old command was rewritten. Replay from the worktree:

```sh
T01_PROJECT=/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/t01-tsc-direct node fixtures/profiles/tsc/capture-direct.mjs npx-relative
```

The recorder calculates the actual relative project argument before launching npx.
Both committed executions used eight `../` components followed by
`var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/t01-tsc-direct/refs`.
New hand-authored source-only goldens omit two identical 13-byte time prefixes per
case, preserving all list paths, reasons, bodies and mixed/terminal newlines.
Six admitted captures: 4,958 → 4,789 bytes, saving 169. Full 26-case native corpus,
including the two newly exact-only original npx cases: 21,980 → 21,811 UTF-8 bytes.

Production binding mutation replaced only `sameDots()` with the previous blanket
parent/root stripping. The selected `root binding|original npx root relation`
tests failed 6/6, exit 1, zero skips, reproducing both false path equivalence and
unsafe original npx admission. Restored only that owned production line via
apply_patch. Post-restoration focused suite/typecheck receipts follow in this file.

Restored check: `node --import tsx --test tests/profile-tsc.test.ts` passed all 36
tests, zero failures/skips; `npm run typecheck` exited 0. The native inventory test
independently measured/asserted the 21,980 → 21,811 corpus byte ledger. `git diff
--exit-code` over all original direct/npx native-and-golden directories confirmed
they remain unchanged. Only owned source/test/fixture files changed. No shared
core/types/registry/CI edits, filesystem I/O in the profile or full checks were made.
Runtime CWD authentication remains unavailable; unproven cross-form relations
stay exact instead of inheriting the old unsafe admission.
