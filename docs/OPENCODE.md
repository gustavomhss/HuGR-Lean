# OpenCode boundary proof

For optional storage through the real host runtime, run `node scripts/opencode-raw-smoke.mjs`
after building. This verifies raw off/on, material retention, Unicode and exact Node CLI recovery.

## Tested host

The installed **OpenCode 1.18.17** macOS x86_64 binary supports the legacy
`tool.execute.after` hook on `opencode run`. Bun 1.3.14, Node 22.17.1.
No downgrade is needed. Compatibility claims apply to this tested CLI route;
the separate V2 core is not proven compatible.

Run the proof with your actual binary:

```sh
OPENCODE_BIN=/absolute/path/to/opencode node scripts/opencode-boundary.mjs
```

This executes native `/bin/sh` commands. A deterministic loopback-only
OpenAI-compatible HTTP/SSE model first requests `bash`; its next request must
contain the result. Controls prove raw sentinel without a plugin, changed
sentinel with a plugin, and unchanged native exit status 7. No external model
call is used. HOME, XDG paths, config, credentials, and working directory are
isolated. Missing binary, missing bash event, missing second request, mock
protocol errors, and timeout fail the script. Each CLI run has a 45-second limit;
timeout settlement does not wait for a child `close` event or inherited pipes.
The timer rejects independently, destroys both pipes, and best-effort kills the
main process/group; scenario cleanup then closes the mock and removes its root.
The mock records its first response's bash call and requires the immediately
next request to carry that exact call and its matching text result, checked
byte-for-byte against the native completion event. Intervening
requests, changed calls, mismatched result IDs, and extra requests are failures.
`HUGR_KEEP_SMOKE=1` retains the isolated artifacts for debugging.
OpenCode may install its pinned SDK from npm during startup. A stalled install
is a timeout failure, not a skip. To reuse a successful **isolated** install,
set `HUGR_SMOKE_DEPS=/retained/isolation/config/opencode`; only `node_modules`,
`package.json`, and `package-lock.json` are copied into the new isolated config.
No config or credential files are copied. This changes SDK bootstrap cost, not
the tested CLI/tool/hook/model route.

```sh
OPENCODE_BIN=/absolute/path/to/opencode node scripts/opencode-boundary.mjs --native
HUGR_PLUGIN=/absolute/path/to/compiled-plugin.js OPENCODE_BIN=/absolute/path/to/opencode node scripts/opencode-smoke.mjs
```

`--native` repeats timeout/truncation controls, tests raw ANSI/CR and stderr,
and executes real `git status` in a temporary repository. The package smoke uses a native fixture executable
named `cargo`, invoked as `cargo test`, to prove plugin wiring and a smaller
model-visible result with its exact summary. It also requires byte-exact
preservation of failed and unknown output and unchanged native metadata/title.
The failed fixture deliberately emits the same reducible Cargo grammar with
exit 101, so a missing failure guard cannot hide behind grammar fallback.
This fixture does not establish compatibility with every real Cargo format.
The compiled plugin is supplied by `HUGR_PLUGIN`; absence fails immediately.

`npm test` runs fast harness teeth tests using a fake host and the real local
HTTP/SSE mock. CI does not install or execute OpenCode. Real-host compatibility
requires the boundary scripts above; CI green alone is not that proof.

## Package-name loading and tuple options

The real **1.18.17** host also loaded the locally packed `hugr-lean@0.2.0` by
the literal specifier `hugr-lean`, using the adapter/build from lead baseline
`795df94902a64e86085d1f0a45cfadc8f6bfa68e`. The positive config was:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [["hugr-lean", { "enabled": true }]]
}
```

The Cargo fixture reached the next model request at **1058 → 248 UTF-8 bytes**,
with its exact summary and native metadata/title intact. Changing only the tuple
to `{ "enabled": false }` restored the complete original text. Reducible output
with native exit 101 and unknown Unicode/CRLF output both remained byte-exact.

This proves **host package-name loading from a preinstalled local tarball**.
It does not prove public-registry availability or a registry download. A direct
file import cannot establish this route: for npm names, this release chooses
`exports["./server"]` or `main`, not the package's `exports["."]` entry.

Reproduce after building the local package:

```sh
npm run build
OPENCODE_BIN=/absolute/path/to/opencode HUGR_SMOKE_DEPS=/retained/isolated/config/opencode node scripts/opencode-smoke.mjs --package
```

The script packs locally with lifecycle scripts disabled, installs the tarball
offline in an isolated OpenCode package cache, and mirrors its installed files
under the isolated SDK config's `node_modules/hugr-lean`. Config still contains
the bare name, never a file URL. `HUGR_TARBALL=/absolute/path/package.tgz` selects
an existing tarball instead. The script requires host version 1.18.17 because
the preinstallation/cache oracle is pinned to that release.

The private name-cache path is
`$XDG_CACHE_HOME/opencode/packages/hugr-lean@latest/node_modules/hugr-lean`.
`Npm.add` checks that installed package before registry access. Installing into
the SDK dependency tree alone does not populate this name-cache. An initial
offline install there failed loudly with `ENOTCACHED` for SDK registry metadata;
the proof instead installs the local tarball independently, without a registry
retry. The proven tarball SHA-256 is
`eb1e419f7e5ea60665bab9796a5099367e57dee90e0c21a347b03a878e353560`.

The retained SDK bootstrap used for these runs is:

```text
/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/hugr-opencode-EibkpQ/config/opencode
```

It contains the isolated 1.18.17 SDK install, not the user's config/credentials.
Use it as `HUGR_SMOKE_DEPS` on this machine. It is a temporary local artifact,
not a distributed dependency. `HUGR_KEEP_SMOKE=1` retains new proof artifacts.

Destructive control: `HUGR_PACKAGE_PROBE_NO_SERVER=1` removes `./server` only
from the isolated cached package manifest. The real host then returns the full
Cargo text and the smoke exits 1 with
`Package plugin did not reduce model-visible Cargo output`. The SDK-config copy
and the source package remain intact. A fresh unmodified install restores the
complete package-name/options proof.

## Actual adapter mapping

| Meaning | Proven legacy host field / behavior |
| --- | --- |
| Native command | `input.args.command`; completion event `part.state.input.command` |
| Tool identity | `input.tool === "bash"` |
| Replace model-visible text | Mutate `output.output` in place; return `void` |
| Exit status | `output.metadata.exit`: 0, nonzero, or `null` on timeout |
| Completeness | `output.metadata.truncated`: boolean |
| Raw/live preview | `output.metadata.output`; remains raw after text mutation |
| Saved host truncation | `output.metadata.outputPath` when truncated |
| Timeout evidence | `<shell_metadata>` suffix in `output.output`; observed `exit: null`, `truncated: false` |
| Native warning text | stderr merged into output; observed metadata keys remain `exit/output/truncated` |
| Presentation | ANSI CSI escapes and CR retained as raw text, not terminal-rendered |

Successful output has no automatic exit-status suffix in the model request.
Exit 7 remains in host metadata; the hook proof changes only text. The product
adapter must preserve failed, unknown, timed-out, and truncated output intact.
Do not infer completion from `metadata.output`, which is only a bounded preview.
The observed legacy metadata does not use V2's `timeout` or `warnings` fields.
Do not set `presentation: "terminal-rendered"` merely because the tool is bash.

With `tool_output: {"max_lines": 3, "max_bytes": 128}`, a 12-line native command
returned `truncated: true`, exit 0, a saved `outputPath`, and this tail wrapper
**before** the after-hook:

```text
...output truncated...

Full output saved to: /isolated/data/opencode/tool-output/tool_<id>

line-10
line-11
```

A 100-ms `printf timeout-start; sleep 3` call returned `exit: null` plus
`<shell_metadata>` timeout text, which reached the model unchanged. These native
controls were separately run against the installed host.

## Pinned upstream evidence

OpenCode release tag `v1.18.17` resolves to commit
`02546dfc2e4515a4f90aaf9ceb3890df2ac2b479` (MIT). Source is explanatory evidence;
the real CLI/model experiment is the compatibility oracle. No upstream
implementation was copied; this harness is original.

- [Legacy dispatch and mutable result](https://github.com/anomalyco/opencode/blob/02546dfc2e4515a4f90aaf9ceb3890df2ac2b479/packages/opencode/src/session/tools.ts): executes the native tool, then triggers `tool.execute.after` on its result.
- [Native shell metadata and tail wrapper](https://github.com/anomalyco/opencode/blob/02546dfc2e4515a4f90aaf9ceb3890df2ac2b479/packages/opencode/src/tool/shell.ts): `exit`, `truncated`, `outputPath`, timeout suffix, and raw preview.
- [Generic tool truncation](https://github.com/anomalyco/opencode/blob/02546dfc2e4515a4f90aaf9ceb3890df2ac2b479/packages/opencode/src/tool/truncate.ts): a distinct preview/count/hint wrapper; do not conflate it with native shell tail output.
- [Legacy plugin loading](https://github.com/anomalyco/opencode/blob/02546dfc2e4515a4f90aaf9ceb3890df2ac2b479/packages/opencode/src/plugin/index.ts): function exports return hooks; plugin tuple options are passed to that function.
- [Name resolution and server entry selection](https://github.com/anomalyco/opencode/blob/02546dfc2e4515a4f90aaf9ceb3890df2ac2b479/packages/opencode/src/plugin/shared.ts): bare names become `name@latest`; npm packages use `./server` or `main` and go through compatibility checks.
- [Installed private package cache](https://github.com/anomalyco/opencode/blob/02546dfc2e4515a4f90aaf9ceb3890df2ac2b479/packages/core/src/npm.ts): `Npm.add` returns an existing installed package before attempting reification.
- [SDK hook declaration](https://github.com/anomalyco/opencode/blob/02546dfc2e4515a4f90aaf9ceb3890df2ac2b479/packages/plugin/src/index.ts): declares the hook, but declarations alone do not establish dispatch.
- [Separate V2 bash boundary](https://github.com/anomalyco/opencode/blob/02546dfc2e4515a4f90aaf9ceb3890df2ac2b479/packages/core/src/tool/bash.ts): different structured `exit/truncated/timeout/warnings` shape and model status text. This is not the observed CLI mapping.
- [License](https://github.com/anomalyco/opencode/blob/02546dfc2e4515a4f90aaf9ceb3890df2ac2b479/LICENSE).

Config uses `$schema: "https://opencode.ai/config.json"`. Used provider, plugin,
permission, model, shell, and `tool_output` fields were checked against the
[published schema](https://opencode.ai/config.json) and accepted by the actual host.
The changed-sentinel control also proves `[fileURL, options]` tuple options reach
the plugin's default function. To enable a compiled plugin, add its file URL to
`plugin` in a schema-bearing config, then quit and restart OpenCode:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///absolute/path/to/compiled-plugin.js"]
}
```

To disable, remove that entry and restart. To upgrade, replace the compiled
plugin with the new build and restart. To remove, delete the entry before
removing its installed files. Package export names and product option keys
belong to the package adapter's public contract, not this boundary experiment.

## Destructive probe

Removing the sentinel mutation from the generated plugin made the real-host
script exit 1 with `Model-visible changed sentinel missing`. The hook still ran
and the second model request still arrived with raw text. Restoring the mutation
restored the proof. This distinguishes hook loading from model-visible mutation.
Removing the package smoke's metadata-equality guard made its preservation
teeth test fail with `Missing expected exception.` Restoring the guard restored
the test. The Cargo reduction oracle rejects an unchanged result and loss of
the exact summary, even if the host and mock otherwise finish successfully.
Restoring wait-for-close timeout behavior made the detached-pipe regression
fail at its watchdog; the test explicitly kills its escaped child in `finally`.
Allowing an intervening unrelated model request made the next-request regression
fail with HTTP 200 instead of 400. Both fixes were restored, and the installed
1.18.17 sentinel-removal probe was repeated against the stricter contract.
