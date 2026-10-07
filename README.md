# HuGR-Lean

Small, local, deterministic tool-output filtering **before model ingestion**.
One TypeScript package. MIT. Offline filtering. No runtime dependencies or extra model calls.

## Install and enable

Node 22+, npm and Git. Public source destination: [gustavomhss/HuGR-Lean](https://github.com/gustavomhss/HuGR-Lean).
The delivery candidate is **pending human approval**, not a new release.
Before running commands, replace `FULL_REVIEWED_DELIVERY_SHA` with the full 40-character
commit SHA from the approved delivery PR and its candidate evidence receipt. Until approval
and that receipt exist, this installation recipe is not an approved installation target.
Never substitute floating `main` or a branch tip for the reviewed snapshot.
Run these commands from a directory where you want a fresh clone. Choose an unused folder name
(shown here as `hugr-lean-reviewed`), and stop if any command fails:

```sh
git clone https://github.com/gustavomhss/HuGR-Lean.git hugr-lean-reviewed
cd hugr-lean-reviewed
git checkout --detach FULL_REVIEWED_DELIVERY_SHA
npm ci
npm pack
node --input-type=module -e "import { readFileSync } from 'node:fs'; import { createHash } from 'node:crypto'; console.log(createHash('sha256').update(readFileSync(process.argv[1])).digest('hex'));" ./hugr-lean-0.2.0.tgz
npm install -g ./hugr-lean-0.2.0.tgz
hugr-lean doctor
```

`npm pack` runs `prepack`, which builds `dist` before creating the tarball. Global installation
uses your npm prefix; it must be writable (a user-owned prefix works), with its executable
directory on `PATH`. The package version remains `0.2.0` pending a human release/version decision.
This locally built tarball is not claimed to be byte-identical to the original release asset.
Record its absolute path, SHA-256 and source commit for upgrade/rollback.
See [distribution status](docs/DISTRIBUTION.md) for identities and [delivery status](docs/DELIVERY.md)
for pending local proof, deferred CI and human decisions. The new repository is source-only;
old release assets and npm publication are not implied by its existence.

Copy `pluginURL` from doctor into your OpenCode configuration:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///absolute/installed/path/hugr-lean/dist/index.js"]
}
```

Quit and restart OpenCode. Continue using tools normally; commands need no prefix.
Historically verified host route: **OpenCode 1.18.17, macOS x64, legacy `opencode run`**.
Candidate Node 22 core/CLI/storage CI on Linux, macOS and Windows remains pending;
Actions stays deferred until recorded complete local verification and explicit lead completion.
Other host routes require their own proof. Doctor reports the installed file URL; it does not test OpenCode.

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

Disable with `enabled:false`, or remove the plugin entry; quit and restart OpenCode.

Keep the previous tarball at a distinct absolute path and record its source SHA and SHA-256.
Build the approved candidate in a separate checkout using the recipe above; retain its tarball
at another path and record its own checksum. Both may report `0.2.0`: version and basename
do not identify bytes. Recompute the checksum before each installation and compare it with
the record for that exact local artifact. Replace the example paths before running:

Upgrade:

```sh
npm install -g "/absolute/path/new-snapshot/hugr-lean-0.2.0.tgz"
hugr-lean doctor
```

Rollback when needed:

```sh
npm install -g "/absolute/path/previous-snapshot/hugr-lean-0.2.0.tgz"
hugr-lean doctor
```

After either install, update the config with doctor's
current `pluginURL` and quit/restart OpenCode. Raw records survive disable, upgrade, rollback
and uninstall; existing expiry/size limits still apply. Rollback does not promise that older
storage code can read newer record schemas.

To remove: remove the plugin entry and quit OpenCode. Keep raw data by omitting purge.
To delete retained records, run `hugr-lean raw purge` before uninstall; for a custom store,
run `hugr-lean raw purge --directory "/absolute/path/custom-store"` for each configured store.
Purge deletes validated records, including unexpired ones. Then run `npm uninstall -g hugr-lean`
and restart OpenCode.

## Development and modules

```sh
npm ci
npm run structure
npm run typecheck
node --import tsx --test --test-concurrency=2 tests/*.test.ts
npm run build
npm run smoke
npm pack --dry-run
```

Test-file concurrency is bounded at 2; internal subprocess tests remain unchanged.
`npm test` and `npm run check` retain their default file scheduling. Run `npm run benchmark`
separately after other checks finish, recording environment and background load. Local checks
do not dispatch CI, prove another OS, recapture the historical corpus or authorize publication.

[Core](src/core/README.md) · [Profiles](src/profiles/README.md) · [Raw](src/raw/README.md) ·
[OpenCode](src/opencode/README.md) · [CLI](src/cli/README.md).
Each module includes ownership, maintenance, instruction manual and blast-radius documents.
Target 400 LOC/file; allow 600; tolerate 750; above 750 split. CI checks logical code lines and documentation presence.

[Benchmarks](docs/BENCHMARK.md) distinguish native fixture savings from synthetic latency workloads.
[Real-world evaluation](docs/BENCHMARK_REAL.md) executes unchanged commands in pinned projects and reports zero-savings cases, preservation and overhead separately.
[Host proof](docs/OPENCODE.md) uses a local model mock, including actual model-bound requests.
Selected [TRS fixtures](fixtures/runners/SOURCES.md) carry pinned source paths, hashes and MIT notices;
production parsers are original TypeScript. See [NOTICE](NOTICE) and [licenses](licenses/TRS-MIT.txt).
