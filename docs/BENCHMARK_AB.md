# Live A/B benchmark: HuGR-Lean 0.4.0 on real coding tasks

This benchmark runs the same coding tasks through OpenCode twice: once without HuGR-Lean (arm **base**)
and once with `hugr-lean@0.4.0` and its default options (arm **lean**, Lean 2.0 summarize mode).
Everything else is the same: model, prompt, workspace, OpenCode version and machine.
It measures what the provider bills as input, and whether the tasks still succeed.

The harness, task definitions, setup patches and checks are in [`bench/`](../bench).

## Pre-declared protocol

Written and committed before the full run; nothing below was changed after seeing full-run results.

- **Design.** 8 tasks × 2 arms × **3 runs** = 48 sessions. The owner chose n = 3 per arm per task to keep the
  wall time near one hour. With 3 runs per cell, per-task confidence intervals are wide; a per-task result is
  only called a difference when its whole 95% CI is on one side of zero.
- **Order.** All 48 runs are shuffled with a fixed seed (4242) and executed by up to 25 parallel workers, with
  launches spaced 3 s apart. Both arms are interleaved in time, so provider-side drift and machine load hit
  both arms alike.
- **Primary metric.** Total input tokens per session = provider-reported uncached input + cached input
  (cache read) + cache write, summed over every model call of the session, read from `opencode export` of that
  run's own session database.
- **Secondary metrics.** Uncached input, cached input, output and reasoning tokens; model calls; wall time;
  bytes of tool output in the session (after Lean, which is what the model saw); Lean summaries (tool outputs
  that carry a `[full output: lean recall …]` line); `lean_recall` calls; task success.
- **Success.** Decided only by the automatic check of each task after the agent exits (see the task table).
  A run that times out counts as a failure, with the tokens it used.
- **Statistics.** Per task: median and mean of each arm; change of means (lean ÷ base − 1) with a 95%
  percentile bootstrap CI (10,000 resamples of runs within each arm). Pooled: sum of per-task means of lean
  ÷ the same for base − 1, with a stratified bootstrap. Success rates per arm; any drop is flagged.
- **No outlier removal.** Every completed run is reported, failures and neutral cases included.
- **Infrastructure failures.** A run whose session never reached the model, or that ended with a provider
  error (rate limit, usage limit, overload, server error), is not a task failure: it is retried from a fresh
  workspace, up to 3 attempts, and the retries are counted and published. If the subscription hits a usage
  limit, the run stops and partial results are published as partial.
- **Model.** `openai/gpt-6-luna` for every run, through the existing OpenCode OAuth login. Sessions made
  earlier with other models (`gpt-6.1-sol` during harness smoke tests) are not part of any result.

## Tasks

| Id | Source (pinned) | What the agent must do | Where Lean can act | Automatic check |
| --- | --- | --- | --- | --- |
| t1-rust-semver | dtolnay/semver `280ebcb` | Fix a failing `cargo test` | cargo output | `cargo test` passes, `tests/` unchanged |
| t2-go-pflag | spf13/pflag `c966cfe` | Fix a failing `go test ./...` | go test output | `go test ./...` passes, `*_test.go` unchanged |
| t3-py-more-itertools | more-itertools `b21ec4e` | Fix a failing pytest suite | pytest output | `pytest` passes, `tests/` unchanged |
| t4-vitest-ufo | unjs/ufo `f06c800` | Fix a failing vitest suite | vitest output | `vitest run` passes, `test/` unchanged |
| t5-git-review | more-itertools `b21ec4e` (full history) | Answer 5 questions about `v10.8.0..v11.0.0` | `git log`/`git diff` (135 KB diff) | `ANSWER.json` equals the ground truth |
| t6-ci-log | pytest-dev/pytest run 37465844384 | Diagnose a saved `gh run view --log-failed` log (326 KB) | shell reads of the log | `ANSWER.json` equals the ground truth |
| t7-large-file | more-itertools `b21ec4e` | Add a function to `more.py` (175 KB, 5,644 lines), its stub and docs | large `read`s | hidden checker: placement, `__all__`, stub, docs, behaviour, tests |
| t8-control | unjs/ufo `f06c800` | Add one small exported function | little to nothing | hidden vitest file + full suite |

Setup state (minimal, deterministic, documented):

- t1: `src/eval.rs`, `matches_caret` ends with `ver.pre > cmp.pre` instead of `>=` (3 tests fail).
- t2: `flag.go`, `parseLongArg` ignores `--flag=value` for flags with `NoOptDefVal` (bool and count tests fail, then a test panics).
- t3: `more_itertools/recipes.py`, `consume` advances `n - 1` items instead of `n` (10 tests fail).
- t4: `src/utils.ts`, `JOIN_LEADING_SLASH_RE` no longer strips a bare leading `/` (7 tests fail).

The patches are `bench/tasks/<id>/setup.patch`. For t1–t4, t6, t7 and t8 the workspace is a fresh one-commit
git repository of the patched tree, so the injected bug cannot be read back from git history. t5 keeps the full
history because the task is about history. Hidden checks for t7 and t8 live outside the workspace and are copied
in only after the agent exits. `node bench/check.mjs --self-test` proves every check: each untouched template
fails, and each reference solution (reverse setup patch, ground-truth answer, or `reference.patch`) passes.

The t6 log is the output of `gh run view 37465844384 -R pytest-dev/pytest --log-failed`, fetched on
2026-10-13 and stored gzipped as `bench/tasks/t6-ci-log/run-37465844384.failed.log.gz`
(uncompressed SHA-256 `215fcd5b…c8c4bc`). GitHub shows only masked secrets (`***`). pytest is MIT-licensed.

## Environment and isolation

- OpenCode 1.18.17 (`opencode run --format json`), macOS, Node 22.17.1.
- Plugin: the npm tarball of `hugr-lean@0.4.0`, integrity-checked against the registry
  (`sha512-mN7VGI6M…kew==`), installed once and loaded by `file://` URL in the lean arm's project
  `opencode.json`. Options are the defaults.
- Project `opencode.json` in each workspace (identical except the `plugin` entry): declares the `gpt-6-luna`
  model under the `openai` provider, denies `webfetch`, `websearch` and `external_directory`, and turns off
  snapshots, sharing and autoupdate.
- `XDG_CONFIG_HOME` points at an empty bench config, so the user's global OpenCode plugins are not loaded in
  either arm; the user's config files are not changed. `OPENCODE_DISABLE_CLAUDE_CODE=1` keeps
  `~/.claude` skills and rules out of the prompt. Credentials stay where OpenCode keeps them and are never read
  by the harness.
- Each run gets its own copy-on-write workspace clone and its own session database (`OPENCODE_DB`), so the
  exported session is exactly that run's session.

## Results

Results are filled in after the full run.

## How to reproduce

```sh
export LEAN_BENCH_DIR=/path/with/space/lean-bench   # default: $TMPDIR/lean-bench
export OPENCODE_BIN=$(command -v opencode)           # OpenCode 1.18.17, logged in to OpenAI
node bench/prepare.mjs                                # clone pinned sources, build templates, install plugin
node bench/check.mjs --self-test                      # every check: template fails, reference passes
node bench/run.mjs --label full --runs 3 --parallel 25 --seed 4242
node bench/analyze.mjs --label full --out bench/results/ab-0.4.0.json --md /tmp/tables.md
```

Needs git, Rust (cargo), Go, Python 3 with pytest, Node 22 and network access for the first `prepare`.
`run.mjs --resume` continues a stopped run; creating `results/<label>/STOP` stops it after the current runs.
