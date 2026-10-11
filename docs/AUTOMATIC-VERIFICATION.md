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

Limits: explicit host byte-clipping wrapper not induced; Linux/Windows hosts and other OpenCode routes not proven; Linux `ps` grammar not observed natively. Proof harness: `scripts/automatic-host-proof.mjs`; operational bridges and artifact roots are local temporary files, retained with failures.

## CI

First run [38099473582](https://github.com/gustavomhss/HuGR-Lean/actions/runs/38099473582) on `90f8ef9` failed tests on all three OS (structure/typecheck passed; build, smoke and pack did not run). Causes, all fixed:

- Host-proof harness and unit tests used this machine's temporary directory as a hardcoded root (`mkdtemp` ENOENT on runners); the glob/grep oracle used platform `path.join` (Windows separators); `fixtures/automatic/**` lacked `-text`, so a pinned grep capture hash changed under CRLF checkout.
- The installed default hook compacted three native corpus cases (Playwright/Vitest JSON reporters launched as `node node_modules/...`) that the ledger keeps exact. `node` package CLIs are now refused; a corpus replay through the built default hook matches all 833 goldens.

Before the second run the lead ran the CI test command once locally (1816/1816). Second run [38101414232](https://github.com/gustavomhss/HuGR-Lean/actions/runs/38101414232) on `62d33b2`: Linux and macOS green end to end; Windows passed 1781 tests and failed only the harness SIGTERM test, which relies on POSIX signal handlers and process groups. It is now skipped on win32 with that reason, following the existing `real-capture` precedent; the real host proof is macOS-only by scope. The final run's link and identity receipts are recorded on the delivery PR.
