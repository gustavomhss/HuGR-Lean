# T01: native TypeScript capture packet

State: CAPTURED, proposal only. Base `07ffe15`, branch `campaign/native-v2/T01`.
This packet stops before parser work. `status: reduced` describes the independent
proposed golden, not a public-filter result. The current `formats.ts` diagnostic
stub returns `undefined`; `tsc.ts` delegates to it. Every public-filter case remains
exact at this baseline. No reduction support or campaign completion is claimed.

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

## Finite variants and dispositions

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

## Proposed evidence policy and blockers

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

## Checks recorded

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
