# B04 Rollup native packet — CAPTUREONLY

Baseline: `71bcaea2d5f0bf72e9128ebf80517ad1099f6cdd`. Branch:
`campaign/native-v2/B04`. Exclusive ownership: `fixtures/profiles/rollup/**`.
Producer: Rollup 4.52.4, actual native CLI, macOS x86_64 merged non-TTY pipe.

All rows declare expected `passthrough` in native-cases/1. Raw bytes live in
exactly one `file` per case; no inline `output` duplicates. Expected golden is
that same exact boundary, including ANSI if present, leading blanks and EOF.
Public-filter execution and runtime acceptance test names: **not run / N/A**,
per capture-only instruction. These declarations are not a filter verification.

| Stable ID | Native variant / combination | Independent required evidence | Raw UTF-8 bytes / exit | Disposition reason |
| --- | --- | --- | --- | --- |
| B04-version | `--version` | `rollup v4.52.4` and final LF | 15 / 0 | No removable material |
| B04-single | Config, single ES file, sourcemap, Unicode/space artifact name | `entry.js → out/artifact space 雪.mjs`; output and map hashes | 87 / 0 | Capture only; config can run user code |
| B04-multiple-chunks | Two entries, ES + CJS output directories, dynamic import, custom hashed entry/chunk names, sourcemaps | Both output directories; twelve archived outputs/maps; source imports and map associations | 77 / 0 | Capture only; no reduction implementation |
| B04-warning | Direct CLI unresolved external warning with successful output | Exact warning title, troubleshooting URL, `b04-absent-dependency`, importer association, output path/hash | 229 / 0 | Warning evidence required; safe layout not implemented |
| B04-circular | Direct CLI circular dependency with successful output | `cycle-a.js -> cycle-b.js -> cycle-a.js`, output path/hash | 132 / 0 | Cycle association required; safe layout not implemented |
| B04-quiet | Config + `--silent`, output and sourcemap still produced | Empty EOF; two artifact hashes independently witness build | 0 / 0 | No removable material |
| B04-quiet-warning | Direct CLI warning + `--silent` | Empty EOF; generated external-import artifact hash | 0 / 0 | No removable material; native flag suppresses warning before capture |
| B04-config-failure | Executed config throws Unicode error | Exact error message and full stack, original path/line references | 1054 / 1 | Failed command exact |
| B04-config-missing | Missing explicit config | Exact resolution message, path and complete stack | 1487 / 1 | Failed command exact |
| B04-syntax-failure | Source syntax error | `syntax.js (1:22)`, source snippet, caret, original messages/help/stack | 2310 / 1 | Failed command exact |
| B04-missing-input | Missing source entry | Exact unresolved-entry message and complete stack | 651 / 1 | Failed command exact |
| B04-stdout-bundle | Direct CLI ES bundle to stdout, merged with native stderr | Complete generated source, Unicode string, export, native banner | 96 / 0 | Source bytes required; no reduction implementation |
| B04-plugin-collision | Actual config plugin stdout during buildStart/generateBundle | Arbitrary Unicode log; duplicate native-shaped banner; forged `created` row; no-LF user bytes joined to native completion | 172 / 0 | Human-approved ambiguity preservation |
| B04-quiet-plugin-collision | Same plugin with `--silent` | Plugin-only banner and forged completion survive silent native reporter; exact no-LF EOF | 111 / 0 | Human-approved ambiguity preservation |

## Producer ambiguity and candidates

`plugin.config.mjs` emits `entry.js → out/single.js...` and
`created out/single.js in 1ms` from real plugin hooks. Those rows have native
progress shape. Normal capture contains native and plugin banners together;
silent capture contains only plugin's native-shaped rows. Shape does not prove
producer identity. Actual CLI supports loading arbitrary executable config.

Apply recorded human scope decision in campaign lines 211–217: ambiguous
plugin/reporter progress stays exact. This approves these two collision cases'
preservation, not deletion, parser stubs, missing native captures, or blanket
completion of all Rollup formats.

Candidate files: none. Proposed deletion: **0 bytes**. Approved savings:
**0 bytes**. Every artifact name, warning, circular association, source token,
diagnostic, stack and user byte remains in raw evidence. No byte-saving claim.
Safe direct-CLI layout work remains unimplemented and outside this capture task.

## Coverage boundary and blockers

Requested finite capture set is present: single/multiple outputs, actual emitted
chunks and artifact names, warnings/circular dependencies, quiet, configuration
failure, syntax/nonzero, arbitrary plugin stdout and native-shaped collision.
No missing capture in that finite set is waived by ambiguity decision.

Independent capture review and lead corpus promotion remain pending. Native
module-to-upstream-commit correspondence is not independently attested; pinned
SRI and npm `gitHead` establish package provenance, not a source-build proof.
Other versions, platforms, TTY/color presentation, watch, custom warning handlers,
plugin ecosystem, Rollup JS API and unbounded option combinations are not claimed.

Wrong framing: “Rollup reduction implemented,” “quiet authenticates progress,”
“no plugin means arbitrary config cannot log,” or “all Rollup variants complete.”
Correct framing: bounded real native evidence, exact ambiguity preservation,
zero reduction, ready for independent capture review only.
