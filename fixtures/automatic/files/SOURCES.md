# Native file-tool grammar fixtures

Fixtures in `native.json` are **synthetic**, not real host captures. `host-grep.jsonl` is an exact real-host hook capture supplied by WP E. OpenCode version under contract: 1.18.17.

Grammar references (MIT), pinned `anomalyco/opencode@02546dfc2e4515a4f90aaf9ceb3890df2ac2b479`:
- https://raw.githubusercontent.com/anomalyco/opencode/02546dfc2e4515a4f90aaf9ceb3890df2ac2b479/packages/opencode/src/tool/glob.ts
- https://raw.githubusercontent.com/anomalyco/opencode/02546dfc2e4515a4f90aaf9ceb3890df2ac2b479/packages/opencode/src/tool/grep.ts
- https://raw.githubusercontent.com/anomalyco/opencode/02546dfc2e4515a4f90aaf9ceb3890df2ac2b479/packages/opencode/src/tool/read.ts

No donor code copied. Original synthetic examples reproduce native output layout; Windows/UNC cases test literal lossless path handling. Modifications: none to upstream material; independently authored parser/tests.

View grammar: glob `PREFIX:\nSUFFIX\n...`; grep keeps `Found N matches\n`, then `PREFIX:\n`, then original groups with relative path headers and verbatim match lines. Prefix includes final separator; concatenate literally, never normalize paths. Directory removes only `<entries>`/`</entries>` tags, retaining original path/type header, every entry and exact count footer. File output is never transformed. Count/completeness contradictions and unsupported syntax refuse. Strict byte shrink is enforced by shared automatic core.

Local mutation evidence (2026-10-10): changed suffix start from `start + length` to `start + length + 1` in BOTH emitted and required spans; focused independent glob/grep decoders failed exact full-path comparisons (`src` became `rc`). Restored, then shortened final grep tail by one character in BOTH emitted and required spans; grep decoder failed exact match-text comparison (`text` became `tex`). Restored again. Final `npx tsx --test tests/auto-files.test.ts` and `npm run typecheck` passed. These establish synthetic semantic-preservation coverage, not real-host capture or CI evidence.

## Supplied real grep reproducer

- Source directory: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/automatic-host-C8O5s1`.
- Original `hooks.jsonl` copied verbatim to `host-grep.jsonl`; SHA-256 `b30f0aab179ddd1ed55447984c7c46930518da5e50591908b137bbb1dc94e470`. Both complete before/after events retained, including title, metadata, input, timestamps and identity flags. No path/text normalization or packet redaction.
- Installed binary from `argv.json`: `/Users/gustavoschneiter/.opencode/bin/opencode`. `version.json` records exit 0, stdout `1.18.17\n`, empty stderr. Version artifact SHA-256 `6c4520bdbfd10e53c882c55892204037516696a19c844e6682fa8d97812f375e`.
- Actual argv: `["--log-level","INFO","run","--format","json","--model","hugr-mock/boundary","--title","Automatic proof","Execute requested native tool once, then finish."]`. Cwd: source directory + `/project`. Original `argv.json` SHA-256 `4ebbfc7b873fe5d621423de42215817cc77a5f65c3d37daf7ad56079a64e356e`; environment remains in original artifact, not copied here.
- Hook event: first record `phase=before`, `at=1791652750727`, tool `grep`, call `automatic_call`, session `ses_ed92cb233ffew0YF6Fo9vobbOW`; actual args and full native output reside in copied record. Second record is unchanged `phase=after`, `at=1791652750768`: original installed proof did not reduce.
- Metadata is exactly `matches:3, truncated:false`; header count 3 agrees. Native match text retained LF, yielding three LF between groups and one final LF. Regression replays this received packet through the reducer; it does not claim a new installed-host run. Same-file multiple matches/empty-text LF extension remains explicitly synthetic in tests. No Windows/other-version native capture claimed.
- Modifications: none to capture; grammar expanded only for native LF layout plus former no-LF synthetic layout. Entire colon/match/blank-byte tails remain emitted and required; independent decoder reconstructs exact original output bytes and ordered path/line/text associations. Unknown nonempty rows, truncation notices and inconsistent metadata still refuse.
- Fix verification: regression initially reproduced `passthrough` for actual capture and same-file synthetic extension. After fix, seven focused tests and typecheck passed. Mutation changed BOTH emitted and required suffix starts by +1: actual capture full-path/byte oracle failed. Restored; mutation shortened final tail by one in BOTH emission and required spans: actual capture final-LF byte oracle and former synthetic match-text oracle both failed. Restored; final focused suite/typecheck passed. No new installed-host run or CI claimed.

## Grep compact-framing ambiguity fix (2026-10-10)

- Cold review: a legal suffix such as `  Line 9: report` made its compact `SUFFIX:` header indistinguishable from a match row; two distinct accepted `matches:4` packets produced identical views. Fix: grep factoring refuses (original preserved) when any suffix is empty, begins with any whitespace, or contains CR/LF/VT/FF/NEL/U+2028/U+2029. Trailing `:` stays accepted (exactly one appended colon removed). Glob unaffected.
- Test decoder now classifies compact lines strictly (blank / leading-space match row / header) and fails on whitespace-led headers. Collision regression (both inputs) plus an enumerated round-trip/injectivity property over fixtures and adversarial suffixes; all synthetic, no new host run.
- Mutation: guard removed -> collision and property tests failed; restored -> passed.
