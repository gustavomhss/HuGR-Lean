# Automatic native views verification

Branch `feature/plug-and-play`, stacked on `feature/structured-tools` (`bd208ac`). Contract: [PLUG-AND-PLAY-PLAN.md](PLUG-AND-PLAY-PLAN.md), including its post-review revisions. Coverage: [COVERAGE.md](COVERAGE.md#automatic-native-views).

## Work packages and review

Six isolated packages (A JSON/CDP, B CLI, C files, D snapshots, E host proof, F browser capture) plus lead-owned core, renderer, registry, plugin, MCP adapter and CLI wiring. Component PRs stay open against this branch; the lead integrated reviewed commits by cherry-pick.

Seven independent cold reviews of the integrated candidate approved JSON, CDP sources and host-proof fidelity. They returned FIX-FIRST for:

- CLI: unbounded ffmpeg counters and `ls` link counts. Fixed with lexical int64/uint64 bounds before conversion and kernel PID limits; a live `ps` test that assumed reduction became deterministic (exiting processes print STAT `?`, which the grammar refuses).
- Files: grep prefix factoring let a path suffix such as `  Line 9: report` read as a match row; two distinct inputs produced identical output. Fixed by refusing ambiguous suffixes, including leading format characters and combining marks; a fuzz review (600k packets) found no remaining collision.
- Snapshots: hierarchy was not validated. Fixed with producer-specific depth and container rules.
- CDP tests: guard tests were vacuous (fixtures failed validation early). Rewritten with native-valid nodes and positive controls.
- Integration: a formatting getter could emit fabricated text; contradictory metadata passed the core; MCP parsing preceded the budget check. Follow-up reviews found further multi-read and post-save gaps in the plugin adapters (tool/args getters, content snapshot, packet changes during raw save, arguments changed during save). All fixed.

Every fix was re-reviewed cold until APPROVE. Two dead admissions found during documentation review were closed: native `list_mcp_resources`/`list_mcp_resource_templates` were routed with no reducer and are no longer routed.

## Local evidence

- Authors ran named tests, their own file once and a scoped typecheck. The lead ran, once each on the integrated tree: `npm run typecheck`; `tests/auto-{cli,files,snapshot,cdp,json}.test.ts`, `tests/automatic-{core,plugin}.test.ts` (117 passed before the last two plugin regressions; the plugin file then passed 12/12); `tests/{cli,plugin,structured-adapters,structured-core}.test.ts` (43); `tests/{real-integration,real-host-runner,real-host,utility-corpus,utility-evaluation,combined}.test.ts` (118 after fixing the historical `.txt` walker that failed on `fixtures/automatic/**`); `npm run structure`.
- Mutation probes: each guard was disabled or reverted to the pre-fix code, the named regression failed, the source was restored byte-identically and the same test passed. Lead probes covered contradictory metadata, formatting-getter snapshots in both renderers, budget-before-parse, CDP alias and budget guards, grep suffix guard, Playwright and Chrome hierarchy guards, CLI range gate and every adapter fix. Author and reviewer probes covered the remaining guards.

## Real host proof

Installed tarball in an isolated consumer, plain plugin entry with no options, real OpenCode 1.18.17 (macOS x64), pinned SDK `@opencode-ai/plugin@1.18.17`, local deterministic model, local MCP and isolated headless browser producers. Each passing case completed the tool call and showed exactly two model requests; the hook output equals the next model request.

First run on candidate `9d34282` (19 cases proved). Five cases hit their deadline before the host sent any model request, while the machine ran at load average 130–320 from an unrelated process; failures and artifacts are retained. Those five were rerun on `27f1948`, which includes the only later runtime change (`effc842`, native routing narrowed to `glob`/`grep`/`read`), with the native-read deadline raised from 120 s to 300 s; all passed. The CI fix `0d3177a` later narrowed bash `node` admission; no proof case uses `node` (the native JSON case runs `curl`).

| Case | Result | Bytes before → after |
| --- | --- | --- |
| native json (bash), glob, grep, directory read | reduced, associations exact | 794→704, 415→209, 566→360, 277→256 |
| MCP JSON, MCP JSON with image/audio/resource attachments | text blocks reduced, other blocks identical | 883→770, 908→795 |
| MCP error, truncated, blob resource, bash failure, truncation, unknown output, file read, opt-out | preserved exactly | — |
| Playwright `browser_snapshot {}` before/modal | all 10/14 refs, names, states, hierarchy | saved 70/98 |
| DevTools `take_snapshot {pageId:1}` before/modal | all 11/5 UIDs | saved 44/20 |
| Playwright `browser_evaluate` wrapped DOM JSON | whole wrapper/DTO preserved | saved 142 |
| Native file read failure (rerun) | preserved exactly | — |
| Playwright `browser_run_code_unsafe` full CDP AX tree (rerun) | every node and field reconstructed | 15814→13653 |
| Playwright `browser_tabs`, `browser_snapshot {depth:1}`, failing `browser_evaluate` (rerun) | preserved exactly | — |

**Re-run on final code (2026-10-11).** Head `c9c3da4` (runtime `src/` unchanged from `utility/integration` `b4d259e`; clean tree), via the versioned bridge `scripts/automatic-browser-host-proof.mjs` (every flag required; one fresh headless browser per case with its own `--user-data-dir` under the artifact root, owned local page at `127.0.0.1`, page state set over CDP, producer attached through `--cdp-endpoint`/`--browserUrl`). Producers: registry `playwright@1.63.0` (`cli.js mcp`, `coreBundle.js` SHA-256 `549070af…` as before) and registry `chrome-devtools-mcp@1.10.1` (lockfile URL/integrity in the receipt), not the earlier emitted source build of `f08dbe1`; browser `chromium_headless_shell-1217` (HeadlessChrome/147.0.7727.15, SHA-256 `a2bc52e9…`). All 9 cases passed on the first attempt, each with two model requests, next request equal to hook output, and the oracle rejecting a tampered view:

| Case | Result | Bytes before → after |
| --- | --- | --- |
| Playwright `browser_snapshot {}` before/modal | all 10/14 refs, 1 root | 743→673, 909→811 |
| DevTools `take_snapshot {pageId:1}` before/modal | all 12/5 UIDs, 1 root | 643→595, 268→248 |
| Playwright `browser_evaluate` wrapped DOM JSON | wrapper exact, every value | 824→686 |
| Playwright `browser_run_code_unsafe` CDP AX tree (34 nodes) | every node and field | 16710→14549 |
| `browser_tabs {action:"list"}`, `browser_snapshot {depth:1}`, failing `browser_evaluate` (e42 marker) | preserved exactly | 205, 536, 507 |

Differences from the earlier builds: the registry DevTools build emits the `StaticText "Details"` row (UID `1_8`) that the source build omitted, so the before view has 12 UIDs, not 11; CDP AX and DOM payload sizes differ because the browser is attached over CDP instead of producer-launched. The harness JSON oracle is now strict and independent of `src/` (`scripts/automatic-json-oracle.mjs`): byte-exact `### Result` wrapper, its own parser (duplicate keys and trailing data rejected, number lexemes and key order kept), and exact decoding of the optional-cell AX table (unique columns, full-length rows, cells of arity 0/1). `tests/automatic-json-oracle.test.ts` covers each rejection; every check was mutation-probed. Re-validation of all 9 stored cases of this run with the strict oracle at `b2efddc` (`--revalidate`, no browser re-run): 9/9 passed, repeated at `0546107` (every text block checked; `--revalidate` fails closed unless every recorded case re-validates): 9/9 passed, both recorded under `revalidations` in the receipt. An earlier run of the same bridge (`browser-run-A2DdmG`, 8/9) lost `dt-modal` when the DevTools server missed OpenCode's MCP connect bound at load average ~180; the bridge now sets `timeout: 60000`. Receipt (local): `/Users/gustavoschneiter/Documents/HuGR/_worktrees/hugr-lean-proof-artifacts/browser/browser-run-BOr35P/receipt.json`.

Limits: explicit host byte-clipping wrapper not induced; Linux/Windows hosts and other OpenCode routes not proven; Linux `ps` grammar not observed natively. Proof harness: `scripts/automatic-host-proof.mjs`; browser bridge: `scripts/automatic-browser-host-proof.mjs`. Artifact roots are local, retained with failures.

## Measurements after merge

**Latency.** The merged plug-and-play head was then benchmarked on GitHub Actions; see [BENCHMARK.md](BENCHMARK.md#automatic-native-views-2026-10-11). Only native grep/glob met the existing p95 budgets; JSON, snapshots, CDP and ps were 2–6× over. Four optimization rounds brought all 17 workloads within budget on Linux, macOS and Windows, for core and adapter alike, without changing any result:
- shared JSON scanner and renderer;
- snapshot reducer;
- JSON/CDP/ps reducers;
- MCP error detection;
- a streaming lexical JSON path with early refusal at the node limit.

Every round passed differential tests against verbatim copies of the previous implementation (a few hundred thousand generated cases per round, including JSON.parse acceptance), mutation probes, and an independent cold review with its own fuzzing (up to 7.9M parser inputs). Every review ended APPROVE. Accepted P3 notes, none of which changes any result:
- On an already refused reduction, the renderer may now throw a different error class or read more required spans before failing. Both callers catch every error and keep the original output.
- Shared formatting piece objects in `auto-json` are frozen.

**Savings in real use.** Recorded OpenCode tool results (the Lean plugin was not installed when they were produced) were replayed locally through the compiled plugin hook. Only aggregates were kept; the raw exports were deleted.

| Set | Results | Bytes | Legacy only | Default (automatic) |
| --- | ---: | ---: | ---: | ---: |
| One long campaign session family | 8,190 | 37.0 MB | 0.0003% | 1.13% |
| Whole local history | 307,681 | 1,444.9 MB | 0.015% | 0.81% |

By tool, over the whole history: glob −36%, grep −6%, bash −0.14%, read −0.02%. Webfetch, skill and task results are never transformed, and file-content reads are excluded by contract. The largest unfiltered volumes are:
- file reads: 669 MB (source and Markdown);
- `git diff`/`git show`: 123 MB;
- `git status`: 47 MB (outside the admitted English long form or behind `cd … &&`);
- `gh run`: 45 MB.

These, not more JSON/snapshot formats, decide real savings.

## Further expansion measured and declined (2026-10-11)

Before building more reducers, candidate families were measured against the same local OpenCode history (1.42–1.44 GB of tool output, Lean not installed; only aggregates kept, raw exports deleted). Eligible means a single command with exit 0 and output not truncated by the host.

| Candidate | Volume | Eligible | Lossless cut | Gain on total |
| --- | ---: | ---: | ---: | ---: |
| `gh run view --log` / `--log-failed` (factor the repeated `JOB\tSTEP` prefix) | 23.3 MB | 7.5 MB | 29% | ~0.15% |
| `gh run watch` (drop superseded status frames) | 7.0 MB | 1.0 MB | ~90% | ~0.06% |
| `git diff` / `git show` (only the reconstructable `diff --git` header) | 124 MB | 45 MB | 1.3% | ~0.04% |
| `git status` | 47 MB | ~2 MB | small | ~0 |
| Identical re-reads, earlier copy still in context | 1.42 GB (all tools) | — | — | 0.6% |
| Repeated numbered lines from partial re-reads (optimistic) | 669 MB (`read`) | — | ~3% of `read` | ~1.5% |

Why the ceiling is low:
- 95% of `git status` and 80% of `git show` volume comes from compound commands whose output mixes producers.
- 68% of `gh run` log volume is truncated by the host before the hook runs.
- Diffs and file reads are evidence.
- Agents rarely re-read identical content; most re-reads follow an edit or use a different range.

Within the current contract (lossless, no command rewriting, only what reaches the hook), the practical ceiling in this usage is about 1.5–2% of tool output. The stakeholder decided to stop expanding compression here. Larger savings would need lossy views with guaranteed recovery, which trade agent quality for savings.

For future context-level work, OpenCode 1.18.17 calls `experimental.chat.messages.transform` on the exact message list of each model request, after compaction and pruning, without persisting changes. That is the safe place for cross-call references (pinned source `anomalyco/opencode@02546df`, `packages/opencode/src/session/prompt.ts`).

## CI

First run [38099473582](https://github.com/gustavomhss/HuGR-Lean/actions/runs/38099473582) on `90f8ef9` failed tests on all three OS (structure/typecheck passed; build, smoke and pack did not run). Causes, all fixed:

- Host-proof harness and unit tests used this machine's temporary directory as a hardcoded root (`mkdtemp` ENOENT on runners); the glob/grep oracle used platform `path.join` (Windows separators); `fixtures/automatic/**` lacked `-text`, so a pinned grep capture hash changed under CRLF checkout.
- The installed default hook compacted three native corpus cases (Playwright/Vitest JSON reporters launched as `node node_modules/...`) that the ledger keeps exact. `node` package CLIs are now refused; a corpus replay through the built default hook matches all 833 goldens.

Before the second run the lead ran the CI test command once locally (1816/1816). Second run [38101414232](https://github.com/gustavomhss/HuGR-Lean/actions/runs/38101414232) on `62d33b2`: Linux and macOS green end to end; Windows passed 1781 tests and failed only the harness SIGTERM test, which relies on POSIX signal handlers and process groups. It is now skipped on win32 with that reason, following the existing `real-capture` precedent; the real host proof is macOS-only by scope. The final run's link and identity receipts are recorded on the delivery PR.
