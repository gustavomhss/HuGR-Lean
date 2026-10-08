# HuGR-Lean

Small, local, deterministic tool-output filtering **before model ingestion**.
One TypeScript package. MIT. Offline filtering. No runtime dependencies or extra model calls.

## Install and enable

Node 22+, npm and Git. Public source destination: [gustavomhss/HuGR-Lean](https://github.com/gustavomhss/HuGR-Lean).
The delivery candidate is **pending human approval**, not a new release.
Before running commands, replace only `FULL_REVIEWED_DELIVERY_SHA` in the assignment below
with the full 40-character lowercase hexadecimal SHA from the approved delivery PR and its
candidate evidence receipt. Until approval
and that receipt exist, this installation recipe is not an approved installation target.
Never substitute floating `main` or a branch tip for the reviewed snapshot.
Run these commands from a directory where you want a fresh clone. Choose an unused folder name
(shown here as `hugr-lean-reviewed`), and stop if any command fails:

```sh
(
set -eu
HUGR_LEAN_COMMIT=FULL_REVIEWED_DELIVERY_SHA
node -e 'const sha = process.argv[1] ?? ""; if (sha.length !== 40 || !/^[0-9a-f]{40}$/.test(sha)) { console.error("Expected approved full 40-character lowercase commit SHA"); process.exit(1); }' "$HUGR_LEAN_COMMIT"
git clone https://github.com/gustavomhss/HuGR-Lean.git hugr-lean-reviewed
cd hugr-lean-reviewed
git checkout --detach "$HUGR_LEAN_COMMIT"
HUGR_LEAN_HEAD=$(git rev-parse --verify HEAD)
test "$HUGR_LEAN_HEAD" = "$HUGR_LEAN_COMMIT"
npm ci
npm pack
node --input-type=module -e "import { readFileSync } from 'node:fs'; import { createHash } from 'node:crypto'; console.log(createHash('sha256').update(readFileSync(process.argv[1])).digest('hex'));" ./hugr-lean-0.2.0.tgz
npm install -g ./hugr-lean-0.2.0.tgz
hugr-lean doctor
)
```

The subshell stops on failure: invalid SHA syntax fails before clone; failed source selection
or a mismatched HEAD stops before npm. Syntax and identity checks do not grant human approval.
`npm pack` runs `prepack`, which builds `dist` before creating the tarball. Global installation
uses your npm prefix; it must be writable (a user-owned prefix works), with its executable
directory on `PATH`. The package version remains `0.2.0` pending a human release/version decision.
This locally built tarball is not claimed to be byte-identical to the original release asset.
Record its absolute path, SHA-256 and source commit for upgrade/rollback.
See [distribution status](docs/DISTRIBUTION.md) for identities and [delivery status](docs/DELIVERY.md)
for dated code-baseline proof, pending final docs-artifact binding, deferred CI and human decisions.
The new repository is source-only;
old release assets and npm publication are not implied by its existence.

Copy `pluginURL` from doctor into your OpenCode configuration:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///absolute/installed/path/hugr-lean/dist/index.js"]
}
```

Quit and restart OpenCode. Continue using tools normally; commands need no prefix.
Verified local host route on **2026-10-08**, code baseline `f9d2f6c8540b9bc3479de59cbd301074f1ff80df`:
**OpenCode 1.18.17, macOS x64, legacy `opencode run`**, using a local model mock.
Private local receipts record 1,026 passing tests, installed-package/latency proof and 23 host scenarios:
7 file, 5 package-name, 8 baseline/on replays across four native families, and 3 raw scenarios with exact CLI recovery.
File/package-name routes use the same preinstalled normal tarball, not npm registry availability.
Native fixture text replay proves model-bound bytes, not upstream recapture or model quality.
This docs head is not yet packed; scoped package/runtime-blob binding remains pending before claiming equivalence.
Linux/macOS/Windows CI is unrun. Actions stays disabled until complete candidate verification
is recorded and the lead explicitly declares completion.
Other host routes require their own proof. Doctor reports the installed file URL; it does not test OpenCode.

Npm registry installation is not currently available. If publication is authorized, the package
name can be used as the plugin entry; dated package-name proof used a locally installed/cached tarball.

## Behavior and coverage

Supported native grammars: Cargo test/build, pytest, Go verbose tests, Node/tsx TAP tests, Jest, Vitest,
English Git status and numbered ripgrep. Coverage is deliberately format-specific; see
[coverage matrix](docs/COVERAGE.md).

- Unknown commands, malformed/new formats, failures and incomplete/truncated results stay exact.
- Every reduction must preserve declared evidence and be smaller in UTF-8 bytes.
- Original summaries remain exact; supported passing-test progress can disappear after count validation.
- The adapter changes only model-visible text. Native command, title, metadata and attachments remain host-owned.
- Host truncation happens before the hook: raw recovery means the exact captured boundary, not full process stdout.
- The OpenCode after-hook filters only `bash` results; it never rewrites command argv or performs core/profile I/O.

[Native utility evaluation](docs/UTILITY_EVALUATION.md) records original local fixture projects:
25 cases (12 reduced, 11 material, 13 exact) passed at the dated code baseline, with deliberate
long names and many tests. These are not representative real-agent sessions. Normal installed
proof passed 39 cases / 10 IDs (nine reducers and inert `tsc`); final docs-artifact binding is pending.
Jest/Vitest retain their existing prefix/per-file-timing strategy; no utility improvement is claimed.

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
