# Structured-output wave: frozen execution contract

Base: `db767483c06b57614fbed6c3fe7f70ae810e46a4` (`utility/integration`). One small TypeScript package; five existing modules. No host execution or I/O in core/profiles. No existing shell grammar changes. Explicit format opt-in; failed, unknown, incomplete or unsupported inputs preserve original. UTF-16 source spans; UTF-8 size metrics. No donor material.

## Reviewed scope

The repository currently adapts only bash. New structured API/CLI and caller-declared tool bindings are needed, rather than pretending system/accessibility integrations already exist. A schema below is a HuGR-Lean interchange contract, not a claim of native compatibility with CDP, AT-SPI, macOS or a third-party MCP tool. Binding requires a producer returning that contract and authentic complete/success metadata. System process tables additionally accept the exact documented native ps format.

All reducers have signature `StructuredReducer` from `src/core/structured-types.ts`. Export a named reducer from the assigned leaf file; return a `Reduction` with source spans and fixed formatting. Use `parseJson`, `fields`, `scalar`, `compactPieces`, `valueSpans` in `src/core/structured-json.ts`. Unknown object fields and duplicate keys refuse semantic projection. No unbounded recursion, arbitrary text deduplication, inferred completion, fabricated counts or command rewriting. Tests may inject reducers into `filterStructured` before the registry is wired.

Output formats are deliberate model-visible views, not transparent JSON replacements for downstream software. JSON cells keep their original escaped lexemes. TSV-style output uses only tab/newline formatting; missing optional fields use `-`, distinct from JSON null. Required evidence must include all retained meaningful values and references.

## Fixed work packages (12 concurrent agents)

Each owns only its named source, its named test, and optional `fixtures/structured/<id>/` with provenance. Lead owns registry, core facade, package exports, shared types/helpers and shared docs. Agent 11 owns existing CLI/OpenCode integration files exclusively. Agent 12 owns public conformance tests and user manual. No agent edits another worktree. Each branch must push its first compiling commit; no merge. Full-suite execution stays with CI; local focused tests only. Mutation-probe one preservation behavior, observe failure, restore and rerun.

| ID | Source ownership | Test ownership | Contract |
|---|---|---|---|
| 01 | `src/profiles/structured-json.ts` | `tests/structured-json.test.ts` | `reduceJson`: valid JSON lossless lexical whitespace compact; preserve numbers, strings, key ordering |
| 02 | `src/profiles/structured-table.ts` | `tests/structured-table.test.ts` | `reduceTable`: exact object `{columns: string[], rows: scalar[][]}`; unique nonempty columns, equal widths, all rows preserved |
| 03 | `src/profiles/structured-progress.ts` | `tests/structured-progress.test.ts` | `reduceProgress`: schema below; retain final progress and all result/warning/diagnostic events |
| 04 | `src/profiles/structured-processes.ts` | `tests/structured-processes.test.ts` | `reduceProcesses`: JSON rows or exact `ps -axo pid,ppid,stat,comm` header/rows; all processes retained |
| 05 | `src/profiles/structured-files.ts` | `tests/structured-files.test.ts` | `reduceFiles`: exact file records below; all paths and metadata retained, including Unicode and symlink targets |
| 06 | `src/profiles/structured-windows.ts` | `tests/structured-windows.test.ts` | `reduceWindows`: exact window records; IDs, app/title, focus/state and geometry retained |
| 07 | `src/profiles/structured-events.ts` | `tests/structured-events.test.ts` | `reduceEvents`: ordered records; exact contiguous identical tuples may use one `=` line per repeated occurrence; no guessed aggregate count |
| 08 | `src/profiles/structured-accessibility.ts` | `tests/structured-accessibility.test.ts` | `reduceAccessibility`: full validated flat tree to compact node rows; all refs/parents and semantic fields retained; wrapper verbosity reduced, no node deletion |
| 09 | `src/profiles/structured-accessibility-properties.ts` | `tests/structured-accessibility-properties.test.ts` | `reduceAccessibilityProperties`: same tree, JSON view; omit only empty optional actions/states/description whose omitted semantics are explicitly empty |
| 10 | `src/profiles/structured-accessibility-scope.ts` | `tests/structured-accessibility-scope.test.ts` | `reduceAccessibilityScope`: same tree, explicit scopeRef; retain selected subtree, full ancestor nodes and all focused/modal nodes with ancestry |
| 11 | `src/cli/index.ts`, `src/opencode/index.ts`, `src/opencode/config.ts` | `tests/structured-adapters.test.ts` | CLI `filter --format FORMAT [--scope-ref REF]`; shell mode still requires --command; declared tool bindings below |
| 12 | none | `tests/structured-public.test.ts` | public API/CLI conformance; `docs/STRUCTURED-TOOLS.md`; native ps capture if available, explicitly labeled synthetic fixtures elsewhere |

## Schemas

Record views (`processes`, `files`, `windows`, `events`) receive JSON arrays of objects. Object keys must follow the fixed schema order and have identical field sets across records; optional fields may be absent from all rows. Empty arrays pass through. Header uses original source key lexemes once; every row preserves original scalar/array/object value lexemes (compact nested values allowed with all scalar evidence). No row truncation or selection.

- processes: required `pid` nonnegative safe integer, `ppid` same, `state` nonempty string, `command` nonempty string. No other keys.
- files: required `path` string, `type` one of file/directory/symlink; optional `size` nonnegative safe integer, `modified` string, `target` string (symlinks require target). No other keys.
- windows: required `id` string, `app` string, `title` string, `focused` boolean, `bounds` four finite numbers; optional `state` string array. No other keys.
- events: required `time` string or finite number, `level` string, `source` string, `message` string; optional `details` any JSON. Unknown fields refuse. `=` denotes one exact repetition of the previous complete row, including time/details; never coalesce different timestamps or changed payloads.

Progress: `{schema:"hugr-lean/progress-v1",events:[...]}`. Event is either `{kind:"progress",current:integer,total:integer,unit:string}` or `{kind:"result"|"warning"|"diagnostic",message:string}`. One unit per capture, stable positive total, nondecreasing current in 0..total. Final progress must equal total and at least one result must exist. Preserve all non-progress events intact, keep last progress; emit original schema/envelope and remaining events in original order. Unknown kind/field, contradictory total or partial completion refuses.

Accessibility: `{schema:"hugr-lean/a11y-v1",root:string,nodes:[...]}`. Node required fields `ref:string`, `parent:string|null`, `role:string`, `name:string`; optional `states:string[]`, `actions:string[]`, `value:scalar`, `bounds:[number,number,number,number]`, `description:string`. IDs unique; one root with null parent; all parents exist; no cycles; every node connected to root. Preserve stable refs and relationships, all states/actions/value/bounds, descriptions except the explicitly empty optional property view. Unknown fields refuse. Empty `states`, `actions`, `description` are equivalent to omission only in the properties view; `value:""`, false and zero are never defaults to discard. Scoped view stays JSON and explicitly adds `scope` with the original matched ref lexeme; schema/root remain; selected nodes stay in original order with parents retained. Scope selection keeps focused nodes with ancestry and COMPLETE modal subtrees with ancestry, including outside selected subtree. Missing/stale scope refuses. No native GUI access or action tools added.

## Adapter contract

`PluginOptions.structuredTools?: readonly {tool:string;format:StructuredFormat}[]`. Unique nonempty tool names, never `bash`. Unknown format/option refuses config. No default bindings. Runtime recognizes exact declared tool name, string `output.output`, `metadata.exit===0`, `metadata.truncated===false`. `scopeRef` is read only from `input.args.scopeRef` for accessibility-scope. Preserve metadata/title/args and failed output. Reuse raw persistence behavior. CLI adds `--format` and `--scope-ref`; structured mode rejects `--command` and `--terminal-rendered`, requires valid format, scope only for scoped accessibility; all original streaming/UTF-8/failure behavior stays intact.

## Verification and return card

Focused tests cover accepted input and meaningful preservation/refusal cases. Unicode/surrogates, unknown fields, changed payloads, nonzero/incomplete metadata, malformed/truncated JSON, and invalid/stale refs are relevant where applicable. Agent returns only: branch, commit(s), intended file list, named test commands/results, mutation observed red/restored green, known blockers, and "what did framing get wrong?". No full transcript. Independent cold review precedes final PR. CI workflow remains unchanged; one dispatch on the integrated candidate, inspect all three OS lanes and identity receipts. Stop for lead review; never merge.

Review corrections: exact decimal integer validation prevents rounded fractional PIDs/progress; required evidence must be emitted intact rather than merely covered by rearranged spans; termination facts are read once; off-scope modal descendants remain accessible. Shared integer validation adapted internally from `src/profiles/structured-files.ts` at `1d28291eb6e8872738dc81dc03163228712d646d` (MIT), changed to return the validated number for progress/process reuse. No external donor copied.
