# Capture provenance and recipe

Original tiny fixture project and Python collector authored for L11; no donor fixture/parser copied.
Fixture code is MIT under the repository license. Installs are isolated, local, public npm only.
Root package, source, tests, registry and shared corpus wiring are outside this packet.

## Immutable producers

| Component | Installed version | npm gitHead / source commit | Repository path | License |
| --- | --- | --- | --- | --- |
| Frontend markdownlint-cli2 | 0.23.3 | `916ad0aaa108c64d294101002066f530ea170b10` | DavidAnson/markdownlint-cli2: `markdownlint-cli2.mjs`, `README.md`, `LICENSE` | MIT |
| Rules markdownlint | 0.41.1 | `e41e5a40ba934f079da0ffbdea0309869c034d47` | DavidAnson/markdownlint: `lib/`, `doc/CustomRules.md`, `LICENSE` | MIT |
| Native default formatter | 0.0.6 | `613b0e9e64eac8e51f0cdc645af0a6026f6cdf50` | DavidAnson/markdownlint-cli2: `formatter-default/markdownlint-cli2-formatter-default.js`, `formatter-default/LICENSE` | MIT |
| Requested JSON formatter | 0.0.10 | `24710a7febf3eb8b05a34da9078b40fa2133125b` | DavidAnson/markdownlint-cli2: `formatter-json/README.md`, `formatter-json/markdownlint-cli2-formatter-json.js`, `formatter-json/LICENSE` | MIT |

`npm-*.json` retains exact registry version/license/repository/gitHead/tarball/SRI metadata.
`package-lock.json` freezes the entire installed dependency closure with npm integrity values;
`package.json` pins frontend, rules and JSON formatter explicitly. Default formatter is lock-pinned.
`capture-receipt.json` retains downloaded tarball SHA-256 and verified SHA-512 SRI against registry
and lock, plus all installed files' SHA-256 for these four producers. Registry gitHead is recorded
source provenance, not a claim of independent git checkout authentication.

### Copied material / modifications

- Four `LICENSE-*.txt`: unmodified byte copies of respective pinned package `LICENSE` files.
  Receipt gives source repository path, license hash, version and commit.
- `SOURCE-EVIDENCE.md`: selected **verbatim** source/documentation line windows, headings and fences
  added. Each heading records package, immutable commit, upstream path and line interval. Complete
  installed source hashes retained in receipt; no production code imported.
- `package.json` / `package-lock.json`: unmodified copies of original isolated fixture install files.
- Native `.txt` inputs and `requested-results.json`: untouched process/report bytes, not donor edits.
- Candidate: explicit post-capture deletion of two progress rows; modification and byte delta declared
  in CASES and receipt. Not native bytes and not an accepted golden.

## Reproduce tiny native capture

Use a fresh isolated directory beneath the approved temporary workspace. Verify its parent first.
Copy this packet's `package.json` and `package-lock.json` there, then run:

```sh
npm ci --ignore-scripts --no-audit --no-fund
```

From the packet worktree, invoke collector with that isolated directory:

```sh
python3 fixtures/profiles/markdownlint/capture.py /absolute/path/to/fresh-isolated-install
```

Collector copies tiny `project/`, invokes installed `.bin/markdownlint-cli2` with explicit argv,
records each completed child exit, and writes capture artifacts only inside this packet.
Native stdout and stderr share **one OS pipe** (`stderr=STDOUT`), not a later concatenation.
`shell=False`, stdin DEVNULL, non-TTY, 30-second deadline; timeout bytes would be retained and
marked incomplete. Captured cases exited normally. Environment overrides and actual Node/npm/macOS
versions are in receipt. Paths resolve through macOS `/private/var`; no path rewriting applied.
OS pipe records byte arrival order, not a guarantee of logical producer chronology.

Use `--provenance-only` only to refresh pinned producer inventories/source windows for an existing
capture: it performs no native lint invocation and preserves original capture time/cases/bytes.
Initial capture used local `npm install --ignore-scripts --no-audit --no-fund`; reproduction uses
the captured lock with `npm ci`. No global install or repository dependency change.

JSON formatter uses documented config `outputFormatters` and options `{name, spaces}`. File report
is captured separately as `requested-results.json`. JSON stdout variant sets documented noBanner /
noProgress and absolute `name: /dev/stdout`. Official formatter `writeFile` emits JSON with no LF;
merged stdout captures preserve that EOF exactly. This is actual native formatter output, not a
collector serialization or invented CLI flag.

## Capture-only checks

Only capture artifact integrity/evidence inspection is allowed for this packet. No tests, typecheck,
package check, build, smoke, benchmark, CI, or public-filter execution. Lead independently reviews
before policy/admission; candidate savings are not implementation evidence.
