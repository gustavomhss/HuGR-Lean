# HuGR-Lean

An [OpenCode](https://opencode.ai) plugin with a standalone CLI and library for reducing large tool
outputs. The plugin can summarize shell logs, file reads and web pages, storing originals for
lossy summaries in a local recovery store. The CLI and library do not require OpenCode.

Local and deterministic: no network calls, no extra model calls, no runtime dependencies. MIT.

## Published version and safety scope

[0.4.0 is published](https://github.com/gustavomhss/HuGR-Lean/releases/tag/v0.4.0).
An audit found preservation gaps in that artifact's summarize mode: carriage-return cleanup can
remove failure text without recall, long or boundary-crossing failure blocks can be cut, and
read summaries can exceed the nominal cap. Use `"mode": "lossless"` for the conservative plugin
path, or standalone `hugr-lean filter`.

This checkout contains **unreleased fixes** for those cases, corrected recovery text, plugin-wide
input limits and raw-store failure handling. Installing `hugr-lean@0.4.0` does not install these
fixes. The API descriptions below include the current source behavior; historical measurements
and published-artifact warnings remain scoped to 0.4.0.

## What it does

After each tool call, before the result is sent to the model:

- **bash** output above 4 KiB keeps about 1.5 KiB of head, 1.5 KiB of tail and the failure lines.
  Failure detection uses text patterns, not semantic understanding; it cannot identify every diagnostic.
  In the current source, recognized failure blocks on failed/unknown commands have no continuation
  length cap, including across head/tail boundaries. The published 0.4.0 limitations above apply.
- **read** replacements use an 8 KiB budget including their host wrapper and continuation footer,
  excluding recall. If no complete row fits, the original is kept. **webfetch** uses an 8 KiB
  content budget plus marker/recall overhead. Neither promises a strict 8 KiB final tool message.
- Lossy summaries include a recovery ID. Use `hugr-lean recall <id>` in a terminal or the plugin
  tool `lean_recall`; published 0.4.0 incorrectly names `lean recall` in its footer. Records can expire
  or be evicted, so recovery is not permanent. Current-source footers name `hugr-lean recall`.
- Carriage-return overwrite collapse is lossy and requires recovery, even below the shell summary
  threshold. Failed/unknown commands or output with recognized failure terms retain CR frames;
  ANSI/CRLF normalization and repeated-line marking can still change presentation.
- Other rewrites include ANSI/carriage-return cleanup, marking repeated lines,
  compacting read line-number prefixes, source-backed views for `glob`, `grep`, directory reads and
  some MCP JSON/accessibility snapshots, and 20 built-in profile IDs for common test/build tools
  (Cargo, pytest, Go, Node TAP, tsc, ESLint/Biome, Git status, ripgrep, ...).
- A summary is never larger than its input. Tool metadata, titles and attachments are not touched.

## Numbers

Offline replay of `summarize()` with the 0.4.0 defaults over 27 recorded OpenCode session databases
(343,045 tool calls, 1,626.1 MB of tool output):

| Scope | Calls | Before (MB) | After (MB) | Tool reduction | Share of total |
| --- | ---: | ---: | ---: | ---: | ---: |
| **All tools** | 343,045 | 1,626.1 | 955.3 | — | **41.3%** |
| bash | 138,373 | 538.9 | 224.7 | 58.3% | 19.3% |
| read (file) | 101,309 | 764.7 | 483.9 | 36.7% | 17.3% |
| webfetch | 6,561 | 103.6 | 40.6 | 60.8% | 3.9% |
| grep | 24,252 | 100.5 | 94.4 | 6.0% | 0.4% |
| glob | 13,570 | 17.7 | 11.2 | 36.6% | 0.4% |
| read (directory) | 6,383 | 9.9 | 9.7 | 1.3% | 0.0% |
| other tools | 52,597 | 91.3 | 91.3 | 0% | 0% |

**41.3% is an upper bound.** The replay cannot see the extra calls a model makes to get omitted
content back (`lean_recall`, or a `read` with a further `offset`); each adds bytes back. The corpus
is one developer's private sessions, and these are UTF-8 bytes, not tokens or cost. This specific
replay has no committed reproducer or machine-readable aggregate receipt. A separate historical
[12-pair A/B](https://github.com/gustavomhss/HuGR-Lean/pull/163) is inconclusive, so net savings
and task quality remain unestablished. These numbers do not measure later fixes. Recorded method,
mechanism breakdown and sensitivity:
[docs/BENCHMARK_REAL.md](https://github.com/gustavomhss/HuGR-Lean/blob/v0.4.0/docs/BENCHMARK_REAL.md#lean-20-summarize-replay-2026-10-12).

## Install

Requires Node 22+. For the OpenCode plugin, add the package to the `plugin` list of your `opencode.json`
(global `~/.config/opencode/opencode.json` or a project `opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["hugr-lean"]
}
```

Restart OpenCode. It installs the package from npm on startup. Use tools as usual; nothing needs a prefix.
To pin a version, write `"hugr-lean@0.4.0"`.

For the `hugr-lean` command line (recall, raw store maintenance), install it globally too:

```sh
npm install -g hugr-lean
hugr-lean doctor
```

Without a registry download during installation, download `hugr-lean-<version>.tgz` and its `.sha256` from the
[GitHub releases](https://github.com/gustavomhss/HuGR-Lean/releases), check the hash, run
`npm install -g ./hugr-lean-<version>.tgz`, and put the `pluginURL` printed by `hugr-lean doctor`
in the `plugin` list instead of `"hugr-lean"`.

## Configuration

Options go in a tuple. Every field is optional. The mode and limits below use default values;
explicitly setting `raw` also opts into saving material conservative rewrites:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [["hugr-lean", {
    "mode": "summarize",
    "summarize": {
      "shellThresholdBytes": 4096, "headBytes": 1536, "tailBytes": 1536, "errorBytes": 4096,
      "readCapBytes": 8192, "webfetchCapBytes": 8192, "readLineNumbers": false
    },
    "raw": { "maxBytes": 67108864, "ttlMs": 604800000 },
    "enabled": true,
    "automatic": true,
    "excludeCommands": [],
    "maxInputBytes": 4194304
  }]]
}
```

- `mode`: `"summarize"` (default) or `"lossless"`. Lossless is the 0.3 conservative behavior:
  profiles and views preserve their declared evidence; no lossy summaries or recall line.
- `summarize`: byte thresholds. `readLineNumbers: true` keeps read's `N: ` prefixes.
- `raw`: the local store of originals. Default directory `~/.cache/hugr-lean/raw` (set `directory` to change it),
  64 MiB of serialized records, seven-day lazy expiry; in summarize mode the oldest records are
  evicted when full by default. `"evict": false` rejects new writes at capacity instead.
  Current-source eviction happens after publication; crashes or cleanup errors can leave extra
  records above admission limits. This is not a strict disk quota.
  `"raw": false` disables storage, which also disables summaries (non-summary rewrites remain).
- `enabled: false` turns the plugin off. `automatic: false` disables the automatic views.
  `excludeCommands` lists shell commands left alone (literal prefix followed by a space/tab, or
  an exact match after leading whitespace).
  In current source, `maxInputBytes` (default 4 MiB, configurable 1–16 MiB) bounds every native
  string path before processing or storage; larger input stays unchanged. MCP keeps its aggregate
  text cap. Published 0.4.0 did not apply this limit to all summarize paths.
- Invalid options disable the plugin rather than guess.

## Getting originals back

The model has a `lean_recall` tool, registered by the plugin. It takes the `id` from the recovery
line and an optional 1-based line range such as `"120-240"`.

From a terminal:

```sh
hugr-lean recall <id>                 # the exact original
hugr-lean recall <id> --lines 120-240 # one line range
hugr-lean raw list                    # stored records
hugr-lean raw purge                   # delete all stored records
```

Add `--directory PATH` for a custom store. A missing or expired record prints `unavailable` and exits 2.

## Recovery and privacy boundaries

- The conservative filter APIs and CLI retain failed, unknown or incomplete observations. Summarize
  mode has a different contract and is not a semantic guarantee that every failure detail survives.
- Before publishing a result classified as a lossy summary, the plugin stores the original. If
  storing fails, it keeps the previous text. Published 0.4.0 misclassifies some destructive shell
  cleanup as a rewrite, as noted above.
- Unsupported native tool formats, MCP `isError` results, attachments and binary content are not
  summarized. Eligible MCP text blocks may still receive conservative automatic views.
- Host truncation happens before the plugin runs: the stored original is what OpenCode captured,
  not more.
- The package makes no network requests, telemetry or model calls. OpenCode still sends tool results
  to its configured model; a recalled original enters that same flow. This is not a redaction tool.
- Local records are unencrypted and may contain secrets. Restrict the directory and ACLs; POSIX
  mode checks do not verify extended ACLs, and Windows ACLs are caller-managed. Expiry is lazy,
  not a scheduled secure erase. See [SECURITY.md](https://github.com/gustavomhss/HuGR-Lean/blob/delivery/github-ready/SECURITY.md).

Tested host: OpenCode 1.18.17 on macOS. CI runs the package tests on Linux, macOS and Windows;
Linux and Windows OpenCode hosts are not separately proven.

## Uninstall

1. Remove `hugr-lean` from the `plugin` list and restart OpenCode.
2. Optionally delete stored originals: `hugr-lean raw purge` (add `--directory PATH` for a custom store).
3. If installed globally: `npm uninstall -g hugr-lean`.

## Standalone use

OpenCode is optional. Install `hugr-lean` locally for imports or globally for its command:

```sh
npm install hugr-lean@0.4.0
npm install -g hugr-lean@0.4.0
hugr-lean filter --command 'cargo test' --exit-code 0 --complete < captured-output.txt
```

Supply the actual exit/completeness facts for the captured output. `--command` describes an
already executed command; the CLI never runs it. Missing/failed facts, unsupported output,
malformed UTF-8 or input over 4 MiB pass through byte-exactly. The CLI's exit 0 means filtering
succeeded, not that the observed command succeeded. `filter` has no summarize mode and does
not create recovery records. Use `--format` for explicit supported structured formats.

Library entrypoints are separate from the default OpenCode plugin:

```ts
import { filter, summarize, recoveryLine } from "hugr-lean/core";
import { RawStore } from "hugr-lean/raw";
```

- `filter`, `filterAutomatic` and `filterStructured` perform conservative source-backed reductions
  using explicit execution facts. Keep the original when the result has no `replacement`.
- `summarize` is pure and performs no storage. It returns `unchanged`, `rewritten` or `summarized`.
  For `summarized`, your integration must store the original successfully, append
  `recoveryLine(id)` and provide recall. On storage failure, return the original. It does not
  register a host tool or connect itself to other agents. Bound direct inputs yourself: there is
  no `maxInputBytes` summarize option. Current-source observations support `automatic: false`
  when your integration has already run the automatic pipeline.
- `RawStore` handles local persistence independently. Direct construction defaults to no eviction;
  the OpenCode summarize adapter enables eviction unless overridden. A stored ID is temporary,
  not a durable archive. `hugr-lean recall`, `raw get`, `raw list` and `raw purge` work standalone.
- Neither the pure core nor the CLI establishes compatibility with other hosts. Each integration
  must map actual tool facts, storage, recovery and model-visible output itself.

Full API usage: [core manual](https://github.com/gustavomhss/HuGR-Lean/blob/delivery/github-ready/src/core/MANUAL.md),
[CLI manual](https://github.com/gustavomhss/HuGR-Lean/blob/delivery/github-ready/src/cli/MANUAL.md),
[raw manual](https://github.com/gustavomhss/HuGR-Lean/blob/delivery/github-ready/src/raw/MANUAL.md).

## Development

```sh
npm ci
npm run check   # structure, typecheck, tests, build
npm run smoke   # pack, install and inspect the tarball
```

See [CONTRIBUTING.md](https://github.com/gustavomhss/HuGR-Lean/blob/v0.4.0/CONTRIBUTING.md),
[SECURITY.md](https://github.com/gustavomhss/HuGR-Lean/blob/v0.4.0/SECURITY.md),
[CHANGELOG.md](https://github.com/gustavomhss/HuGR-Lean/blob/v0.4.0/CHANGELOG.md) and
[NOTICE](https://github.com/gustavomhss/HuGR-Lean/blob/v0.4.0/NOTICE) for third-party fixture provenance.

## License

MIT. See [LICENSE](LICENSE).
