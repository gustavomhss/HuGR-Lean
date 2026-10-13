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
- **Order.** All 48 runs are shuffled with a fixed seed (4242) and executed by 8 parallel workers, with
  launches spaced 3 s apart. Both arms are interleaved in time, so provider-side drift and machine load hit
  both arms alike. (The owner allowed up to 25 parallel sessions. The bench machine has 16 GiB of RAM, 7 GiB
  of swap in use and under 1 GiB of free disk, so 25 sessions would have swapped the disk full; the first
  launch at 25 was stopped before any session started, and the parallelism was lowered to 8.)
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
  workspace, up to 3 attempts, and the retries are counted and published. The same applies when the host
  disk filled up during the run (`No space left on device`/`ENOSPC` in a tool output or OpenCode's stderr).
  New runs only start while at least 600 MiB of disk is free. If the subscription hits a usage
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

**Status: partial, first benchmark.** 24 valid sessions (12 base, 12 lean), not the 48 of the protocol.
Model `openai/gpt-6-luna`, OpenCode 1.18.17, `hugr-lean@0.4.0` defaults, run on 2026-10-13.
Aggregate data: [`bench/results/ab-0.4.0.json`](../bench/results/ab-0.4.0.json) (per run and per task) and
[`bench/results/ab-0.4.0-lean-effect.json`](../bench/results/ab-0.4.0-lean-effect.json) (bytes Lean removed).

### Headline

| Measure (12 base/lean pairs) | Change with Lean | 95% CI (bootstrap over pairs) |
| --- | ---: | ---: |
| Total input tokens (uncached + cached + cache write) | **−20.6%** | [−40.5%, +13.1%] |
| Uncached input tokens | −1.4% | [−18.7%, +21.3%] |
| Output tokens | +0.1% | [−17.0%, +19.8%] |
| Tool output bytes the model received | **−47.9%** | [−60.0%, −30.1%] |
| Wall time | +7.7% | [−30.4%, +94.7%] |
| Task success | base 11/12, lean 11/12 | no drop |

- **What is clearly measured:** Lean cut the tool output that reached the model by about half, without a drop in
  task success. In the 12 lean sessions it summarized 17 tool outputs, from 476.5 KB of original output to
  109.4 KB (−77%), and the model never called `lean_recall` (0 calls): it did not need any omitted part back.
- **What is not yet shown:** the token saving. The point estimate is −20.6% total input, but its 95% CI runs from
  −40.5% to +13.1%, so 12 pairs cannot rule out no effect. Run-to-run variation of the agent itself is as large as
  the effect: the four pairs in which Lean summarized nothing still moved by −5.5% in total, and single tasks
  moved by −42% (t3) and +111% (t7) with zero summaries. Those two numbers are agent noise, not Lean.
- **Uncached input barely moved** (−1.4%). Most input in these sessions is cached prefix re-read on every call.
  A smaller tool output is only a small part of the uncached input of the next call, but it is then re-read as
  cached prefix on every later call, which is where the saving appears.
- The pre-declared stratified estimate is −23.4% [−32.3%, −12.4%], but five tasks have one run per arm and add no
  variance to it, so its CI is too narrow to rely on. The pair bootstrap above is the honest interval.

### Per task

`n=1, no CI`: one run per arm, no interval possible. With two runs per arm the bootstrap interval is crude
(only a few distinct resamples). Wall times are not comparable between runs: see the limitations.

| Task | Success base | Success lean | Input tokens base: median (mean) | Input tokens lean: median (mean) | Change of mean, 95% CI | Tool output bytes change | Lean summaries / recalls | Wall time base → lean (median s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| t1-rust-semver | 1/1 | 1/1 | 327.3k (327.3k) | 259.2k (259.2k) | -20.8% (n=1, no CI) | -45.8% (n=1, no CI) | 3 / 0 | 223 → 193 |
| t2-go-pflag | 1/1 | 1/1 | 278.2k (278.2k) | 126.0k (126.0k) | -54.7% (n=1, no CI) | -63.6% (n=1, no CI) | 1 / 0 | 451 → 164 |
| t3-py-more-itertools | 1/2 | 2/2 | 291.4k (291.4k) | 168.8k (168.8k) | -42.1% [-57.0, -16.1] | -41.7% [-46.0, -37.4] | 0 / 0 | 1334 → 802 |
| t4-vitest-ufo | 1/1 | 1/1 | 108.7k (108.7k) | 98.3k (98.3k) | -9.6% (n=1, no CI) | 4.1% (n=1, no CI) | 1 / 0 | 263 → 1053 |
| t5-git-review | 2/2 | 2/2 | 165.3k (165.3k) | 117.3k (117.3k) | -29.0% [-43.6, -10.5] | -64.2% [-78.0, -45.9] | 7 / 0 | 136 → 141 |
| t6-ci-log | 2/2 | 2/2 | 176.1k (176.1k) | 137.4k (137.4k) | -22.0% [-59.0, 116.4] | -56.0% [-76.0, 26.3] | 4 / 0 | 101 → 144 |
| t7-large-file | 2/2 | 1/2 | 91.5k (91.5k) | 193.2k (193.2k) | 111.2% [69.6, 177.3] | 19.0% [-0.7, 45.1] | 0 / 0 | 677 → 717 |
| t8-control | 1/1 | 1/1 | 50.3k (50.3k) | 39.6k (39.6k) | -21.4% (n=1, no CI) | -55.3% (n=1, no CI) | 1 / 0 | 140 → 979 |

Descriptive splits, **chosen after seeing the data** (not pre-declared, for orientation only): pairs in which Lean
summarized at least one output (8 pairs): −28.7% total input; pairs with no summary (4 pairs): −5.5%. Without the
t3/r3 pair, whose base run timed out at 25 minutes on the overloaded machine: −13.3%.

### t7-large-file, lean r1 (the one lean failure)

The hidden check failed because `__all__` in `more.py` was not sorted: the agent first put `pairwise_diff`
after `permutation_index`, then "fixed" it to after `peekable`, which is still wrong (`pai` < `par`). The same
agent placed it correctly in more.pyi. Lean did **not** summarize anything in this session (0 summaries,
0 recalls); every `read` was a small offset/limit window (largest 3.5 KB), well under the 8 KiB read cap, and the
agent saw the exact `__all__` lines it edited. The only Lean change in the session was the lossless read view
that drops the `N: ` line-number prefixes. So truncation did not hide anything and no recall was missed; the
failure is an ordering mistake of the model. One open observation: both t7 lean sessions used 16 model calls
against 7 and 10 for base, and lean r1's first patch failed to apply. Whether reads without line numbers make
edits in a large file harder cannot be decided from two runs; `summarize.readLineNumbers: true` is the A/B to try.

### Excluded attempts (infrastructure, not task failures)

The bench machine ran out of disk while other workloads ran (load average up to 250, 7 GiB swap, at times
under 250 MiB free). These attempts were discarded as the protocol says and are listed in the results JSON:

| Cell | Attempt | Reason | Outcome |
| --- | ---: | --- | --- |
| t7-large-file lean r3 | 1 | `ENOSPC` during the session (951 s) | redone, valid |
| t7-large-file lean r3 | 2 | OpenCode exited after 36 s without a session (disk full) | redone, valid |
| t3-py-more-itertools lean r1 | 1 | `ENOSPC` in a pytest output, then the 25-min timeout | redone, valid |
| t3-py-more-itertools lean r3 | 1 | `ENOSPC` in a pytest output, then the 25-min timeout | redone, valid |
| t1-rust-semver base r1 | 1 | no session (disk full) | not rerun (outside the 24-record plan) |
| t2-go-pflag base r2 | 1 | no session (disk full) | not rerun |
| t4-vitest-ufo lean r3 | 1 | workspace clone failed with `ENOSPC`, no session | not rerun |

No provider rate limit or usage limit was hit. No retries were needed for provider errors.

### Deviations from the pre-declared protocol

1. **24 instead of 48 sessions.** Midway, the owner stopped the benchmark at half. The remaining cells were
   chosen to complete base/lean pairs with the same run index (every task has at least one pair; t3, t5, t6 and
   t7 have two), not by looking at results.
2. **Parallelism** 8, then 6 and 2 for the completion runs, instead of up to 25 (disk and memory; see the
   protocol note). Arms stayed interleaved within each batch.
3. **t5 ground truth was wrong in the harness.** It named `tests/test_more.py` as the most changed file, but
   `git diff --numstat v10.8.0 v11.0.0` gives `more_itertools/more.py` 692 changed lines against 627. All four
   t5 sessions (both arms) had answered `more_itertools/more.py`. The value was fixed and the t5 sessions were
   re-scored from each session's own `ANSWER.json` write (`bench/rescore.mjs`); the same re-scorer reproduces the
   original verdicts of all four t6 sessions. The self-test could not catch this: it checks the checker against
   its own expected values.
4. **Disk-full precedence.** The first harness version let a timeout hide an `ENOSPC` in the session; two t3 lean
   sessions were reclassified as infrastructure failures and redone. The harness now checks disk-full first.
5. **Pair bootstrap added** as the primary interval, because the pre-declared stratified bootstrap gives cells
   with a single run zero variance.
6. **Timeout rule applied as declared.** t3 base r3 hit the 25-minute timeout and counts as a failure with its
   370k tokens, although the machine was overloaded at that time and no `ENOSPC` appeared in that session.

### Limitations

- **Small sample.** 12 pairs; most tasks have one pair. The token CI includes zero. Treat the per-task numbers
  as examples, not estimates.
- **Overloaded, shared machine.** Other sessions on the same Mac drove the load average to 250 and filled the
  disk. Test suites ran more than 15 times slower than on an idle machine (pytest from about 20 s to over 300 s), so wall
  times say nothing about Lean, and the timeout hit one base run.
- **One model, one host, one OS.** `gpt-6-luna` through OpenCode 1.18.17 on macOS; other models may use tool
  output differently.
- **Small public repos.** Their test outputs are often under Lean's 4 KiB shell threshold, so t1–t4 exercise
  Lean less than a large monorepo would. The control task (t8) was not neutral: `vitest run` output was large
  enough for one summary.
- **Tool output bytes are after Lean.** They show what the model received. Lossless rewrites (read line-number
  prefixes, grep/glob views) have no recall id, so their savings are inside the byte totals but not in the
  "bytes Lean removed" figure.
- **Isolation choices.** The user's global OpenCode plugins and `~/.claude` skills were disabled in both arms,
  so this is a clean OpenCode, not the owner's daily setup.
- Harness smoke tests used `gpt-6.1-sol`; none of those sessions is in any result.

## How to reproduce

```sh
export LEAN_BENCH_DIR=/path/with/space/lean-bench   # default: $TMPDIR/lean-bench
export OPENCODE_BIN=$(command -v opencode)           # OpenCode 1.18.17, logged in to OpenAI
node bench/prepare.mjs                                # clone pinned sources, build templates, install plugin
node bench/check.mjs --self-test                      # every check: template fails, reference passes
node bench/run.mjs --label full --runs 3 --parallel 6 --seed 4242
node bench/rescore.mjs --label full --task t5-git-review   # only needed for records made before the t5 fix
node bench/lean-effect.mjs --label full                     # bytes Lean removed (needs the local raw store)
node bench/analyze.mjs --label full --out bench/results/ab-0.4.0.json --md /tmp/tables.md
```

Needs git, Rust (cargo), Go, Python 3 with pytest, Node 22 and network access for the first `prepare`.
`run.mjs --resume` continues a stopped run; creating `results/<label>/STOP` stops it after the current runs.
