# Native file-tool grammar fixtures

Fixtures in `native.json` are **synthetic**, not real host captures. WP E supplies real OpenCode captures separately. OpenCode version under contract: 1.18.17.

Grammar references (MIT), pinned `anomalyco/opencode@02546dfc2e4515a4f90aaf9ceb3890df2ac2b479`:
- https://raw.githubusercontent.com/anomalyco/opencode/02546dfc2e4515a4f90aaf9ceb3890df2ac2b479/packages/opencode/src/tool/glob.ts
- https://raw.githubusercontent.com/anomalyco/opencode/02546dfc2e4515a4f90aaf9ceb3890df2ac2b479/packages/opencode/src/tool/grep.ts
- https://raw.githubusercontent.com/anomalyco/opencode/02546dfc2e4515a4f90aaf9ceb3890df2ac2b479/packages/opencode/src/tool/read.ts

No donor code copied. Original synthetic examples reproduce native output layout; Windows/UNC cases test literal lossless path handling. Modifications: none to upstream material; independently authored parser/tests.

View grammar: glob `PREFIX:\nSUFFIX\n...`; grep keeps `Found N matches\n`, then `PREFIX:\n`, then original groups with relative path headers and verbatim match lines. Prefix includes final separator; concatenate literally, never normalize paths. Directory removes only `<entries>`/`</entries>` tags, retaining original path/type header, every entry and exact count footer. File output is never transformed. Count/completeness contradictions and unsupported syntax refuse. Strict byte shrink is enforced by shared automatic core.

Local mutation evidence (2026-10-10): changed suffix start from `start + length` to `start + length + 1` in BOTH emitted and required spans; focused independent glob/grep decoders failed exact full-path comparisons (`src` became `rc`). Restored, then shortened final grep tail by one character in BOTH emitted and required spans; grep decoder failed exact match-text comparison (`text` became `tex`). Restored again. Final `npx tsx --test tests/auto-files.test.ts` and `npm run typecheck` passed. These establish synthetic semantic-preservation coverage, not real-host capture or CI evidence.
