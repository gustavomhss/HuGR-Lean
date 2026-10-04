# HuGR-Lean

Small, local, deterministic tool-output filtering **before model ingestion**.
One TypeScript package. MIT. Offline filtering. No runtime dependencies or extra model calls.

## Install and enable

Node 22+, npm and Git. Build the **reviewed integration snapshot**, pinned to
[`ae4c3b5b5d444f80207c119c2fdc794f5cd954ff`](https://github.com/gusmhs/HuGR-Lean/commit/ae4c3b5b5d444f80207c119c2fdc794f5cd954ff).
This is not a new release; `main` still points to the older release.
Run these commands from a directory where you want a fresh clone. Choose an unused folder name
(shown here as `hugr-lean-reviewed`), and stop if any command fails:

```sh
git clone https://github.com/gusmhs/HuGR-Lean.git hugr-lean-reviewed
cd hugr-lean-reviewed
git checkout --detach ae4c3b5b5d444f80207c119c2fdc794f5cd954ff
npm ci
npm pack
npm install -g ./hugr-lean-0.2.0.tgz
hugr-lean doctor
```

`npm pack` runs `prepack`, which builds `dist` before creating the tarball. Global installation
uses your npm prefix; it must be writable (a user-owned prefix works), with its executable
directory on `PATH`. The package version remains `0.2.0` pending a human release/version decision.
This locally built tarball is not claimed to be byte-identical to the original release asset.
See [distribution status](docs/DISTRIBUTION.md) for source, tag and artifact identities.

Copy `pluginURL` from doctor into your OpenCode configuration:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///absolute/installed/path/hugr-lean/dist/index.js"]
}
```

Quit and restart OpenCode. Continue using tools normally; commands need no prefix.
Verified host route: **OpenCode 1.18.17, macOS x64, legacy `opencode run`**.
Core/CLI/storage CI runs Node 22 on Linux, macOS and Windows. Other host routes require their own proof.

When npm registry publication is available, `hugr-lean@0.2.0` can be used as the plugin package name;
the package-name loading route has been tested with a locally installed tarball.

## Behavior and coverage

Supported native grammars: Cargo test/build, pytest, Go verbose tests, Jest, Vitest,
English Git status and numbered ripgrep. Coverage is deliberately format-specific; see
[coverage matrix](docs/COVERAGE.md).

- Unknown commands, malformed/new formats, failures and incomplete/truncated results stay exact.
- Every reduction must preserve declared evidence and be smaller in UTF-8 bytes.
- Original summaries remain exact; supported passing-test progress can disappear after count validation.
- The adapter changes only model-visible text. Native command, title, metadata and attachments remain host-owned.
- Host truncation happens before the hook: raw recovery means the exact captured boundary, not full process stdout.

## Options and raw recovery

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [["file:///absolute/installed/path/hugr-lean/dist/index.js", {
    "enabled": true,
    "excludeCommands": ["git"],
    "maxInputBytes": 4194304,
    "raw": false
  }]]
}
```

Defaults: enabled; 4 MiB input limit (configurable 1–16 MiB); raw off.
Invalid options disable filtering. Enable raw with `"raw": {}` or a `directory`, `maxBytes`, `ttlMs` object.
Raw stores material reductions only: at least 1 KiB and 10% saved. Defaults: 64 MiB serialized records,
seven-day lazy expiry; full store preserves existing records and makes the current reduction fail open.
Use a caller-private local directory. IDs and plugin diagnostics are never appended to normal tool output.

```sh
hugr-lean raw list
hugr-lean raw get ID
hugr-lean raw purge
```

Custom stores use `--directory PATH`. Raw get returns exact text or exit 2 with `unavailable`.

## Library

```ts
import { filter } from "hugr-lean/core";

const result = filter({
  source: "shell", command: "cargo test", output: toolOutput,
  termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown",
});
const modelText = "replacement" in result ? result.replacement : toolOutput;
```

Only supply execution facts the host actually exposes. Core and profiles perform no filesystem/network I/O.

## Lifecycle

Disable with `enabled:false`, or remove the plugin entry; restart OpenCode.
Upgrade by installing the newer tarball/version and restarting. Uninstall by removing the config entry,
optionally running `raw purge`, then `npm uninstall -g hugr-lean`; restart OpenCode.

## Development and modules

```sh
npm ci
npm run check
npm run smoke
npm run benchmark
```

[Core](src/core/README.md) · [Profiles](src/profiles/README.md) · [Raw](src/raw/README.md) ·
[OpenCode](src/opencode/README.md) · [CLI](src/cli/README.md).
Each module includes ownership, maintenance, instruction manual and blast-radius documents.
Target 400 LOC/file; allow 600; tolerate 750; above 750 split. CI checks logical code lines and documentation presence.

[Benchmarks](docs/BENCHMARK.md) distinguish native fixture savings from synthetic latency workloads.
[Real-world evaluation](docs/BENCHMARK_REAL.md) executes unchanged commands in pinned projects and reports zero-savings cases, preservation and overhead separately.
[Host proof](docs/OPENCODE.md) uses a local model mock, including actual model-bound requests.
Selected [TRS fixtures](fixtures/runners/SOURCES.md) carry pinned source paths, hashes and MIT notices;
production parsers are original TypeScript. See [NOTICE](NOTICE) and [licenses](licenses/TRS-MIT.txt).
