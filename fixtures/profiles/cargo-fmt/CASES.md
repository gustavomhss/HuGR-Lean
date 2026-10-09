# C04 capture-only case map

Schema: `hugr-lean/native-cases/1`; flat records in `cases.json`. All statuses are
proposed `passthrough`; `expectedFile` references original native bytes. No parser
or public-filter test has been written. Source/recipe/output hashes: `sha256.txt`.

| ID (`C04/`) | Native variant | Exit / bytes | Required evidence |
| --- | --- | --- | --- |
| default-clean | plain `fmt --check`, clean independent workspace | 0 / 0 | Exact empty output |
| default-diff | plain check, clean + malformed formatting workspace | 1 / 185 | Entire diff and filename; ignores default-members |
| package-clean | `--package c04-clean` in mixed workspace | 0 / 0 | Exact empty output; dirty package not selected |
| package-diff | `--package c04-dirty` | 1 / 185 | Entire diff and filename |
| packages-diff | repeated `-p`, clean + dirty | 1 / 185 | Entire diff and filename |
| workspace-failed | `--all`, clean + dirty | 1 / 185 | Entire diff and filename |
| verbose-clean | `--verbose -p c04-clean` | 0 / 264 | Target/source identity and rustfmt command/path |
| verbose-diff | `--verbose -p c04-dirty` | 1 / 449 | Target/source identity, rustfmt command/path, entire diff |
| syntax-failed | `--manifest-path broken/Cargo.toml` | 1 / 311 | Error, filename/position, snippet, delimiter markers |
| help | `fmt --help` | 0 / 762 | Complete help, options, descriptions |
| workspace-clean-all | `cargo fmt --all --check`, original clean two-crate workspace | 0 / 0 | Exact empty EOF; all five source/manifest hashes unchanged |

All removable-byte proposals: 0. Disposition: exact-only; investigate whether any
native successful variant has safely removable material before parser work. Silent
outputs are not reduction witnesses. Failed outputs remain exact regardless of future
grammar recognition. Required source spans will use UTF-16; sizes above use UTF-8.

Acceptance/test-name column is intentionally deferred: capture-only scope, no
baseline-red/green or mutation proof asserted. Lead review must decide material policy
before converting this packet into implementation acceptance tests. Existing Cargo
build/test fixtures are referenced in SOURCES.md, not duplicated here.

Supplement stable ID `C04/workspace-clean-all`: native
`output/workspace-clean-all.output`, independent expected inline empty string,
desired passthrough, removable bytes 0. Receipt `supplement-receipt.json` binds
original argv, environment, tools, source before/after, separate streams and EOF.
Acceptance name: `verify-supplements.mjs` in adjacent go-build fixture directory.
This narrow reader/public-filter check now covers existing cases plus supplement;
source/receipt/EOF controls measured. Failed diff whitespace remains byte-exact.
