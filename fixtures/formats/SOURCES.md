# Format corpus and support decisions

## Copied fixtures

Repository: https://github.com/dPeluChe/trs
Commit: `0175ae73f36709fd4a9242b2e431d026d6f82bb3`.
License: MIT, copyright (c) 2026 dPeluChe; upstream `LICENSE` at that commit.
The lead owns the central license/notice installation. No donor implementation was copied.
All five files are byte-exact copies: no modifications, renaming, normalization, or trimming.
The local basename equals the upstream basename under `tests/fixture_data/`.

| Upstream path | Git blob SHA-1 |
| --- | --- |
| `tests/fixture_data/jest_all_passed.txt` | `1c8ca11ecb09eac4c1bdfed65a35f9d9aa5ebf6f` |
| `tests/fixture_data/vitest_all_passed.txt` | `e00868cb113e2ac65f08d410b56509cb692f202d` |
| `tests/fixture_data/git_status_mixed.txt` | `2ea985e5c01b7c5845a57a8a8533ddd6af2c5108` |
| `tests/fixture_data/grep_single_file_multiple_matches.txt` | `aa3c1fed88b911a6a663026f85aee8edeb43aa6a` |
| `tests/fixture_data/lint_tsc_errors.txt` | `08edbed1adb28fe9f62ed3d4e43c3aac3f0b1c89` |

The directory's `.gitattributes` disables text conversion for `.txt` so Windows checkouts preserve these bytes.

## Native captures

`jest_native.txt`: Jest 30.2.0, `jest --runInBand --verbose --no-color`, Node 22.17.1/macOS.
Configuration: `{"rootDir":".","testMatch":["**/jest-native.test.cjs"],"testEnvironment":"node"}`.
`vitest_native.txt`: Vitest 3.2.4, `vitest run vitest-native.test.js --globals --no-color`, same host.
Committed reproduction inputs are `native/jest-native.test.cjs` and `native/vitest-native.test.js`;
both are byte-exact copies of the original authored scratch inputs. The Jest configuration above
is committed as `native/jest.config.json`; `native/vitest.config.mjs` supplies the original globals
option and limits discovery to the same test file. No donor code was used for these inputs.

Run these commands from `fixtures/formats/native`:

```sh
npx --yes --package=jest@30.2.0 jest --config=jest.config.json --runInBand --verbose --no-color
npx --yes --package=vitest@3.2.4 vitest run vitest-native.test.js --config=vitest.config.mjs --no-color
```

The historical captures used the scratch directory shown in the Vitest RUN banner. Reproduction
keeps the test names, basenames, hierarchy, and counts; root banner, clock, and timings vary by run.
These are native reporter streams; shell directory listings and npm bootstrap warnings are excluded.
If those launcher warnings occur in an observation, the full grammar rejects it and preserves it.

Config-only Jest collision regressions copy literal bytes from authored HuGR-Lean MIT commit
`362457b6cfe79b1d2ba7a70206a5d025b66c6100`, paths
`fixtures/profiles/jest/captures/{config-collision,config-full-collision}/input.txt`.
Git blobs: `61fee64e8ad954c4d960ca613138b9dbd432eaf6` and
`e83b741fc1a0573c1802faf1d366815bb2f3d94b`; sizes 160 and 196 UTF-8 bytes.
Modification record: literal escaping/concatenation only, no byte changes. Exact source/config,
license and merged-pipe EOF/exit/version facts live in that commit's `fixtures/profiles/jest/`
`SOURCES.md` and `config-capture-receipt.json`. Actual argv uses only `--config`, no reporter flag;
Jest package 30.2.0 / CLI 30.1.3 runs authored reporters. Tests pin bytes and preserve full rows.

## Admitted grammar

- Identity: direct `jest`, `vitest`, `git status`, `rg`, `tsc`; explicit `npx TOOL` or
  `npx --no-install TOOL`. No executable-path guessing or npm-script inference.
  Explicit Jest/Vitest reporter options do not match, including `--reporter=...`/`--reporters`.
- All reductions require complete shell observations, known exit 0, plain LF/CRLF output.
  ANSI/control-bearing output, warnings, failures, extra lines, and inconsistent summaries decline.
- Jest: one or more PASS suites, either all nonverbose or all verbose; optional nested describe
  headings with two-space depth increments; all tests passed. Suite and visible test totals must agree.
  Optional passing/empty snapshots, seed, time/estimate, and `Ran all test suites[ matching ...].`.
  Every complete source row is required evidence, including PASS/check markers, headings, blanks,
  timings and trailers. Config-only reporters can emit the entire grammar as user evidence;
  argv cannot authenticate its producer. Legacy plain Jest reduction is withdrawn: installed
  donor/native goldens equal raw bytes; validated equal-size streams return `not_smaller`.
- Vitest: optional RUN/version/root banner, passing file rows with positive test counts,
  consistent file/test summaries, start clock, total duration, optional known duration stages
  (`transform`, `setup`, `collect`, `import`, `tests`, `environment`, `prepare`).
  Every banner, full path/pass marker/test count, and summary is required source evidence.
  Vitest fixtures are exact-preservation witnesses; no timing removal is approved. Installed
  goldens must equal raw bytes. Plain Jest/Vitest preservation does not disable core-owned safe
  presentation normalization; grammar still validates rather than becoming a passthrough stub.
- English long Git status: branch/detached identity; optional initial/tracking/merge state;
  ordered staged, unmerged, unstaged, untracked sections; all native status/conflict labels;
  clean/unstaged/untracked footers. Ordinary output without staged entries or an explicit merge
  state requires a final native footer. Staged output and validated explicit merge variants may
  end after their complete entry sections. Tabs and the donor's two-space indentation are supported.
  Only enumerated fixed instructional lines before entries are removed. All other lines, including
  paths, rename arrows, known submodule annotations, conflict evidence, and blank lines remain exact.
  Paths are restricted to unquoted letters/marks/numbers/symbols, `_ . / @ + -`, and internal ASCII
  spaces. Quotes, backslashes, other punctuation, leading/trailing spaces, and ambiguous arrows
  decline. Rename/copy rows require exactly one ` -> ` and two nonempty valid paths. Only the
  native `new commits`, `modified content`, and `untracked content` suffix combinations are admitted
  on unstaged modified submodule rows. Exotic native paths, short/porcelain, localized status,
  rebase/sequencer detail, and unfamiliar advice decline; there is no C-escape parser.
- Ripgrep: explicit `-n`/`--line-number` mode is required in argv. The option scan understands known
  boolean bundles and value-taking search/glob/type/encoding/limit options; unknown options decline.
  Numeric-only bare paths decline because no-filename numbered output can have that same shape.
  Only `file:positive-line:content` records; consecutive equal full paths group under
  a source-backed path header. Each line number/content/line ending remains a required span.
  Match order, repeated matches, and nonconsecutive file order remain exact. Exactly one numeric
  colon delimiter per record is required: colon-bearing paths, Windows drive paths, column output,
  and content that could instead be a numeric path suffix decline. Ordinary content colons work.
- `tsc`: identity only, reduction always `undefined` (exact passthrough). Diagnostics can contain
  multiline message continuations and ambiguous path/position syntax. The donor fixture combines
  plain diagnostic lines with a pretty-mode summary; it is not proof of a complete native grammar.
  No install/lint grammar is admitted.

Reducers use source spans in UTF-16 and fixed formatting literals only. Tests measure UTF-8 bytes.
Fixed literals are limited to the core vocabulary: `''`, `' '`, `'\n'`, `':\n'`, `'- '`, `'+ '`.
Final size acceptance and engine integration remain the core's responsibility.
