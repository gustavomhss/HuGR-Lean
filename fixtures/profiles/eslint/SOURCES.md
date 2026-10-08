# L01 native sources and capture bounds

Original tiny project authored for this capture; repository MIT license applies.
No donor fixtures or implementation copied. Captured output is unmodified.
Absolute `/private/var` paths and process PID are authentic capture values, not tokens.

Public producer: ESLint **9.37.0**, MIT, npm registry `https://registry.npmjs.org`.
Published gitHead: `d5d1bdf5fdfad75197aadd3e894182135158c3b1` in
`https://github.com/eslint/eslint`. Tarball:
`https://registry.npmjs.org/eslint/-/eslint-9.37.0.tgz`.
Registry SHA-1: `ac0222127f76b09c0db63036f4fe289562072d74`.
Registry integrity:
`sha512-XyLmROnACWqSxiGYArdef1fItQd47weqB7iwtfr9JHwRrqIXZdcFMvvEcL9xHCmL0SNsOvF0c42lWyM1U5dgig==`.
Metadata queried with `npm view eslint@9.37.0 version gitHead license dist --json
--registry=https://registry.npmjs.org`. npm emitted a deprecation warning during
installation; installation output is not relabeled as ESLint output.

Native blank-spacing evidence: installed package path
`lib/cli-engine/formatters/stylish.js`, SHA-256
`6aaeac9741eed0902cb46d71db662f3c02b6dac286ef6f41f0b617b22e164228`.
Pinned source:
`https://github.com/eslint/eslint/blob/d5d1bdf5fdfad75197aadd3e894182135158c3b1/lib/cli-engine/formatters/stylish.js`.
Lines 30, 84, 101, 114 and 121 show leading LF, section/summary line endings and
empty clean output. Same pinned commit's `lib/cli.js:144` calls `log.info(output)`;
`lib/shared/logging.js:17–18` delegates to `console.log`, adding final extra LF.
Lines 67–68 show native
period stripping and absent rule handling. Source inspected, not copied or modified.

## Reproduction recipe

1. Use a disposable prefix, never global install:
   `npm install --prefix "$PREFIX" --registry=https://registry.npmjs.org --save-exact
   --ignore-scripts --no-audit --no-fund eslint@9.37.0`.
2. Copy `project/` into a tiny disposable project and copy `fix.before.js` to `fix.js`.
   Capture used prefix `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/l01-eslint`.
3. Set cwd to `$PREFIX/project`, prepend `$PREFIX/node_modules/.bin` to PATH,
   set `NO_COLOR=1`, unset `FORCE_COLOR`. Invoke each manifest `command` verbatim,
   in listed order, using `/bin/zsh -c '<command> 2>&1'` with stdout pipe.
   Actual native argv is each `argv` array: executable name **eslint**, not
   `node <cli.js>` or a relabeled launcher. The binary's own npm shebang starts Node.
4. Wait for child completion and pipe EOF; retain nonzero exits. Capture used
   Node `spawnSync`, UTF-8 decoding, 1 MiB maxBuffer; all children exited without
   signal, spawn/buffer error or residual stderr. No timeout/truncation occurred.
5. Keep fix source before and after execution. Hash output as UTF-8 SHA-256,
including every LF. Original exit/byte/hash facts live in `capture-receipt.json`;
normalized observations and current measured statuses live in `cases.json`.

Platform darwin-x64, Node v22.17.1, npm 10.9.2. Packet capture completed
2026-10-08T20:22:03.245Z. No start-time/duration measurement was taken.
Replays elsewhere change paths/PID; they need new provenance/hashes rather than
normalizing these raw fixtures. Dependency resolution remains npm's public tree;
only producer version is pinned, not a claim of hermetic transitive reproduction.
No artificial progress, verbose wrapper output, private registry or large project.

## Capture checks

Repository `npm ci --ignore-scripts --no-audit --no-fund` and `npm run typecheck`
completed successfully. Typecheck positive control used a disposable config extending
the same repository config/source/test includes plus `const captureControl: string = 1`;
it failed with TS2322. Control removed; original repository typecheck rerun successfully.
No full tests/build/check/smoke/benchmark/CI were run.

Disposable byte verifier checked every output length/hash against native capture facts,
JSON diagnostic/suggestion/fix/context facts and actual changed `fix.js` against after
source. It rejected added-LF corruption on each output and JSON file/message loss,
multiline-message truncation and fix-range corruption; original evidence rechecked.
Initial fixture transcription lost final stylish LF; hash check caught it. Restored LF;
all hashes now match original captures. These checks are capture verification, not
public-filter admission or preservation tests.

## Launcher supplements

Same installed 9.37.0, platform, cwd, PATH, NO_COLOR and completed merged pipe.
Added `project/unicode.js`, byte-identical to original `雪.js`, to use actual ASCII
argv without changing core. Executed real `eslint alpha.js unicode.js`, absolute
`$PREFIX/node_modules/.bin/eslint alpha.js unicode.js`, `npx eslint alpha.js unicode.js`
and `npx --no-install eslint alpha.js unicode.js`; `npm_config_offline=true` prevented
npx fetching. Exact command/argv and completion times are in normalized cases.
All four exited 0 with identical 724-byte output, SHA-256
`1af411f06156ac170256e07d883184dcb2bf91ab7e5077170eec99e0db056867`.
Stored once as `ascii-stylish.txt`; shared file records byte equality, not relabeling.
Literal frame-stripped goldens were authored before empty-family red test run.
Original receipt SHA-256:
`4fb9167df70e52a8fdd9567295eb15818e8c170fe40ad27e54f1c45049157d75`.
